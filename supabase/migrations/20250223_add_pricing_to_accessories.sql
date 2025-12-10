-- Adiciona colunas de preços para acessórios
ALTER TABLE acessorios
ADD COLUMN preco_custo DECIMAL(10,2),
ADD COLUMN margem_lucro DECIMAL(10,2),
ADD COLUMN preco_venda DECIMAL(10,2);
