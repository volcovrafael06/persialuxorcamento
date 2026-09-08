# server/rag-service/tools/product_tools.py
# LangChain Tools usados pelo SearchAgent.
# Busca semântica usa índices FAISS por CATEGORIA (detecção automática por query).

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

import faiss
import numpy as np
from dotenv import load_dotenv
from langchain_core.tools import tool
from supabase import create_client

from embeddings import embed, cosine_sim


FAISS_DIR = Path(os.getenv("FAISS_DIR", "/var/lib/persialux/faiss"))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


# Cache em memória dos índices (carregados lazy)
_index_cache: dict[str, tuple[faiss.Index, list[dict]]] = {}


# ─────────────────────────────────────────────────────────────────────────────
# MAPEAMENTO QUERY → CATEGORIA
# ─────────────────────────────────────────────────────────────────────────────

# Mapa de palavras-chave (em minúsculo) → nome do índice FAISS
CATEGORIA_KEYWORDS: list[tuple[str, list[str]]] = [
    ("produtos_rolo",       ["rolo", "rolô", "cortina rolo", "cort rolo"]),
    ("produtos_screen",     ["screen", "tela solar", "telas solar", "solflex", "tela 5", "tela 3", "tela 1"]),
    ("produtos_wave",       ["wave", "cortina wave", "soft wave"]),
    ("produtos_vertical",   ["vertical", "persiana vertical"]),
    ("produtos_horizontal", ["horizontal", "persiana horizontal", "ph ", "ph-", "persiana 25mm", "persiana 50mm"]),
    ("produtos_sunshut",    ["sun shut", "sunshut", "shutter"]),
    ("produtos_romana",     ["romana", "cortina romana"]),
    ("produtos_plissada",   ["plissada", "plisada", "easy up"]),
    ("produtos_painel",     ["painel", "painéis"]),
    ("produtos_bambu",      ["bambu", "bambú"]),
    ("produtos_toldo",      ["toldo", "toldo articulado", "toldo retrátil"]),
    ("produtos_doublevision",["double vision", "doublevision"]),
    ("produtos_newvision",  ["new vision", "newvision"]),
    ("produtos_decorado",   ["decorado", "voal decorado"]),
    ("produtos_blackout",   ["blackout", "bk ", "ultra blackout"]),
    ("produtos_translucida",["translúcida", "translucida"]),
    ("produtos_cortina",    ["cortina", "cort ", "cort."]),
]


def detecta_categoria(query: str) -> list[str]:
    """Detecta categorias candidatas a partir das palavras da query."""
    q = query.lower()
    candidatas = []
    for cat, keywords in CATEGORIA_KEYWORDS:
        for kw in keywords:
            if kw in q:
                candidatas.append(cat)
                break
    return candidatas


def _is_linha_de_grupo(p: dict) -> bool:
    """True se a linha é uma 'linha de grupo' (não produto vendável)."""
    nome = (p.get("nome") or "").strip()
    # Começa com "Gerais", "Acionamento", "Duplex", "Com motor", etc.
    return bool(
        re.match(r"^Gerais?\s*[-—]", nome) or
        re.match(r"^Acionamento\s+", nome) or
        re.match(r"^Duplex\s+", nome, re.IGNORECASE) or
        re.match(r"^Com\s+motor", nome, re.IGNORECASE) or
        re.match(r"^Semi\s+", nome, re.IGNORECASE) or
        re.match(r"^Manual\s+", nome, re.IGNORECASE)
    )


def _filtrar_linhas_grupo(prods: list[dict]) -> list[dict]:
    """Remove linhas de grupo da lista de resultados."""
    return [p for p in prods if not _is_linha_de_grupo(p)]


def _base_query(sb, top_k: int):
    """Query base com filtro: só produtos (não acessórios), ou seja,
    produtos com 'produto' IS NOT NULL."""
    return (
        sb.from_("produtos")
        .select("id, codigo, nome, preco_venda, modelo, tecido, metodo_calculo, area_minima")
        .filter("produto", "not.is.null", "")
        .limit(top_k)
    )


def _load_index(entity: str) -> tuple[faiss.Index, list[dict]]:
    """Carrega índice FAISS + metadata em memória (uma vez por processo)."""
    if entity in _index_cache:
        return _index_cache[entity]

    index_path = FAISS_DIR / entity / "index.faiss"
    meta_path = FAISS_DIR / entity / "meta.json"

    # Tenta índice específico, senão fallback default
    if not index_path.exists():
        if entity != "produtos_default":
            return _load_index("produtos_default")
        raise FileNotFoundError(
            f"Índice FAISS não encontrado em {index_path}. Rode: python indexer.py"
        )

    index = faiss.read_index(str(index_path))
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    _index_cache[entity] = (index, meta["metas"])
    return _index_cache[entity]


def _search_faiss(query: str, entity: str, top_k: int = 10, threshold: float = 0.20):
    """Busca top-k similares no índice FAISS."""
    try:
        index, metas = _load_index(entity)
    except FileNotFoundError:
        return []
    q_vec = np.array([embed(query)], dtype="float32")
    scores, ids = index.search(q_vec, top_k)

    results = []
    for score, idx in zip(scores[0], ids[0]):
        if idx < 0 or score < threshold:
            continue
        meta = dict(metas[idx])
        meta["score"] = float(score)
        results.append(meta)
    return _filtrar_linhas_grupo(results)


def _supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")
    return create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )


# =============================================================================
# LANGCHAIN TOOLS
# =============================================================================


@tool
def search_products(query: str, top_k: int = 5, categoria: str | None = None) -> list[dict]:
    """Busca produtos no catálogo por descrição semântica.

    Detecta automaticamente a categoria (rolo, screen, wave, vertical, etc.)
    e usa o índice FAISS específico para melhores resultados.

    Parâmetros:
      query: descrição do produto (ex: 'cortina rolo blackout', 'tela solar 5%')
      top_k: número de resultados (default 5)
      categoria: força uma categoria específica (opcional)
    """
    # 1) Detecta categorias candidatas
    cats = [categoria] if categoria else detecta_categoria(query)

    results_by_cat: dict[str, list[dict]] = {}

    # 2) Busca em cada índice de categoria
    for cat in cats:
        try:
            r = _search_faiss(query, cat, top_k=top_k, threshold=0.20)
            if r:
                results_by_cat[cat] = r
        except FileNotFoundError:
            pass

    # 3) Se encontrou em categoria específica, retorna só dela (mais preciso)
    if results_by_cat and cats:
        # Usa a primeira categoria que retornou resultados
        for cat in cats:
            if cat in results_by_cat and results_by_cat[cat]:
                return results_by_cat[cat]

    # 4) Fallback: busca no índice default (todos os produtos)
    try:
        return _search_faiss(query, "produtos_default", top_k=top_k, threshold=0.25)
    except FileNotFoundError:
        return [{"error": f"Índice FAISS não encontrado. Rode python indexer.py"}]



def _search_ilike(q: str, sb, top_k: int = 5) -> list[dict]:
    """Busca ILIKE com a query completa E com palavras-chave individuais.
    Inclui mapeamento de sinônimos (ex: "tela solar" → "solflex", "screen").
    CÓDIGOS (XXX-YY, MOT-XXX) são extraídos e buscados diretamente no campo codigo.
    """
    seen_ids: set[str] = set()
    all_results: list[dict] = []

    q_lower = q.lower().strip()

    # --- 1) Extrai códigos (padrão XXX-YY, MOT-XXX, XX.YY, etc.) para busca exata ---
    # Captura sequências tipo "120-02", "259-08", "MOT-220", "00.01"
    # Que aparecem isoladas ou como palavras completas
    # Extrai códigos via split: tokens >= 3 chars com dígito E traço/ponto
    # Ex: "120-02", "259-08", "MOT-220" mas não "tela solar 5%"
    tokens = re.split(r'[\s\.\,\(\)\/]+', q_lower)
    codigos_limpos: list[str] = [
        tok for tok in tokens
        if len(tok) >= 3 and re.search(r'\d', tok) and re.search(r'[\-\.]', tok)
    ]

    # --- 2) Monta termos para busca semântica (query sem os códigos extraídos) ---
    termos: set[str] = set()

    # Query sem os códigos → depois remove dígitos para sinônimos
    q_sem_codigos = q_lower
    for cod in codigos_limpos:
        q_sem_codigos = q_sem_codigos.replace(cod, " ")

    # Termos da query limpa (sem dígitos, sem conectores)
    q_sem_digitos = re.sub(r"[\d%]+", " ", q_sem_codigos).strip()
    if q_sem_digitos:
        termos.add(q_sem_digitos)

    # Sinônimos baseados na query limpa
    PADROES_PARA_SINONIMOS: dict[str, list[str]] = {
        "tela solar": ["solflex", "screen", "tela solar"],
        "screen":     ["solflex", "screen"],
        "solflex":    ["solflex", "screen"],
    }
    for padrao, sinonimos in PADROES_PARA_SINONIMOS.items():
        if padrao in q_sem_digitos:
            termos.update(sinonimos)

    # Divide em palavras (sem dígitos)
    q_words = q_sem_digitos.split()
    conectores = {"para", "com", "sem", "que", "mais", "barato", "barata", "uma", "um"}
    for word in q_words:
        if word in PADROES_PARA_SINONIMOS:
            termos.update(PADROES_PARA_SINONIMOS[word])
        elif len(word) >= 3 and word not in conectores:
            termos.add(word)

    # --- 3) Monta filtro OR: códigos no campo codigo, termos em todos campos ---
    FIELDS = ["nome", "produto", "modelo"]
    or_parts: list[str] = []

    # Códigos → busca parcial/ilike no campo codigo
    for codigo in codigos_limpos:
        or_parts.append(f"codigo.ilike.%{codigo}%")

    # Termos semânticos → busca em nome/produto/modelo
    for termo in termos:
        if termo.strip():
            for f in FIELDS:
                or_parts.append(f"{f}.ilike.%{termo}%")

    or_filter = ",".join(or_parts)

    resp = (
        sb.from_("produtos")
        .select("id, codigo, nome, preco_venda, modelo, tecido, metodo_calculo, area_minima")
        .filter("produto", "not.is.null", "")
        .or_(or_filter)
        .limit(top_k * 8)
        .execute()
    )

    seen_ids: set[str] = set()
    all_results: list[dict] = []
    for p in resp.data or []:
        pid = p.get("id") or ""
        if pid not in seen_ids and not _is_linha_de_grupo(p):
            seen_ids.add(pid)
            all_results.append(p)

    return all_results[:top_k]
@tool
def search_by_code_or_name(query: str, top_k: int = 10) -> list[dict]:
    """Busca exata por código, nome, produto ou modelo (ILIKE).
    Use quando o usuário informar código (ex: '259-08', 'MOT-220').
    Retorna SOMENTE produtos reais (produto IS NOT NULL) — exclui acessórios.
    Exclui também linhas de grupo (Gerais, Acionamento, Duplex...).
    """
    sb = _supabase()
    try:
        q = query.strip()
        return _search_ilike(q, sb, top_k)
    except Exception as e:
        return [{"error": str(e)}]


@tool
def get_product_by_id(product_id: str) -> dict | None:
    """Busca produto específico por ID."""
    sb = _supabase()
    try:
        resp = (
            sb.from_("produtos")
            .select("*")
            .eq("id", product_id)
            .limit(1)
            .execute()
        )
        result = (resp.data or [None])[0]
        if result and _is_linha_de_grupo(result):
            return None
        return result
    except Exception as e:
        return {"error": str(e)}


@tool
def search_accessories(query: str, top_k: int = 5) -> list[dict]:
    """Busca acessórios (motor, trilho, suporte, bandô) por nome/descrição."""
    try:
        return _search_faiss(query, "acessorios", top_k=top_k, threshold=0.25)
    except FileNotFoundError:
        return [{"error": "Índice de acessórios não encontrado"}]


@tool
def get_cheapest_product(filter_codes: list[str] | None = None) -> dict | None:
    """Retorna o produto mais barato. Se filter_codes for passado, filtra por códigos."""
    sb = _supabase()
    try:
        q = sb.from_("produtos").select(
            "id, codigo, nome, preco_venda, produto, modelo, tecido, metodo_calculo, area_minima"
        ).filter("produto", "not.is.null", "")
        if filter_codes:
            codes_str = ",".join(filter_codes)
            q = q.or_(f"codigo.in.({codes_str})")
        q = q.order("preco_venda", desc=False).limit(10)
        resp = q.execute()
        candidatas = [p for p in (resp.data or []) if not _is_linha_de_grupo(p)]
        return candidatas[0] if candidatas else None
    except Exception as e:
        return {"error": str(e)}


ALL_TOOLS = [
    search_products,
    search_by_code_or_name,
    get_product_by_id,
    search_accessories,
    get_cheapest_product,
]
