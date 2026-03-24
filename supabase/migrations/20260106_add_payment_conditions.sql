ALTER TABLE orcamentos 
ADD COLUMN IF NOT EXISTS payment_conditions jsonb;
