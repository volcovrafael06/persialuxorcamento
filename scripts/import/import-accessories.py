#!/usr/bin/env python3
"""
Importador de ACESSÓRIOS (Trilhos + Motorização) → tabela `public.accessories`.

Schema alvo:
  id           uuid pk
  name         varchar NOT NULL
  unit         varchar NOT NULL
  colors       jsonb NULL DEFAULT '[]'::jsonb
  created_at   timestamptz
  updated_at   timestamptz

Uso:
  python3 import-accessories.py --dry-run
  python3 import-accessories.py --apply
  python3 import-accessories.py --sheet "Motorização Persol"
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable

try:
    import openpyxl
except ImportError:
    print("ERRO: pip install --break-system-packages openpyxl")
    sys.exit(2)

try:
    import requests
except ImportError:
    print("ERRO: pip install --break-system-packages requests")
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XLSM = Path("/home/claude/Área de trabalho/Tabela Montadora Persol (11 set 2025).xlsm")
ENV_LOCAL = REPO_ROOT / ".env.local"


# ----------------------------- helpers ----------------------------- #

def br_num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace(".", "").replace(",", ".")
    try: return float(s)
    except: return None


def extract_cod(text):
    if not text or not isinstance(text, str): return None
    m = re.search(r"\((\d{2,4})\)\s*$", text.strip())
    return m.group(1).zfill(3) if m else None


def clean_name(text):
    if not text or not isinstance(text, str): return ""
    return re.sub(r"\s*\(\d{2,4}\)\s*$", "", text).strip()


def load_env(path):
    if not path.exists(): return {}
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"): continue
        if "=" not in line: continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


# ----------------------------- extractors ----------------------------- #

def extract_motorizacao(ws, marca: str) -> list[dict]:
    """Motorização Persol/Somfy — uma linha = um motor.

    Layout: col A = numeração, col B = nome, col H/I/J = Larg/Alt/Área máx
    (texto), col K = valor (Persol) OU col L = valor (Somfy).
    """
    rows = []
    secao_atual = "Receptor"
    for r in range(5, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        c = ws.cell(row=r, column=1).value
        # Tenta valor em col 12 primeiro (Persol), depois col 11 (Somfy)
        valor = br_num(ws.cell(row=r, column=12).value)
        if valor is None or valor <= 0:
            valor = br_num(ws.cell(row=r, column=11).value)
        if isinstance(b, str) and b.strip() in ("Receptor", "Wi-Fi", "Standard", "Bateria"):
            secao_atual = b.strip()
            continue
        if not isinstance(b, str) or not isinstance(c, (int, float)):
            continue
        if valor is None or valor <= 0:
            continue
        # Remove prefixo duplicado "Mot. X - " se já existir
        nome_base = b.strip()
        if nome_base.lower().startswith(f"mot. {marca.lower()} - "):
            nome_base = nome_base[len(f"Mot. {marca} - "):]
        nome = f"{marca} {nome_base}"
        # Coleta dimensões em col H, I, J
        larg = ws.cell(row=r, column=8).value
        alt = ws.cell(row=r, column=9).value
        area = ws.cell(row=r, column=10).value
        rows.append({
            "name": nome,
            "unit": "pç",
            "colors": json.dumps([], ensure_ascii=False),
            "_secao": secao_atual,
            "_valor": valor,
            "_largura_max": larg,
            "_altura_max": alt,
            "_area_max": area,
        })
    return rows


def extract_trilho_motor(ws, marca: str) -> list[dict]:
    """Trilho Motorizado (Persol/Somfy) — pega apenas o preço base (1 metro).

    Col A = numeração, col B = descrição da faixa de medida,
    col D/I = preços por tipo de motor (Standard/Receptor/Wi-Fi).
    """
    rows = []
    # Encontra o preço "base" — geralmente a primeira faixa (até 1.00m)
    for r in range(6, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        c = ws.cell(row=r, column=1).value
        if not isinstance(b, str) or not isinstance(c, (int, float)):
            continue
        if "0," not in b and "0." not in b:
            continue
        # Achar o primeiro preço numérico nas colunas D/I (motor types)
        preco_base = None
        tipo_motor = "Trilho Motorizado"
        for col in [4, 6, 8, 10]:
            v = br_num(ws.cell(row=r, column=col).value)
            if v and v > 100:
                preco_base = v
                tipo_motor = f"Trilho {marca} - {ws.cell(row=5, column=col).value or 'Motor'}"
                break
        if preco_base is None:
            continue
        rows.append({
            "name": f"{tipo_motor} - {b.strip()} (preço base)",
            "unit": "pç",
            "colors": json.dumps([], ensure_ascii=False),
            "_valor": preco_base,
        })
    return rows


def extract_trilhos_completos(ws) -> list[dict]:
    """Trilhos Completos Cortinas — pega o preço de 1 metro de cada modelo.

    Layout: nome do trilho (col A), linha "MEDIDA" (col A="MEDIDA", col B+ = 0.5, 1, 1.5, ...),
    linha "R$" (col A="R$", col B+ = preços).
    """
    rows = []
    for r in range(5, ws.max_row + 1):
        a = ws.cell(row=r, column=1).value
        if a == "MEDIDA":
            # Encontra o nome do trilho: linha imediatamente acima (após linha vazia)
            # Padrão: nome em R8, MEDIDA em R9, R$ em R10
            for offset in [1, 2, 3]:
                nome_row = r - offset
                nome = ws.cell(row=nome_row, column=1).value
                if isinstance(nome, str) and nome.strip() and nome.strip() != "MEDIDA":
                    break
            else:
                continue
            # A linha +1 tem os preços
            r_preco = r + 1
            if ws.cell(row=r_preco, column=1).value != "R$":
                continue
            # pega o preço de 1 metro (coluna 3 — valor "1" na linha MEDIDA)
            valor_1m = br_num(ws.cell(row=r_preco, column=3).value)
            if valor_1m is None or valor_1m <= 0:
                continue
            rows.append({
                "name": nome.strip() + " - 1 metro",
                "unit": "ml",
                "colors": json.dumps([], ensure_ascii=False),
                "_valor": valor_1m,
            })
    return rows


# ----------------------------- main ----------------------------- #

def make_db_row(item: dict) -> dict:
    """Converte para o schema 'accessories'."""
    row = {
        "name": item["name"],
        "unit": item["unit"],
        "colors": item.get("colors", "[]"),
    }
    return row


def get_all_sheets():
    return list(SHEET_EXTRACTORS.keys())


def get_extractor(name):
    return SHEET_EXTRACTORS[name]


SHEET_EXTRACTORS: dict[str, Callable] = {
    "Motorização Persol": lambda ws: extract_motorizacao(ws, "Persol"),
    "Motorização Somfy": lambda ws: extract_motorizacao(ws, "Somfy"),
    "Trilho Motor Cort Persol": lambda ws: extract_trilho_motor(ws, "Persol"),
    "Trilho Motor Cort Somfy": lambda ws: extract_trilho_motor(ws, "Somfy"),
    "Trilhos Completos Cortinas": extract_trilhos_completos,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sheet", help="Importa apenas esta sheet")
    ap.add_argument("--xlsm", default=str(DEFAULT_XLSM))
    ap.add_argument("--dump-codes", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        print("Sheets com extractor:")
        for s in get_all_sheets():
            print(f"  - {s}")
        return 0

    print("=" * 70)
    print(f"PERSIALUX IMPORTADOR ACESSORIOS v0.1  —  {'APLICAR' if args.apply else 'DRY-RUN'}")
    print("=" * 70)

    if not Path(args.xlsm).exists():
        print(f"ERRO: {args.xlsm}", file=sys.stderr)
        return 4

    wb = openpyxl.load_workbook(args.xlsm, data_only=True, keep_vba=False)

    sheets = get_all_sheets()
    if args.sheet:
        if args.sheet not in SHEET_EXTRACTORS:
            print(f"ERRO: '{args.sheet}' não tem extractor")
            return 5
        sheets = [args.sheet]

    all_items = []
    for sheet in sheets:
        extractor = get_extractor(sheet)
        ws = wb[sheet]
        items = extractor(ws)
        print(f"\n[{'APPLY' if args.apply else 'DRY'}] {sheet}: {len(items)} itens")
        for item in items[:3]:
            valor = item.get("_valor", "?")
            print(f"  - {item['name']:<55}  R$ {valor}  ({item['unit']})")
        if len(items) > 3:
            print(f"  ... +{len(items)-3} mais")
        for item in items:
            all_items.append(make_db_row(item))

    print(f"\nTOTAL: {len(all_items)} acessórios em {len(sheets)} sheets")

    if args.dump_codes:
        for r in all_items:
            print(json.dumps(r, ensure_ascii=False))
        return 0

    if not args.apply:
        print("\n[DRY-RUN] primeiros 10:")
        for r in all_items[:10]:
            print(f"  {json.dumps(r, ensure_ascii=False)}")
        return 0

    # --apply via MCP ou PostgREST
    env = load_env(ENV_LOCAL)
    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERRO: SUPABASE_URL/SERVICE_KEY", file=sys.stderr)
        return 6

    print(f"\nAplicando {len(all_items)} inserts em 'accessories'...")
    endpoint = f"{url}/rest/v1/accessories"
    headers = {
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for i in range(0, len(all_items), 100):
        batch = all_items[i:i+100]
        r = requests.post(endpoint, headers=headers,
                          params={"on_conflict": "name"},
                          data=json.dumps(batch), timeout=30)
        if r.status_code >= 300:
            print(f"  ERRO {i+1}-{i+len(batch)}: {r.status_code}: {r.text[:200]}", file=sys.stderr)
            return 7
        print(f"  OK {i+1}-{i+len(batch)}/{len(all_items)}")
    print(f"\n  {len(all_items)} upserts aplicados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
