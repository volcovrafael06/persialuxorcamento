-- Adiciona campo valor_negociado na tabela orcamentos
ALTER TABLE orcamentos
ADD COLUMN valor_negociado DECIMAL(10,2) DEFAULT NULL;
