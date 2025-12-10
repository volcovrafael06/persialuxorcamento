-- First, drop the existing foreign key constraint
ALTER TABLE orcamentos
DROP CONSTRAINT IF EXISTS orcamentos_cliente_id_fkey;

-- Re-create the foreign key constraint with ON DELETE CASCADE
ALTER TABLE orcamentos
ADD CONSTRAINT orcamentos_cliente_id_fkey
FOREIGN KEY (cliente_id)
REFERENCES clientes(id)
ON DELETE CASCADE;
