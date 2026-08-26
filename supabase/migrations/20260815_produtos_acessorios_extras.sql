-- supabase/migrations/20260815_produtos_acessorios_extras.sql
--
-- Adiciona colunas extras no cadastro de acessórios (produtos_acessorios):
--   fornecedor (texto), categoria (texto), descricao (texto).
-- Migration idempotente — pode ser aplicada várias vezes sem erro.

BEGIN;

ALTER TABLE public.produtos_acessorios
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS categoria text
    CHECK (categoria IS NULL OR categoria IN ('suporte','trilho','corrente','perfil','instalacao','tecido','outros')),
  ADD COLUMN IF NOT EXISTS descricao text;

CREATE INDEX IF NOT EXISTS idx_acessorios_categoria ON public.produtos_acessorios (categoria);
CREATE INDEX IF NOT EXISTS idx_acessorios_fornecedor ON public.produtos_acessorios (fornecedor);

COMMIT;
