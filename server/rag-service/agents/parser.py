# server/rag-service/agents/parser.py
# ParserNode — primeiro nó do StateGraph.
# Recebe mensagem bruta do usuário e extrai estrutura:
#   { cliente: {...}, produtos: [{query, dims, tecido, ...}], contexto_bando, finalizar }
# Usa regras determinísticas (regex) + fallback LLM leve quando regex falha.

from __future__ import annotations

import re
import json
from typing import TypedDict, Optional


class ItemExtraido(TypedDict, total=False):
    query: str           # texto do produto para RAG
    dims_largura: Optional[float]
    dims_altura: Optional[float]
    tecido: Optional[str]    # blackout, screen, solflex
    modelo: Optional[str]    # rolo, romana, painel
    tipo: Optional[str]      # cortina, persiana, toldo
    com_bando: bool
    qtd: int


class MensagemEstruturada(TypedDict, total=False):
    cliente_nome: Optional[str]
    cliente_telefone: Optional[str]
    cliente_endereco: Optional[str]
    itens: list[ItemExtraido]
    finalizar: bool
    mensagem_livre: str  # o que sobrou após extração (vai para o LLM se precisar)


# =============================================================================
# REGEX
# =============================================================================

DIM_RE = re.compile(
    r"(\d+[,.]?\d*)\s*[xX×]\s*(\d+[,.]?\d*)"
)
TEL_RE = re.compile(r"(?<!\d)(\d{10,11})(?!\d)")
END_RE = re.compile(
    r"(?:alameda|rua|av\.?|avenida|travessa|r\.|rod\.)\s+"
    r"([A-Za-zÀ-Üà-ü][\wÀ-Üà-ü\s]*?\s+\d{1,5})",
    re.IGNORECASE
)
MODELO_RE = re.compile(
    r"\b(rolo|rol[ôo]|roma|romana|vertical|horizontal|plissada|painel|bambu)\b", re.IGNORECASE
)
TECIDO_RE = re.compile(
    r"\b(blackout|screen|solflex|tela\s*solar|transl[úu]cida|semi|vision|classic|wave)\b",
    re.IGNORECASE
)
TELA_SOLAR_RE = re.compile(r"tela[s]?\s*solar|solar\s*tela", re.IGNORECASE)
TIPO_RE = re.compile(
    r"\b(cortina|persiana|persianas|tela|mosquiteiro|toldo|blackout)\b",
    re.IGNORECASE,
)
# Padrões especiais que têm prioridade sobre o tipo genérico
TIPO_ESPECIAL_RE = re.compile(
    r"\b(wave|double\s*vision|new\s*vision|screen|solflex|sun\s*shut|shut?ter|"
    r"plissada|painel|bambu|romana|vertical|horizontal)\b",
    re.IGNORECASE,
)
BANDO_RE = re.compile(r"\bband[ôo]\b", re.IGNORECASE)
CODIGO_RE = re.compile(r"[a-zA-Z]*\d[\w\-\.]+", re.IGNORECASE)
FINALIZAR_RE = re.compile(
    r"(?:finaliz[aeo]r?|salvar|fechar|encerrar|grav[aeo]r?|confirma[r]?|pronto|"
    r"pode\s+(?:salvar|fechar)|est[áa]\s+(?:bom|ok|certo))",
    re.IGNORECASE,
)


def _match_nome_apos(msg_limpa: str) -> Optional[str]:
    """Extrai nome do cliente, evitando palavras de produto."""
    bloqueadas = {
        "para", "com", "sem", "do", "da", "de", "no", "na", "cortina", "persiana",
        "rolo", "rolô", "blackout", "bandô", "bando", "tubo", "mais", "barato",
        "barata", "menor", "preco", "modelo", "tela", "solar", "persianas",
        "orcamento", "orçamento", "cliente",
    }
    m = re.search(
        r"(?:para|cliente|senhor[as]?)\s+(?:o\s+|a\s+)?"
        r"([A-Za-zÀ-Üà-ü]+(?:\s+[A-Za-zÀ-Üà-ü]+){1,4})",
        msg_limpa, re.IGNORECASE,
    )
    if not m:
        m = re.search(
            r"\b([A-Za-zÀ-Üà-ü]{3,}(?:\s+[A-Za-zÀ-Üà-ü]{3,}){1,4})\b",
            msg_limpa,
        )
    if not m:
        return None
    palavras = [
        w for w in m.group(1).split(" ")
        if w.lower() not in bloqueadas and len(w) >= 3
    ]
    if len(palavras) < 2:
        return None
    return " ".join(p.capitalize() for p in palavras)


def parse(message: str) -> MensagemEstruturada:
    """Extrai entidades determinísticas da mensagem do usuário."""
    msg = message.strip()

    # 0) Finalizar?
    finalizar = bool(FINALIZAR_RE.search(msg))

    # 1) Telefone
    tel_m = TEL_RE.search(msg)
    cliente_telefone = tel_m.group(1) if tel_m else None

    # 2) Endereço
    end_m = END_RE.search(msg)
    cliente_endereco = end_m.group(0).strip() if end_m else None

    # 3) Nome (em msg limpa)
    msg_clean = TEL_RE.sub("", msg)
    if cliente_endereco:
        msg_clean = re.sub(
            r"(?:alameda|rua|av\.?|avenida|travessa|r\.|rod\.)\s+"
            r"[A-Za-zÀ-Üà-ü][\wÀ-Üà-ü\s]*?\s+\d{1,5}",
            "", msg_clean, flags=re.IGNORECASE,
        )
    msg_clean = DIM_RE.sub("", msg_clean)
    msg_clean = re.sub(r"\d+[,.]?\d*\s*m(?:etros?)?", "", msg_clean, flags=re.IGNORECASE)
    msg_clean = re.sub(r"\d+", "", msg_clean)

    cliente_nome = _match_nome_apos(msg_clean)

    # 4) Detectar se há item de produto (keywords de produto/tecido/modelo)
    tem_produto = bool(
        TIPO_RE.search(msg) or MODELO_RE.search(msg) or TECIDO_RE.search(msg) or CODIGO_RE.search(msg)
    )

    itens: list[ItemExtraido] = []

    if tem_produto:
        # Dimensões
        dim_m = DIM_RE.search(msg)
        largura = float(dim_m.group(1).replace(",", ".")) if dim_m else None
        altura = float(dim_m.group(2).replace(",", ".")) if dim_m else None

        # Tecido / modelo / tipo
        modelo_m = MODELO_RE.search(msg)
        modelo = modelo_m.group(1) if modelo_m else None
        if modelo and modelo.lower() == "rolo":
            modelo = "Rolô"

        tem_tela_solar = bool(TELA_SOLAR_RE.search(msg))

        tecido_m = TECIDO_RE.search(msg)
        tecido = tecido_m.group(1).replace(" ", "") if tecido_m else None
        if tem_tela_solar and not tecido:
            tecido = "screen"
        if tecido:
            tecido = tecido.lower()

        # Tipo: padrão especial (wave, screen, etc.) tem prioridade sobre "cortina"
        tipo_esp_m = TIPO_ESPECIAL_RE.search(msg)
        if tipo_esp_m:
            tipo = tipo_esp_m.group(1).capitalize()
        else:
            tipo_m = TIPO_RE.search(msg)
            tipo = tipo_m.group(1).capitalize() if tipo_m else None

        com_bando = bool(BANDO_RE.search(msg))

        # Query para RAG = frase de produto (sem cliente/dimensões/endereço)
        query_rag = msg
        if cliente_endereco:
            query_rag = re.sub(
                r"(?:alameda|rua|av\.?|avenida|travessa|r\.|rod\.)\s+"
                r"[A-Za-zÀ-Üà-ü][\wÀ-Üà-ü\s]*?\s+\d{1,5}",
                "", query_rag, flags=re.IGNORECASE,
            )
        query_rag = TEL_RE.sub("", query_rag)
        query_rag = DIM_RE.sub("", query_rag)
        query_rag = re.sub(
            r"\b(?:orcamento|orçamento|cliente|para\s+\w+|com\s+telefone)\b",
            "", query_rag, flags=re.IGNORECASE,
        )
        query_rag = " ".join(query_rag.split()).strip()

        item: ItemExtraido = {
            "query": query_rag,
            "dims_largura": largura,
            "dims_altura": altura,
            "tecido": tecido,
            "modelo": modelo,
            "tipo": tipo,
            "com_bando": com_bando,
            "qtd": 1,
        }
        itens.append(item)

    return MensagemEstruturada(
        cliente_nome=cliente_nome,
        cliente_telefone=cliente_telefone,
        cliente_endereco=cliente_endereco,
        itens=itens,
        finalizar=finalizar,
        mensagem_livre=msg,
    )
