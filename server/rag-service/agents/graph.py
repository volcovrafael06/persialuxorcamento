# server/rag-service/agents/graph.py
# StateGraph LangGraph — orquestra o pipeline:
#   parse -> search -> validate -> finalize
#
# Estado:
#   {
#     "mensagem_original": str,
#     "parsed": MensagemEstruturada,
#     "search_result": SearchResult,
#     "produto_escolhido": dict | None,
#     "precisa_escolha": bool,
#     "opcoes": list,
#     "resposta": dict,
#   }

from __future__ import annotations

from langgraph.graph import StateGraph, END
from langgraph.constants import Send
from typing import TypedDict, Optional, Any

from agents.parser import parse as parser_parse, MensagemEstruturada
from agents.search import hybrid_search
from agents.validator import validate
from tools.product_tools import ALL_TOOLS


class GrafoEstado(TypedDict, total=False):
    mensagem_original: str
    parsed: MensagemEstruturada
    tools: dict
    search_result: Any   # SearchResult
    produto_escolhido: Optional[dict]
    precisa_escolha: bool
    opcoes: list
    resposta: dict


# =============================================================================
# NODES — cada node retorna dict parcial (padrão LangGraph 1.x)
# =============================================================================


def node_parse(state: GrafoEstado) -> dict:
    parsed = parser_parse(state["mensagem_original"])
    return {"parsed": parsed}


def node_search(state: GrafoEstado) -> dict:
    parsed = state.get("parsed") or {}
    tools = state.get("tools") or {}

    if not parsed.get("itens"):
        return {"search_result": None, "produto_escolhido": None,
                "precisa_escolha": False, "opcoes": []}

    item = parsed["itens"][0]
    result = hybrid_search(item, tools)
    return {"search_result": result}


def node_validate(state: GrafoEstado) -> dict:
    parsed = state.get("parsed") or {}
    sr = state.get("search_result")

    if not parsed.get("itens") or not sr or not sr.produtos:
        return {"produto_escolhido": None, "precisa_escolha": False, "opcoes": []}

    item = parsed["itens"][0]
    chosen = validate(item, sr)

    if chosen is None and len(sr.produtos) == 1:
        # Só 1 candidato mas o validator não aceitou → força escolha
        return {"produto_escolhido": None, "precisa_escolha": True,
                "opcoes": sr.produtos[:5]}

    if chosen is None:
        return {"produto_escolhido": None, "precisa_escolha": False, "opcoes": []}

    # Se tinha múltiplos candidatos, calcula ambiguidade
    if len(sr.produtos) == 1:
        # Mesmo com 1 candidato, força escolha se não é código exato
        codigo = (chosen.get("codigo") or "").lower()
        query = (item.get("query") or "").lower()
        if codigo and codigo in query:
            return {"produto_escolhido": chosen, "precisa_escolha": False, "opcoes": []}
        return {"produto_escolhido": None, "precisa_escolha": True,
                "opcoes": sr.produtos[:5]}

    # Verifica se o score do top-2 é muito menor que top-1
    sorted_prods = sorted(sr.produtos, key=lambda p: p.get("score", 0), reverse=True)
    if len(sorted_prods) > 1:
        top1 = sorted_prods[0].get("score", 0)
        top2 = sorted_prods[1].get("score", 0)
        if top2 < top1 * 0.6:
            return {"produto_escolhido": chosen, "precisa_escolha": False, "opcoes": []}

    # Ambíguo — pede escolha
    return {"produto_escolhido": chosen, "precisa_escolha": True,
            "opcoes": sr.produtos[:5]}


def node_finalize(state: GrafoEstado) -> dict:
    parsed = state.get("parsed") or {}
    sr = state.get("search_result")
    escolhido = state.get("produto_escolhido")
    opcoes = state.get("opcoes") or []
    # Protege contra itens vazio (nenhum produto detectado na mensagem)
    itens = parsed.get("itens") or []
    item = itens[0] if itens else {}

    # Calcula subtotal (só se temos item E dimensões E produto)
    subtotal = 0.0
    if escolhido and item.get("dims_largura") and item.get("dims_altura"):
        preco = float(escolhido.get("preco_venda") or 0)
        metodo = (escolhido.get("metodo_calculo") or "m2").lower()
        area = item["dims_largura"] * item["dims_altura"]
        area_min = float(escolhido.get("area_minima") or 0)
        if metodo in ("ml", "linear"):
            subtotal = item["dims_largura"] * preco
        else:
            subtotal = max(area, area_min) * preco

    resposta = {
        "cliente": {
            "nome": parsed.get("cliente_nome"),
            "telefone": parsed.get("cliente_telefone"),
            "endereco": parsed.get("cliente_endereco"),
        },
        "item": {
            "produto": escolhido,
            "precisa_escolha": state.get("precisa_escolha", False),
            "opcoes": [
                {
                    "id": o.get("id"),
                    "nome": o.get("nome"),
                    "codigo": o.get("codigo"),
                    "preco_venda": o.get("preco_venda"),
                    "score": o.get("score"),
                }
                for o in opcoes
            ],
            "query": item.get("query"),
            "dims": {
                "largura": item.get("dims_largura"),
                "altura": item.get("dims_altura"),
            },
            "tecido": item.get("tecido"),
            "modelo": item.get("modelo"),
            "tipo": item.get("tipo"),
            "com_bando": item.get("com_bando", False),
            "subtotal": round(subtotal, 2),
        },
        "acessorios": sr.acessorios if sr else [],
        "finalizar": parsed.get("finalizar", False),
        "estrategia_busca": sr.estrategia if sr else "none",
    }
    return {"resposta": resposta}


# =============================================================================
# GRAFO
# =============================================================================


def build_graph():
    g = StateGraph(GrafoEstado)
    g.add_node("parse", node_parse)
    g.add_node("search", node_search)
    g.add_node("validate", node_validate)
    g.add_node("finalize", node_finalize)

    g.set_entry_point("parse")
    g.add_edge("parse", "search")
    g.add_edge("search", "validate")
    g.add_edge("validate", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


_graph_singleton = None


def get_graph():
    global _graph_singleton
    if _graph_singleton is None:
        _graph_singleton = build_graph()
    return _graph_singleton


async def arun(mensagem: str) -> dict:
    """Entry point async."""
    graph = get_graph()
    state_inicial: GrafoEstado = {
        "mensagem_original": mensagem,
        "tools": {t.name: t for t in ALL_TOOLS},
    }
    final = await graph.ainvoke(state_inicial)
    return final.get("resposta", {})


def run_sync(mensagem: str) -> dict:
    """Entry point sync (para testes / FastAPI sync route)."""
    graph = get_graph()
    state_inicial: GrafoEstado = {
        "mensagem_original": mensagem,
        "tools": {t.name: t for t in ALL_TOOLS},
    }
    final = graph.invoke(state_inicial)
    return final.get("resposta", {})
