-- supabase/migrations/20260813_financeiro.sql
--
-- Módulo financeiro: despesas operacionais + taxas de cartão + RLS.
--
-- Tabelas:
--   - public.despesas           (Aluguel, Folha, Marketing, etc)
--   - public.taxas_cartao       (bandeira × parcela × taxa)
--
-- Categorias fechadas (validamos no front + checagem solta no DB).
-- RLS: apenas admin lê/escreve nas duas tabelas.
--
-- MEDIDAS DE SEGURANÇA:
--   - gen_random_uuid() padrão
--   - created_by / updated_by auto-preenchidos com auth.uid()
--   - RLS com USING=true para admin (role='admin' em profiles), negação default.
--   - created_at/updated_at default now()

BEGIN;

-- =========================================================================
-- 1) CATEGORIAS — não precisa tabela, é um check constraint.
-- =========================================================================

-- =========================================================================
-- 2) TABELA DESPESAS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.despesas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  descricao           text NOT NULL,
  categoria           text NOT NULL
                      CHECK (categoria IN (
                        'aluguel', 'folha', 'marketing', 'taxa_cartao',
                        'fornecedor', 'energia', 'agua', 'internet',
                        'impostos', 'manutencao', 'material_escritorio',
                        'combustivel', 'alimentacao', 'outros'
                      )),
  valor               numeric(12, 2) NOT NULL CHECK (valor >= 0),
  data_despesa        date NOT NULL DEFAULT CURRENT_DATE,
  forma_pagamento     text CHECK (forma_pagamento IN ('dinheiro','pix','debito','credito','boleto','transferencia','outros')),
  status              text NOT NULL DEFAULT 'pago'
                      CHECK (status IN ('pago','pendente','cancelado')),
  fornecedor          text,
  nota_fiscal         text,
  observacao          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_despesas_data     ON public.despesas (data_despesa);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria ON public.despesas (categoria);
CREATE INDEX IF NOT EXISTS idx_despesas_status    ON public.despesas (status);

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_despesas_updated_at ON public.despesas;
CREATE TRIGGER trg_despesas_updated_at
  BEFORE UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 3) TABELA TAXAS DE CARTÃO
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.taxas_cartao (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bandeira            text NOT NULL,           -- visa, master, elo, hipercard, amex, etc
  parcelas            integer NOT NULL CHECK (parcelas >= 1 AND parcelas <= 36),
  taxa_percentual     numeric(5, 2) NOT NULL CHECK (taxa_percentual >= 0 AND taxa_percentual <= 100),
  ativa               boolean NOT NULL DEFAULT true,
  observacao          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bandeira, parcelas)
);

CREATE INDEX IF NOT EXISTS idx_taxas_bandeira   ON public.taxas_cartao (bandeira);
CREATE INDEX IF NOT EXISTS idx_taxas_parcelas   ON public.taxas_cartao (parcelas);
CREATE INDEX IF NOT EXISTS idx_taxas_ativa      ON public.taxas_cartao (ativa) WHERE ativa;

DROP TRIGGER IF EXISTS trg_taxas_cartao_updated_at ON public.taxas_cartao;
CREATE TRIGGER trg_taxas_cartao_updated_at
  BEFORE UPDATE ON public.taxas_cartao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 4) RLS (admin-only em ambas)
-- =========================================================================
ALTER TABLE public.despesas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxas_cartao  ENABLE ROW LEVEL SECURITY;

-- função utilitária: extrai role do profile do user atual (SECURITY DEFINER pra contornar RLS de profiles)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- DESPESAS
DROP POLICY IF EXISTS admin_despesas_select ON public.despesas;
DROP POLICY IF EXISTS admin_despesas_insert ON public.despesas;
DROP POLICY IF EXISTS admin_despesas_update ON public.despesas;
DROP POLICY IF EXISTS admin_despesas_delete ON public.despesas;
CREATE POLICY admin_despesas_select ON public.despesas
  FOR SELECT USING (public.current_user_role() = 'admin');
CREATE POLICY admin_despesas_insert ON public.despesas
  FOR INSERT WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_despesas_update ON public.despesas
  FOR UPDATE USING (public.current_user_role() = 'admin')
            WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_despesas_delete ON public.despesas
  FOR DELETE USING (public.current_user_role() = 'admin');

-- TAXAS
DROP POLICY IF EXISTS admin_taxas_select ON public.taxas_cartao;
DROP POLICY IF EXISTS admin_taxas_insert ON public.taxas_cartao;
DROP POLICY IF EXISTS admin_taxas_update ON public.taxas_cartao;
DROP POLICY IF EXISTS admin_taxas_delete ON public.taxas_cartao;
CREATE POLICY admin_taxas_select ON public.taxas_cartao
  FOR SELECT USING (public.current_user_role() = 'admin');
CREATE POLICY admin_taxas_insert ON public.taxas_cartao
  FOR INSERT WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_taxas_update ON public.taxas_cartao
  FOR UPDATE USING (public.current_user_role() = 'admin')
            WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_taxas_delete ON public.taxas_cartao
  FOR DELETE USING (public.current_user_role() = 'admin');

-- =========================================================================
-- 5) SEED DAS TAXAS PADRÃO BRASIL (admin pode editar)
-- =========================================================================
INSERT INTO public.taxas_cartao (bandeira, parcelas, taxa_percentual, ativa) VALUES
  ('visa',       1,  2.50, true),
  ('visa',       2,  3.50, true),
  ('visa',       3,  4.50, true),
  ('visa',       4,  5.50, true),
  ('visa',       5,  6.50, true),
  ('visa',       6,  7.50, true),
  ('visa',       7,  8.50, true),
  ('visa',       8,  9.50, true),
  ('visa',       9, 10.50, true),
  ('visa',      10, 11.50, true),
  ('visa',      11, 12.50, true),
  ('visa',      12, 13.50, true),
  ('mastercard', 1,  2.50, true),
  ('mastercard', 2,  3.50, true),
  ('mastercard', 3,  4.50, true),
  ('mastercard', 4,  5.50, true),
  ('mastercard', 5,  6.50, true),
  ('mastercard', 6,  7.50, true),
  ('mastercard', 7,  8.50, true),
  ('mastercard', 8,  9.50, true),
  ('mastercard', 9, 10.50, true),
  ('mastercard', 10, 11.50, true),
  ('mastercard', 11, 12.50, true),
  ('mastercard', 12, 13.50, true),
  ('elo',        1,  3.00, true),
  ('elo',        3,  5.00, true),
  ('elo',        6,  8.00, true),
  ('elo',        12, 14.00, true),
  ('hipercard',  1,  3.00, true),
  ('hipercard',  3,  5.00, true),
  ('hipercard',  6,  8.00, true),
  ('hipercard',  12, 14.00, true),
  ('amex',       1,  3.50, true),
  ('amex',       3,  5.50, true),
  ('amex',       6,  8.50, true),
  ('amex',       12, 14.50, true)
ON CONFLICT (bandeira, parcelas) DO UPDATE SET taxa_percentual = EXCLUDED.taxa_percentual;

COMMIT;
