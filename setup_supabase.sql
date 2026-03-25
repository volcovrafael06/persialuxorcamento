-- setup_supabase.sql
-- Run this script in your Supabase SQL Editor to create all required tables and default data.

-- 1. CONFIGURACOES
CREATE TABLE IF NOT EXISTS configuracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    endereco TEXT,
    telefone TEXT,
    validade_orcamento INTEGER DEFAULT 30,
    formula_m2 TEXT,
    formula_comprimento TEXT,
    formula_bando TEXT,
    formula_instalacao TEXT,
    company_logo TEXT,
    bando_custo NUMERIC DEFAULT 80,
    bando_venda NUMERIC DEFAULT 120,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure bando_custo and bando_venda columns exist (for pre-existing tables)
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS bando_custo NUMERIC DEFAULT 80;
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS bando_venda NUMERIC DEFAULT 120;

-- Insert a default row if none exists
INSERT INTO configuracoes (validade_orcamento)
SELECT 30 WHERE NOT EXISTS (SELECT 1 FROM configuracoes LIMIT 1);

-- 2. VENDEDORES (EQUIPE DE VENDAS)
CREATE TABLE IF NOT EXISTS vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RAIL PRICING (PREÇOS DOS TRILHOS)
CREATE TABLE IF NOT EXISTS rail_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rail_type TEXT UNIQUE NOT NULL,
    cost_price NUMERIC NOT NULL DEFAULT 0,
    sale_price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rail types
INSERT INTO rail_pricing (rail_type, cost_price, sale_price) VALUES 
('trilho_redondo_com_comando', 0, 0),
('trilho_slim_com_comando', 0, 0),
('trilho_quadrado_com_rodizio_em_gancho', 0, 0),
('trilho_redondo_sem_comando', 0, 0),
('trilho_slim_sem_comando', 0, 0),
('trilho_motorizado', 0, 0)
ON CONFLICT (rail_type) DO NOTHING;

-- 4. PRODUTOS
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_foto TEXT,
    nome TEXT NOT NULL,
    tipo TEXT,
    custo NUMERIC DEFAULT 0,
    venda NUMERIC DEFAULT 0,
    colecao TEXT,
    unidade_medida TEXT CHECK (unidade_medida IN ('m2', 'metro')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ACCESSORIES
CREATE TABLE IF NOT EXISTS accessories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT,
    cost_price NUMERIC DEFAULT 0,
    sale_price NUMERIC DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    cpf_cnpj TEXT,
    bairro TEXT,
    cidade TEXT,
    uf TEXT,
    cep TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ORCAMENTOS
CREATE TABLE IF NOT EXISTS orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero INTEGER GENERATED ALWAYS AS IDENTITY,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    produtos JSONB NOT NULL,
    acessorios JSONB,
    ambientes JSONB,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    desconto NUMERIC DEFAULT 0,
    desconto_tipo TEXT DEFAULT 'percent',
    acrescimo NUMERIC DEFAULT 0,
    acrescimo_tipo TEXT DEFAULT 'value',
    total NUMERIC NOT NULL DEFAULT 0,
    observacoes TEXT,
    status TEXT DEFAULT 'draft',
    prazo_entrega INTEGER DEFAULT 15,
    validade_dias INTEGER DEFAULT 30,
    payment_method TEXT,
    payment_discount_rate NUMERIC DEFAULT 0,
    payment_conditions JSONB,
    vendedor_id UUID REFERENCES vendedores(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. VISITS (AGENDAMENTOS)
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    phone TEXT,
    cep TEXT,
    address TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    date_time TIMESTAMPTZ NOT NULL,
    notes TEXT,
    vendedor_id UUID REFERENCES vendedores(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STORAGE BUCKETS
-- You must manually create these buckets in the Supabase Storage panel:
-- 1. `images` (Public)
-- 2. `produtos_fotos` (Public)
-- 3. `accessories_fotos` (Public)

-- RLS POLICIES (Example: Allow all for Authenticated users)
-- ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public Access" ON configuracoes FOR ALL USING (true);
-- (Repeat for other tables as needed for your security requirements)
