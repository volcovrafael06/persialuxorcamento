ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS numero_orcamento INTEGER;

-- Note: User input dimensions (input_width and input_height) are now stored
-- within the produtos_json column as part of each product object.
-- This allows for better flexibility and maintains the existing JSON structure.
-- The application code has been updated to handle these fields appropriately.
