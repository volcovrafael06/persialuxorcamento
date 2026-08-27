#!/usr/bin/env python3
"""
Persialux Orçamentos — Importador de produtos (Tabela Montadora Persol → Supabase).

Uso:
  python3 import-products.py --dry-run                  # apenas mostra o que será feito
  python3 import-products.py --apply --sheet Rolô       # aplica apenas uma sheet
  python3 import-products.py --apply                    # aplica todas as sheets alvo
  python3 import-products.py --help                     # ajuda

Variáveis de ambiente (em .env.local na raiz do repo):
  SUPABASE_URL              ex: https://ozxpdccutroxtjqcpjea.supabase.co
  SUPABASE_SERVICE_KEY      service_role key (NÃO commitar)

Por padrão, --dry-run não precisa de credenciais.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    import openpyxl
except ImportError:
    print("ERRO: instale openpyxl: pip install --break-system-packages openpyxl")
    sys.exit(2)

try:
    import requests
except ImportError:
    print("ERRO: instale requests: pip install --break-system-packages requests")
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_XLSM = Path("/home/claude/Área de trabalho/Tabela Montadora Persol (11 set 2025).xlsm")
ENV_LOCAL = REPO_ROOT / ".env.local"
ENV_EXAMPLE = REPO_ROOT / ".env.example"

# Limites máximos por tubo de Rolô (do cabeçalho "até X,XX larg" da planilha).
# Esses valores são fixos na planilha e definem a largura máxima da peça acabada
# que cada tubo aceita. Cada variação (tubo) usa o seu.
TUBO_MAX_LARGURA = {32: 1.80, 38: 2.40, 45: 2.80, 55: 3.00}

PRODUTO_FIELD_DEFAULTS = {
    "metodo_calculo": "m2",
    "margem_lucro": 100,
    "altura_minima": 0.5,
    "largura_minima": 0.5,
    "area_minima": 1.5,
}


# ----------------------------- helpers ----------------------------- #

def br_num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def extract_cod(text: str | None) -> str | None:
    """Extrai o código entre parênteses no fim do nome, ex: 'Açores (057)' -> '057'."""
    if not text or not isinstance(text, str):
        return None
    m = re.search(r"\((\d{2,4})\)\s*$", text.strip())
    return m.group(1).zfill(3) if m else None


def clean_name(text: str | None) -> str:
    if not text or not isinstance(text, str):
        return ""
    return re.sub(r"\s*\(\d{2,4}\)\s*$", "", text).strip()


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def require_creds(apply_mode: bool) -> tuple[str | None, str | None]:
    env = load_env_file(ENV_LOCAL)
    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or env.get("SUPABASE_SERVICE_KEY")
    if apply_mode and (not url or not key):
        print("ERRO: --apply requer SUPABASE_URL e SUPABASE_SERVICE_KEY.", file=sys.stderr)
        print("  Copie .env.example para .env.local e preencha, ou exporte as variáveis.", file=sys.stderr)
        sys.exit(3)
    return url, key


# ----------------------------- extractors ----------------------------- #
# Cada sheet tem seu próprio layout. O extractor recebe o worksheet e
# devolve uma lista de dicts já no formato de produtos.


@dataclass
class ProductRow:
    nome: str
    codigo: str
    produto: str
    modelo: str
    tecido: str
    preco_venda: float
    preco_custo: float | None = None
    largura_minima: float | None = None
    altura_minima: float | None = None
    largura_maxima: float | None = None
    area_minima: float | None = None
    metodo_calculo: str = "m2"
    margem_lucro: float = 100
    notes: str = ""

    def to_db_row(self, margem_lucro_global: float) -> dict:
        """Converte para o schema 'produtos'.

        Convenção adotada: o `preco_venda` da planilha (m²) é o nosso **custo** de
        aquisição. O `preco_venda` final é custo × (1 + margem/100).
        """
        margem = self.margem_lucro if self.margem_lucro is not None else margem_lucro_global
        custo = round(self.preco_venda, 2)
        venda = round(custo * (1 + margem / 100), 2)
        row = {
            "nome": self.nome,
            "codigo": self.codigo,
            "produto": self.produto,
            "modelo": self.modelo,
            "tecido": self.tecido,
            "preco_custo": custo,
            "preco_venda": venda,
            "margem_lucro": margem,
            "metodo_calculo": self.metodo_calculo,
        }
        if self.preco_custo is not None:
            row["preco_custo"] = round(self.preco_custo, 2)
        for f in ("largura_minima", "altura_minima", "largura_maxima", "area_minima"):
            v = getattr(self, f)
            if v is not None:
                row[f] = v
        return row


def extract_pv_tecido(ws) -> list[ProductRow]:
    """PV Tecido e PVC 90mm — 1 preço (m²). Sem código em todas as linhas; quando ausente,
    geramos um slug a partir do nome. Categoria visual (TRANSLÚCIDAS/BLACKOUT) vem do
    bloco de seção acima (col B em linhas ímpares anteriores)."""
    rows: list[ProductRow] = []
    current_cat: str | None = None
    counter = 0
    for r in range(5, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        if isinstance(b, str) and b.strip().upper() in ("TRANSLÚCIDAS", "TRANSLÚCIDO", "BLACKOUT", "PVC", "TECIDOS", "TECIDO"):
            current_cat = b.strip().title()
            continue
        if not isinstance(b, str) or not b.strip():
            continue
        valor = br_num(ws.cell(row=r, column=10).value)
        if valor is None:
            continue
        codigo_extraido = extract_cod(b)
        # Se não tem codigo, gera um slug do nome + contador por categoria.
        # IMPORTANTE: codigo composto inclui a categoria para evitar colisão entre
        # tecidos homônimos em categorias diferentes (ex: Europa em Translúcidas
        # vs. Europa em Blackout).
        if codigo_extraido:
            codigo = f"{codigo_extraido}-{current_cat[:3].upper() if current_cat else 'GER'}"
        else:
            slug = re.sub(r"[^A-Za-z0-9]+", "", b).upper()[:6]
            counter += 1
            codigo = f"PV-{current_cat[:3].upper() if current_cat else 'GER'}-{slug}-{counter:03d}"
        rows.append(ProductRow(
            nome=clean_name(b),
            codigo=codigo,
            produto="Persiana Vertical",
            modelo=current_cat or "Tecido",
            tecido=clean_name(b),
            preco_venda=valor,
        ))
    return rows


def extract_ph_unified(ws, produto_label: str, modelo_label: str) -> list[ProductRow]:
    """Persiana Horizontal — subgrupos na col B em linhas pares; dados nas ímpares seguintes.
    Sem código por linha — geramos código composto."""
    rows: list[ProductRow] = []
    current_sub: str | None = None
    counter = 0
    for r in range(5, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        c = ws.cell(row=r, column=3).value
        # subgrupo: linha em que col B tem texto, col A vazio, col B contém mm ou categoria
        if isinstance(b, str) and b.strip() and (ws.cell(row=r, column=1).value in (None, "")) \
                and not br_num(ws.cell(row=r, column=9).value):
            current_sub = b.strip()
            continue
        if not isinstance(b, str) or not b.strip():
            continue
        valor = br_num(ws.cell(row=r, column=9).value)
        if valor is None:
            continue
        counter += 1
        codigo = f"PH-{modelo_label[:3].upper()}-{counter:03d}"
        nome_completo = f"{current_sub} — {b.strip()}" if current_sub else b.strip()
        rows.append(ProductRow(
            nome=nome_completo,
            codigo=codigo,
            produto=produto_label,
            modelo=modelo_label,
            tecido=b.strip(),
            preco_venda=valor,
            notes=(c or "") if isinstance(c, str) else "",
        ))
    return rows


def extract_rolo(ws) -> list[ProductRow]:
    """Rolô — 4 preços por tubo (32/38/45/55). Achatamos em 4 produtos por linha.

    Largura máxima por tubo (em metros) vem de TUBO_MAX_LARGURA.
    Largura do rolo de tecido vem da col 8 da planilha e vai para `notes`.
    """
    rows: list[ProductRow] = []
    current_cat = "Screen"
    for r in range(7, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        # detecta mudança de seção (SCREEN / BLACKOUT / DV / NEW VISION etc) na col B
        if isinstance(b, str) and b.strip().isupper() and not extract_cod(b):
            current_cat = b.strip().title()
            continue
        if not isinstance(b, str) or not extract_cod(b):
            continue
        codigo = extract_cod(b)
        tecido_largura = br_num(ws.cell(row=r, column=8).value)  # largura do rolo de tecido
        for col, tubo in [(10, 32), (11, 38), (12, 45), (13, 55)]:
            valor = br_num(ws.cell(row=r, column=col).value)
            if valor is None:
                continue
            rows.append(ProductRow(
                nome=f"{clean_name(b)} Tubo {tubo}",
                codigo=f"{codigo}-{tubo}",
                produto="Cortina Rolô",
                modelo=f"Tubo {tubo}",
                tecido=current_cat,
                preco_venda=valor,            # este é o custo (planilha)
                largura_maxima=TUBO_MAX_LARGURA[tubo],  # máx por tubo
                notes=f"tecido_largura={tecido_largura}" if tecido_largura else "",
            ))
    return rows


def extract_romana(ws) -> list[ProductRow]:
    """Romana — 5 preços (Tradicional/Cascade/Teto Bastão/Teto Monocorr/Sky Light).

    Largura máxima por linha vem de "Larg. Tec." (col 6) — mesmo valor para todas
    as 5 variações (a planilha não distingue por variação).
    """
    rows: list[ProductRow] = []
    modelos = [(7, "Tradicional"), (8, "Cascade"), (9, "Teto Bastão"),
               (10, "Teto Monocorrente"), (11, "Sky Light")]
    for r in range(8, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        if not isinstance(b, str) or not extract_cod(b):
            continue
        codigo = extract_cod(b)
        largura_tecido = br_num(ws.cell(row=r, column=6).value)
        for col, modelo in modelos:
            valor = br_num(ws.cell(row=r, column=col).value)
            if valor is None or valor <= 0:
                continue
            rows.append(ProductRow(
                nome=f"{clean_name(b)} {modelo}",
                codigo=f"{codigo}-{modelo[:3].upper().replace(' ', '')}",
                produto="Cortina Romana",
                modelo=modelo,
                tecido="Screen",
                preco_venda=valor,
                largura_maxima=largura_tecido,
                notes=f"tecido_largura={largura_tecido}" if largura_tecido else "",
            ))
    return rows


def extract_painel(ws) -> list[ProductRow]:
    """Painel — 2 preços (Sem Corda / Com Corda). Sem coluna de largura na planilha."""
    rows: list[ProductRow] = []
    for r in range(7, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        if not isinstance(b, str) or not extract_cod(b):
            continue
        codigo = extract_cod(b)
        sem = br_num(ws.cell(row=r, column=10).value)
        com = br_num(ws.cell(row=r, column=11).value)
        for valor, modelo, suf in [(sem, "Sem Corda", "SC"), (com, "Com Corda", "CC")]:
            if valor is None or valor <= 0:
                continue
            rows.append(ProductRow(
                nome=f"{clean_name(b)} {modelo}",
                codigo=f"{codigo}-{suf}",
                produto="Cortina Painel",
                modelo=modelo,
                tecido="Screen",
                preco_venda=valor,
            ))
    return rows


def extract_plissada(ws) -> list[ProductRow]:
    """Plissada e Celular — preço Standard (m²), flag BLACKOUT, Larg. Tec. e Larg. Emenda."""
    rows: list[ProductRow] = []
    current_cat = "Plissada"
    for r in range(7, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        c = ws.cell(row=r, column=3).value
        if isinstance(b, str) and b.strip() in ("PLISSADA", "CELULAR"):
            current_cat = b.strip().title()
            continue
        if not isinstance(b, str) or not extract_cod(b):
            continue
        is_blackout = isinstance(c, str) and c.strip().upper() == "BLACKOUT"
        largura_tecido = br_num(ws.cell(row=r, column=6).value)
        largura_emenda = br_num(ws.cell(row=r, column=8).value)
        valor = br_num(ws.cell(row=r, column=9).value)
        if valor is None or valor <= 0:
            continue
        codigo = extract_cod(b)
        notes_parts = []
        if largura_emenda:
            notes_parts.append(f"largura_emenda={largura_emenda}")
        if largura_tecido:
            notes_parts.append(f"tecido_largura={largura_tecido}")
        rows.append(ProductRow(
            nome=clean_name(b),
            codigo=codigo,
            produto=f"Cortina {current_cat}",
            modelo="Blackout" if is_blackout else current_cat,
            tecido=clean_name(b),
            preco_venda=valor,
            largura_maxima=largura_tecido,
            notes="; ".join(notes_parts),
        ))
    return rows


def extract_bambu(ws) -> list[ProductRow]:
    """Bambu — 4 preços (Rolô/Romana/Monocorrente/Painel). Sem coluna de largura."""
    rows: list[ProductRow] = []
    modelos = [(7, "Rolô", "RO"), (8, "Romana", "RM"),
               (9, "Monocorrente", "MC"), (10, "Painel", "PN")]
    for r in range(8, ws.max_row + 1):
        b = ws.cell(row=r, column=2).value
        if not isinstance(b, str) or not extract_cod(b):
            continue
        codigo = extract_cod(b)
        for col, modelo, suf in modelos:
            valor = br_num(ws.cell(row=r, column=col).value)
            if valor is None or valor <= 0:
                continue
            rows.append(ProductRow(
                nome=f"{clean_name(b)} {modelo}",
                codigo=f"{codigo}-{suf}",
                produto="Cortina Bambu",
                modelo=modelo,
                tecido="Bambu",
                preco_venda=valor,
            ))
    return rows


# ----------------------------- main ----------------------------- #

SHEET_EXTRACTORS: dict[str, Callable] = {
    "PV Tecido e PVC": (extract_pv_tecido, "Persiana Vertical"),
    "PH 16 e 25": (lambda ws: extract_ph_unified(ws, "Persiana Horizontal", "16/25"), None),
    "PH 50 e 63": (lambda ws: extract_ph_unified(ws, "Persiana Horizontal", "50/63"), None),
    "Rolô": (extract_rolo, None),
    "Romana": (extract_romana, None),
    "Painel": (extract_painel, None),
    "Plissada e Celular": (extract_plissada, None),
    "Bambu": (extract_bambu, None),
    # Demais: vertical wave, toldos, demais cortinas, tela mosquiteira
    # — ainda não mapeadas. Adicione aqui quando prontas.
}


def upsert_supabase(url: str, key: str, table: str, rows: list[dict],
                    on_conflict: str = "codigo") -> dict:
    """PostgREST upsert em lote. Retorna {status, count, error?}."""
    endpoint = f"{url}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": f"resolution=merge-duplicates,return=minimal",
    }
    last_err = None
    # lote de 100
    for i in range(0, len(rows), 100):
        batch = rows[i:i + 100]
        params = {"on_conflict": on_conflict}
        r = requests.post(endpoint, headers=headers, params=params,
                          data=json.dumps(batch), timeout=30)
        if r.status_code >= 300:
            last_err = f"{r.status_code}: {r.text[:500]}"
            return {"status": "error", "count": i, "error": last_err}
    return {"status": "ok", "count": len(rows)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Importador Tabela Montadora Persol → Supabase")
    ap.add_argument("--apply", action="store_true",
                    help="Aplica no Supabase (default: dry-run)")
    ap.add_argument("--sheet", help="Importa apenas esta sheet")
    ap.add_argument("--xlsm", default=str(DEFAULT_XLSM),
                    help="Caminho da planilha")
    ap.add_argument("--dry-run", action="store_true",
                    help="(alias do default; apenas imprime o que seria feito)")
    ap.add_argument("--dump-codes", action="store_true", help="Imprime todos os codigos gerados, um por linha")
    ap.add_argument("--list", action="store_true",
                    help="Lista sheets com extractor disponível e sai")
    ap.add_argument("--margem", type=float, default=PRODUTO_FIELD_DEFAULTS["margem_lucro"],
                    help=f"Margem de lucro padrão (default: {PRODUTO_FIELD_DEFAULTS['margem_lucro']}%)")
    ap.add_argument("--area-minima", type=float, default=PRODUTO_FIELD_DEFAULTS["area_minima"],
                    help=f"Área mínima padrão em m² (default: {PRODUTO_FIELD_DEFAULTS['area_minima']})")
    args = ap.parse_args()

    if args.list:
        print("Sheets com extractor:")
        for s in SHEET_EXTRACTORS:
            print(f"  - {s}")
        print("\nSheets da planilha ainda SEM extractor (precisam ser mapeadas):")
        try:
            wb_tmp = openpyxl.load_workbook(args.xlsm, data_only=True, keep_vba=False)
            for s in wb_tmp.sheetnames:
                if s not in SHEET_EXTRACTORS:
                    print(f"  - {s}")
        except Exception as e:
            print(f"  (não consegui abrir a planilha: {e})")
        return 0

    print("=" * 70)
    print(f"PERSIALUX IMPORTADOR v0.1  —  {'APLICAR' if args.apply else 'DRY-RUN'}")
    print(f"  Planilha: {args.xlsm}")
    print(f"  Env file: {ENV_LOCAL} ({'presente' if ENV_LOCAL.exists() else 'AUSENTE'})")
    print("=" * 70)

    url, key = require_creds(args.apply)

    if not Path(args.xlsm).exists():
        print(f"\nERRO: planilha não encontrada: {args.xlsm}", file=sys.stderr)
        return 4

    wb = openpyxl.load_workbook(args.xlsm, data_only=True, keep_vba=False)

    sheets = list(SHEET_EXTRACTORS.keys())
    if args.sheet:
        if args.sheet not in SHEET_EXTRACTORS:
            print(f"ERRO: sheet '{args.sheet}' não tem extractor. Opções:")
            for s in SHEET_EXTRACTORS:
                print(f"  - {s}")
            return 5
        sheets = [args.sheet]

    total_rows = 0
    db_rows_all: list[dict] = []

    for sheet in sheets:
        extractor, _ = SHEET_EXTRACTORS[sheet]
        ws = wb[sheet]
        t0 = time.time()
        products = extractor(ws)
        dt = time.time() - t0
        total_rows += len(products)

        print(f"\n[{'APPLY' if args.apply else 'DRY'}] {sheet}: {len(products)} produtos extraídos ({dt:.2f}s)")
        for p in products[:5]:
            print(f"  - {p.codigo:<22}  {p.nome[:55]:<55}  R$ {p.preco_venda:>8.2f}  ({p.modelo})")
        if len(products) > 5:
            print(f"  ... +{len(products) - 5} mais")

        for p in products:
            db_rows_all.append(p.to_db_row(margem_lucro_global=args.margem))

    print(f"\n{'=' * 70}")
    print(f"TOTAL: {total_rows} produtos em {len(sheets)} sheets")
    print(f"{'=' * 70}")

    if args.dump_codes:
        for r in db_rows_all:
            print(json.dumps(r, ensure_ascii=False))
        return 0

    if not args.apply:
        print("\n[DRY-RUN] primeiros 10 normalizados:")
        for r in db_rows_all[:10]:
            print(f"  {json.dumps(r, ensure_ascii=False)}")
        print(f"\nPara aplicar, rode com --apply (defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.local).")
        return 0

    # --apply: upsert em lotes
    print(f"\nAplicando {len(db_rows_all)} upserts em 'produtos'...")
    res = upsert_supabase(url, key, "produtos", db_rows_all, on_conflict="codigo")
    if res["status"] == "error":
        print(f"  ERRO: {res['error']}", file=sys.stderr)
        return 6
    print(f"  OK: {res['count']} linhas upsertadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
