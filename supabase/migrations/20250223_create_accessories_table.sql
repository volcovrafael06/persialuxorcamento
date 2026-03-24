-- Criar tabela de acessórios se não existir
CREATE TABLE IF NOT EXISTS accessories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    colors JSONB DEFAULT '[]'::jsonb, -- Estrutura: [{"color": "string", "cost_price": number, "profit_margin": number, "sale_price": number}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Adicionar trigger para atualizar o updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_accessories_updated_at ON accessories;

CREATE TRIGGER update_accessories_updated_at
    BEFORE UPDATE ON accessories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
