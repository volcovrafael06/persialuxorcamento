ALTER TABLE orcamentos 
ADD COLUMN IF NOT EXISTS payment_method text, -- 'credit_card', 'pix', 'other'
ADD COLUMN IF NOT EXISTS payment_installments integer,
ADD COLUMN IF NOT EXISTS payment_tax_rate numeric, -- Percentage for credit card interest
ADD COLUMN IF NOT EXISTS payment_discount_rate numeric; -- Percentage for pix discount
