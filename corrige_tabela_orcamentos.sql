-- corrige_tabela_orcamentos.sql
-- ESTE SCRIPT RECRIA A TABELA ORÇAMENTOS EXATAMENTE COMO SEU SITE (FRONTEND) ESPERA

-- Primeiro dropamos as policies que dependem da tabela, para evitar erro ao deletar
DROP POLICY IF EXISTS "Usuários logados podem ler orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem inserir orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem atualizar orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem deletar orçamentos" ON orcamentos;

-- Apagamos a tabela errada
DROP TABLE IF EXISTS orcamentos;

-- Recriamos com os EXATOS nomes de colunas que seu site envia:
CREATE TABLE orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_orcamento INTEGER,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    
    -- Valores JSON
    produtos_json JSONB DEFAULT '[]'::jsonb,
    acessorios_json JSONB DEFAULT '[]'::jsonb,
    ambientes JSONB,
    
    -- Valores em dinheiro
    valor_total NUMERIC DEFAULT 0,
    valor_negociado NUMERIC DEFAULT 0,
    
    observacao TEXT,
    status TEXT DEFAULT 'pending',
    
    -- Pagamento
    payment_method TEXT,
    payment_installments INTEGER DEFAULT 1,
    payment_tax_rate NUMERIC DEFAULT 0,
    payment_discount_rate NUMERIC DEFAULT 0,
    payment_conditions JSONB,
    
    vendedor_id UUID REFERENCES vendedores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativamos as RLS da tabela novamente
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;

-- Recriamos as Policies de Acesso
CREATE POLICY "Usuários logados podem ler orçamentos" 
ON orcamentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuários logados podem inserir orçamentos" 
ON orcamentos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuários logados podem atualizar orçamentos" 
ON orcamentos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuários logados podem deletar orçamentos" 
ON orcamentos FOR DELETE TO authenticated USING (true);

-- Notificamos o cache para zerar os erros no app
NOTIFY pgrst, 'reload schema';
