-- Criar tabela rail_pricing se não existir
CREATE TABLE IF NOT EXISTS rail_pricing (
  id BIGSERIAL PRIMARY KEY,
  rail_type VARCHAR NOT NULL,
  cost_price DECIMAL(10,2) DEFAULT 0,
  sale_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Atualizar registros existentes para os novos nomes
UPDATE rail_pricing 
SET rail_type = 'trilho_redondo_com_comando'
WHERE rail_type = 'trilho_redondo_comando';

UPDATE rail_pricing 
SET rail_type = 'trilho_slim_com_comando'
WHERE rail_type = 'trilho_slim_comando';

UPDATE rail_pricing 
SET rail_type = 'trilho_quadrado_com_rodizio_em_gancho'
WHERE rail_type = 'trilho_quadrado_gancho';

-- Remover registros duplicados mantendo apenas o com maior ID
DELETE FROM rail_pricing a 
WHERE EXISTS (
  SELECT 1 FROM rail_pricing b
  WHERE b.rail_type = a.rail_type
  AND b.id > a.id
);

-- Adicionar índice único para rail_type
CREATE UNIQUE INDEX IF NOT EXISTS rail_pricing_type_idx ON rail_pricing(rail_type);

-- Inserir ou atualizar os tipos de trilho
INSERT INTO rail_pricing (rail_type, cost_price, sale_price)
VALUES 
  -- Trilhos Redondos
  ('trilho_redondo_com_comando', 0, 0),
  ('trilho_redondo_sem_comando', 0, 0),
  
  -- Trilhos Slim
  ('trilho_slim_com_comando', 0, 0),
  ('trilho_slim_sem_comando', 0, 0),
  
  -- Trilhos Quadrados
  ('trilho_quadrado_com_rodizio_em_gancho', 0, 0),
  
  -- Trilho Motorizado
  ('trilho_motorizado', 0, 0)
ON CONFLICT (rail_type) 
DO UPDATE SET 
  updated_at = NOW()
RETURNING *;
