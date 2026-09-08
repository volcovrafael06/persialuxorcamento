# server/rag-service/agents/search.py
# SearchNode — busca híbrida (FAISS semântico por categoria + ILIKE exato).
# Detecta categoria (rolo, screen, wave...) e usa índice FAISS específico.

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from agents.parser import ItemExtraido
from tools.product_tools import detecta_categoria


# Modelos conflitantes: se o usuário pediu X, NÃO trazer Y
MODELOS_CONFLITANTES = {
    "rolo": ["plissada", "vertical", "horizontal", "romana", "painel"],
    "rolô": ["plissada", "vertical", "horizontal", "romana", "painel"],
    "roma": ["plissada", "rolo", "vertical"],
    "vertical": ["rolo", "rolô", "plissada"],
    "horizontal": ["rolo", "rolô", "plissada"],
    "plissada": ["rolo", "rolô"],
    "painel": ["rolo", "rolô", "plissada"],
}


def _tem_outro_modelo(nome: str, produto: str, modelo_campo: str, excluido: str) -> bool:
    """Retorna True se o produto tem um modelo diferente do solicitado."""
    if excluido not in MODELOS_CONFLITANTES:
        return False
    texto = " ".join([nome or "", produto or "", modelo_campo or ""]).lower()
    for outro in MODELOS_CONFLITANTES[excluido]:
        if outro in texto:
            return True
    return False


@dataclass
class SearchResult:
    """Resultado de busca validado."""
    produtos: list[dict]
    acessorios: list[dict]
    estrategia: str  # 'faiss', 'ilike', 'hybrid'
    query_usada: str


def hybrid_search(item: ItemExtraido, tools: dict, top_k: int = 5) -> SearchResult:
    """Faz busca híbrida e aplica pós-filtros determinísticos."""

    query = item.get("query") or ""
    modelo_alvo = (item.get("modelo") or "").lower().replace("ô", "o") if item.get("modelo") else None
    tecido_alvo = (item.get("tecido") or "").lower() if item.get("tecido") else None
    com_bando = item.get("com_bando", False)

    # Detecta categorias candidatas da query
    cats = detecta_categoria(item.get("query") or "")
    categoria = cats[0] if cats else None

    # 1) Busca semântica via FAISS em TODAS as categorias detectadas
    all_faiss: list[dict] = []
    for cat in cats:
        r = tools["search_products"].invoke({
            "query": query,
            "top_k": top_k * 2,
            "categoria": cat
        })
        if isinstance(r, list):
            all_faiss.extend(r)
    # Dedupe por id
    seen_ids = set()
    produtos_sem = []
    for p in all_faiss:
        if isinstance(p, dict) and p.get("id") and p["id"] not in seen_ids:
            seen_ids.add(p["id"])
            produtos_sem.append(p)

    # 2) Busca exata por código/nome (ILIKE) — complemento
    produtos_exatos = tools["search_by_code_or_name"].invoke({"query": query, "top_k": top_k})
    if not isinstance(produtos_exatos, list):
        produtos_exatos = []

    # 3) Merge + dedupe (prioriza exatos)
    seen = set()
    merged = []
    for p in (produtos_exatos + produtos_sem):
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        merged.append(p)

    # 4) PÓS-FILTRO determinístico
    filtrados = []
    for p in merged:
        nome = (p.get("nome") or "").lower()
        prod_campo = (p.get("produto") or p.get("produto_text") or "").lower()
        modelo_campo = (p.get("modelo") or "").lower()
        tecido_campo = (p.get("tecido") or "").lower()

        # Filtro por modelo (semântico + literal)
        if modelo_alvo:
            alvo_lower = modelo_alvo.lower()
            # Precisa ter o modelo solicitado
            if alvo_lower not in nome and alvo_lower not in prod_campo and alvo_lower not in modelo_campo:
                continue
            # NÃO pode ter modelo conflitante
            if _tem_outro_modelo(p.get("nome", ""), p.get("produto", ""), p.get("modelo", ""), alvo_lower):
                continue

        # Filtro por tecido
        if tecido_alvo:
            if tecido_alvo not in nome and tecido_alvo not in tecido_campo:
                # "tela solar" e "telasolar" são screen/solflex
                if tecido_alvo in ("screen", "telasolar", "tela solar"):
                    if "solflex" not in nome and "screen" not in nome:
                        continue
                else:
                    continue

        filtrados.append(p)
        if len(filtrados) >= top_k:
            break

    # Fallback: se não sobrou nenhum, relaxa filtro de modelo (mas mantém tecido)
    if not filtrados and merged:
        for p in merged:
            nome = (p.get("nome") or "").lower()
            tecido_campo = (p.get("tecido") or "").lower()
            if tecido_alvo and tecido_alvo not in nome and tecido_alvo not in tecido_campo:
                continue
            filtrados.append(p)
            if len(filtrados) >= top_k:
                break

    # 5) Acessórios (incluindo bandô se solicitado)
    acessorios = []
    if com_bando:
        acessorios = tools["search_accessories"].invoke({"query": "bandô", "top_k": 3})

    return SearchResult(
        produtos=filtrados,
        acessorios=acessorios if isinstance(acessorios, list) else [],
        estrategia="hybrid" if produtos_sem and produtos_exatos else (
            "faiss" if produtos_sem else "ilike"
        ),
        query_usada=query,
    )
