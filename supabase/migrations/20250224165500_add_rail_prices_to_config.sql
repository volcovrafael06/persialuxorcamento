-- Add rail price fields to configuracoes table
ALTER TABLE configuracoes 
ADD COLUMN IF NOT EXISTS trilho_redondo_com_comando DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trilho_redondo_sem_comando DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trilho_slim_com_comando DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trilho_slim_sem_comando DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trilho_quadrado_com_rodizio_em_gancho DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trilho_motorizado DECIMAL(10,2) DEFAULT 0.00;
