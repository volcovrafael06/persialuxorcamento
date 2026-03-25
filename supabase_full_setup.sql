-- Full Supabase Setup for Persian Luxor Budget

-- 1. Tables

-- Customers
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    endereco TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Products Catalog
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    modelo TEXT,
    tecido TEXT,
    codigo TEXT,
    preco_custo DECIMAL(10,2),
    preco_venda DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Accessories (Corrected name from component usage)
CREATE TABLE IF NOT EXISTS accessories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    unit TEXT, -- 'm' or 'un'
    colors JSONB, -- Stores color names and prices
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Budgets
CREATE TABLE IF NOT EXISTS orcamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id),
    status TEXT DEFAULT 'pendente',
    valor_total DECIMAL(10,2),
    desconto DECIMAL(10,2) DEFAULT 0,
    data_emissao DATE DEFAULT CURRENT_DATE,
    validade DATE,
    produtos JSONB, -- Stores the list of products in the budget
    condicoes_pagamento TEXT,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Global Configurations
CREATE TABLE IF NOT EXISTS configuracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cnpj TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    website TEXT,
    validade_orcamento INTEGER DEFAULT 30,
    formula_m2 TEXT,
    formula_comprimento TEXT,
    formula_bando TEXT,
    formula_instalacao TEXT,
    company_logo TEXT, -- URL to storage
    bando_custo NUMERIC DEFAULT 80,
    bando_venda NUMERIC DEFAULT 120,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Rail Pricing
CREATE TABLE IF NOT EXISTS rail_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rail_type TEXT UNIQUE NOT NULL,
    cost_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Sellers (formerly sellers, renamed to vendedores for consistency)
CREATE TABLE IF NOT EXISTS vendedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Visits / Scheduling
CREATE TABLE IF NOT EXISTS visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id),
    vendedor_id UUID REFERENCES vendedores(id),
    visit_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Storage Buckets
-- Ensure 'images' bucket exists for logo uploads
-- (This part usually requires manual creation or using the storage API, 
-- but checking/creating via SQL is possible in some Supabase environments)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Security (RLS)
-- Enable RLS on all tables
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rail_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY; -- Backwards compatibility for the command if table still exists
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- Create "Allow All" policies for development (Anom access)
-- Note: In production, these should be restricted to authenticated users.
CREATE POLICY "Allow all for clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for produtos" ON produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for accessories" ON accessories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for orcamentos" ON orcamentos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for configuracoes" ON configuracoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for rail_pricing" ON rail_pricing FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for vendedores" ON vendedores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for visits" ON visits FOR ALL USING (true) WITH CHECK (true);

-- Storage Policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "All Access" ON storage.objects FOR ALL USING (bucket_id = 'images') WITH CHECK (bucket_id = 'images');
