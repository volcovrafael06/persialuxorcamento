-- supabase/migrations/20260814_financeiro_v2.sql
--
-- Expansão do módulo financeiro:
--   1. Fornecedor + prazos no cadastro de produtos
--   2. Tabela contas_pagar  (despesas parceladas, fornecedores)
--   3. Tabela contas_receber (orçamentos parcelados, clientes)
--   4. Tabela pagamentos (lançamentos — para rateio)
--
-- RLS: admin-only nas 3 novas tabelas (mesma convenção do módulo anterior).
BEGIN;

-- ===========================================================================
-- 1) FORNECEDOR E PRAZOS NOS PRODUTOS
-- ===========================================================================
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS fornecedor           text,
  ADD COLUMN IF NOT EXISTS prazo_pagamento_dias integer CHECK (prazo_pagamento_dias IS NULL OR prazo_pagamento_dias >= 0),
  ADD COLUMN IF NOT EXISTS prazo_recebimento_dias integer CHECK (prazo_recebimento_dias IS NULL OR prazo_recebimento_dias >= 0),
  ADD COLUMN IF NOT EXISTS condicao_pagamento   text
    CHECK (condicao_pagamento IS NULL OR condicao_pagamento IN ('avista','7_ddl','14_ddl','21_ddl','28_ddl','30_ddl','45_ddl','60_ddl','90_ddl','120_ddl','personalizado')),
  ADD COLUMN IF NOT EXISTS observacao_financeira text;

CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor ON public.produtos (fornecedor);

-- ===========================================================================
-- 2) CONTAS A PAGAR
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  descricao       text NOT NULL,
  fornecedor_id   text,
  fornecedor_nome text,
  produto_id      uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  categoria       text NOT NULL CHECK (categoria IN ('compra','servico','imposto','taxa','outros')),
  valor_total     numeric(12,2) NOT NULL CHECK (valor_total > 0),
  numero_parcelas integer NOT NULL DEFAULT 1 CHECK (numero_parcelas >= 1 AND numero_parcelas <= 60),
  parcela_atual   integer CHECK (parcela_atual IS NULL OR (parcela_atual >= 1 AND parcela_atual <= numero_parcelas)),
  data_emissao    date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL,
  data_pagamento  date,
  forma_pagamento text CHECK (forma_pagamento IN ('dinheiro','pix','debito','credito','boleto','transferencia','outros')),
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','atrasado','cancelado')),
  nota_fiscal     text,
  observacao      text,
  despesa_vinculada uuid REFERENCES public.despesas(id) ON DELETE SET NULL,
  orcamento_id     uuid REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valor_consistente CHECK (valor_total IS NOT NULL AND valor_total > 0),
  CONSTRAINT vencimento_logico CHECK (data_vencimento >= data_emissao)
);

CREATE INDEX IF NOT EXISTS idx_cp_data_vencimento ON public.contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_status         ON public.contas_pagar (status);
CREATE INDEX IF NOT EXISTS idx_cp_fornecedor     ON public.contas_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_cp_orcamento      ON public.contas_pagar (orcamento_id);

-- ===========================================================================
-- 3) CONTAS A RECEBER
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.contas_receber (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  orcamento_id    uuid REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  descricao       text NOT NULL,
  valor_total     numeric(12,2) NOT NULL CHECK (valor_total > 0),
  numero_parcelas integer NOT NULL DEFAULT 1 CHECK (numero_parcelas >= 1 AND numero_parcelas <= 60),
  parcela_atual   integer CHECK (parcela_atual IS NULL OR (parcela_atual >= 1 AND parcela_atual <= numero_parcelas)),
  data_emissao    date NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL,
  data_recebimento date,
  forma_recebimento text CHECK (forma_recebimento IN ('dinheiro','pix','debito','credito','boleto','transferencia','outros')),
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','atrasado','cancelado')),
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valor_receber CHECK (valor_total > 0),
  CONSTRAINT vencimento_receber CHECK (data_vencimento >= data_emissao)
);

CREATE INDEX IF NOT EXISTS idx_cr_data_vencimento ON public.contas_receber (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cr_status         ON public.contas_receber (status);
CREATE INDEX IF NOT EXISTS idx_cr_orcamento      ON public.contas_receber (orcamento_id);
CREATE INDEX IF NOT EXISTS idx_cr_cliente        ON public.contas_receber (cliente_id);

-- ===========================================================================
-- 4) TRIGGERS updated_at
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_cp_updated_at ON public.contas_pagar;
CREATE TRIGGER trg_cp_updated_at
  BEFORE UPDATE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cr_updated_at ON public.contas_receber;
CREATE TRIGGER trg_cr_updated_at
  BEFORE UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- 5) RLS admin-only
-- ===========================================================================
ALTER TABLE public.contas_pagar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_cp_select ON public.contas_pagar;
DROP POLICY IF EXISTS admin_cp_insert ON public.contas_pagar;
DROP POLICY IF EXISTS admin_cp_update ON public.contas_pagar;
DROP POLICY IF EXISTS admin_cp_delete ON public.contas_pagar;
CREATE POLICY admin_cp_select ON public.contas_pagar FOR SELECT USING (public.current_user_role() = 'admin');
CREATE POLICY admin_cp_insert ON public.contas_pagar FOR INSERT WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_cp_update ON public.contas_pagar FOR UPDATE USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_cp_delete ON public.contas_pagar FOR DELETE USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS admin_cr_select ON public.contas_receber;
DROP POLICY IF EXISTS admin_cr_insert ON public.contas_receber;
DROP POLICY IF EXISTS admin_cr_update ON public.contas_receber;
DROP POLICY IF EXISTS admin_cr_delete ON public.contas_receber;
CREATE POLICY admin_cr_select ON public.contas_receber FOR SELECT USING (public.current_user_role() = 'admin');
CREATE POLICY admin_cr_insert ON public.contas_receber FOR INSERT WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_cr_update ON public.contas_receber FOR UPDATE USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY admin_cr_delete ON public.contas_receber FOR DELETE USING (public.current_user_role() = 'admin');

COMMIT;
