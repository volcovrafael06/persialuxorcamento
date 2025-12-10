-- Adiciona a coluna numero_orcamento se não existir
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS numero_orcamento INTEGER;

-- Cria uma sequência começando do 985
CREATE SEQUENCE IF NOT EXISTS orcamentos_numero_seq START WITH 985;

-- Atualiza os orçamentos existentes com números sequenciais
WITH numbered_rows AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) + 984 as new_number
  FROM orcamentos
  WHERE numero_orcamento IS NULL
)
UPDATE orcamentos o
SET numero_orcamento = nr.new_number
FROM numbered_rows nr
WHERE o.id = nr.id;

-- Define o valor atual da sequência para o maior número existente
SELECT setval('orcamentos_numero_seq', COALESCE((SELECT MAX(numero_orcamento) FROM orcamentos), 984));

-- Adiciona uma constraint para garantir que o número seja único
ALTER TABLE orcamentos ADD CONSTRAINT unique_numero_orcamento UNIQUE (numero_orcamento);
