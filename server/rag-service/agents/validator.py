# server/rag-service/agents/validator.py
# ValidateNode — recebe candidatos do SearchNode e decide qual é o match correto.
# Usa heurísticas determinísticas primeiro; se houver ambiguidade, usa LLM leve (Ollama).

from __future__ import annotations

import re
from typing import Optional

from agents.search import SearchResult
from agents.parser import ItemExtraido


def _numeric_score(prod: dict, item: ItemExtraido) -> float:
    """Score determinístico baseado em matches de campos."""
    score = 0.0
    nome = (prod.get("nome") or "").lower()
    codigo = (prod.get("codigo") or "").lower()
    modelo = (prod.get("modelo") or "").lower()
    tecido = (prod.get("tecido") or "").lower()

    # Match exato de código é o melhor sinal
    if codigo and codigo in item.get("query", "").lower():
        score += 5.0

    # Match por modelo solicitado
    modelo_alvo = (item.get("modelo") or "").lower()
    if modelo_alvo:
        if modelo_alvo in modelo:
            score += 2.0
        if modelo_alvo in nome:
            score += 1.5

    # Match por tecido solicitado
    tecido_alvo = (item.get("tecido") or "").lower()
    if tecido_alvo:
        if tecido_alvo in tecido:
            score += 2.0
        if tecido_alvo in nome:
            score += 1.0
        # "screen" → aceita "solflex"
        if tecido_alvo == "screen" and "solflex" in nome:
            score += 1.0

    # Tipo (cortina/persiana)
    tipo_alvo = (item.get("tipo") or "").lower()
    if tipo_alvo and tipo_alvo in nome:
        score += 1.0

    # Bonus do score semântico original (se FAISS retornou)
    if "score" in prod:
        score += prod["score"] * 2.0

    return score


def validate(item: ItemExtraido, search_result: SearchResult) -> Optional[dict]:
    """Decide qual produto é o match correto. Retorna None se nada serve."""
    candidatos = search_result.produtos

    if not candidatos:
        return None

    # Rerank determinístico por score combinado
    scored = [(_numeric_score(p, item), p) for p in candidatos]
    scored.sort(key=lambda x: x[0], reverse=True)

    best_score, best_prod = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0

    # Código exato → aceita direto
    codigo = (best_prod.get("codigo") or "").lower()
    if codigo and codigo in (item.get("query", "") or "").lower():
        return best_prod

    # Score muito alto (>= 3.0) E único candidato → aceita direto
    if best_score >= 3.0 and len(candidatos) == 1:
        return best_prod

    # "mais barato" → escolhe o mais barato entre os melhores scores
    query_lower = (item.get("query") or "").lower()
    if "mais barato" in query_lower or "mais barata" in query_lower:
        barato = min(scored[:3], key=lambda x: float(x[1].get("preco_venda") or 1e9))
        return barato[1]

    # Com apenas 1 candidato E score baixo (< 3.0): retorna None para forçar escolha
    if len(candidatos) == 1 and best_score < 3.0:
        return None

    # Caso padrão: retorna o melhor-ranked para o graph decidir precisa_escolha
    return best_prod
