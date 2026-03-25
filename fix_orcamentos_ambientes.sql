-- fix_orcamentos_ambientes.sql
-- This script adds the missing 'ambientes' column to the 'orcamentos' table.
-- It also ensures the column is of type JSONB to store the array of environments properly.

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS ambientes JSONB;
