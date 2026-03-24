-- Adiciona colunas de preço do bandô na tabela configuracoes
ALTER TABLE configuracoes 
ADD COLUMN IF NOT EXISTS bando_custo DECIMAL(10,2) DEFAULT 80.00,
ADD COLUMN IF NOT EXISTS bando_venda DECIMAL(10,2) DEFAULT 120.00;

-- Adiciona coluna de custo do bandô na tabela orcamentos_produtos
ALTER TABLE orcamentos_produtos
ADD COLUMN IF NOT EXISTS valor_bando_custo DECIMAL(10,2) DEFAULT 0.00;

-- Atualiza os registros existentes na tabela configuracoes com os valores padrão
UPDATE configuracoes 
SET bando_custo = 80.00, bando_venda = 120.00 
WHERE bando_custo IS NULL OR bando_venda IS NULL;
