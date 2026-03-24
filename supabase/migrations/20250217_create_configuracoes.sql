-- Create configuracoes table
CREATE TABLE IF NOT EXISTS configuracoes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cnpj VARCHAR(18),
    razao_social VARCHAR(255),
    nome_fantasia VARCHAR(255),
    endereco TEXT,
    telefone VARCHAR(20),
    validade_orcamento INTEGER DEFAULT 30,
    formula_m2 TEXT,
    formula_comprimento TEXT,
    formula_bando TEXT,
    formula_instalacao TEXT,
    company_logo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_configuracoes_updated_at
    BEFORE UPDATE ON configuracoes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
    ON configuracoes
    FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated insert"
    ON configuracoes
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update"
    ON configuracoes
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Insert default configuration if not exists
INSERT INTO configuracoes (
    cnpj,
    razao_social,
    nome_fantasia,
    endereco,
    telefone,
    validade_orcamento,
    formula_m2,
    formula_comprimento,
    formula_bando,
    formula_instalacao
)
SELECT
    '',                  -- cnpj
    '',                  -- razao_social
    '',                  -- nome_fantasia
    '',                  -- endereco
    '',                  -- telefone
    30,                  -- validade_orcamento
    'largura * altura',  -- formula_m2
    'largura',          -- formula_comprimento
    'largura * 0.3',    -- formula_bando
    'quantidade * 50'    -- formula_instalacao
WHERE NOT EXISTS (
    SELECT 1 FROM configuracoes
);
