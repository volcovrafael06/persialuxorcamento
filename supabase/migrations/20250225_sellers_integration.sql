-- Create vendedores table if it doesn't exist
CREATE TABLE IF NOT EXISTS vendedores (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    comissao_padrao DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ativo BOOLEAN DEFAULT TRUE
);

-- Add vendedor_id to visitas if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitas' AND column_name='vendedor_id') THEN
        ALTER TABLE visitas ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id);
    END IF;
END $$;

-- Add vendedor_id to orcamentos if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orcamentos' AND column_name='vendedor_id') THEN
        ALTER TABLE orcamentos ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id);
    END IF;
END $$;
