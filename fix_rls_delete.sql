-- fix_rls_delete.sql
-- Essa query garante que, se o Row Level Security (RLS) estiver ativado,
-- todos os usuários (mesmo os anônimos) poderão DELETAR, INSERIR, ATUALIZAR e LER registros.
-- Isso resolve o problema de registros que "parecem" ser apagados, mas continuam no banco.

DO $$
DECLARE
    t_name text;
BEGIN
    FOR t_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        -- Enable RLS (if not already enabled)
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t_name);
        
        -- Drop any existing "Public Access" policy to avoid conflicts
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Public Access" ON %I;', t_name);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore if policy doesn't exist
        END;

        -- Create a new policy that allows ALL operations (SELECT, INSERT, UPDATE, DELETE)
        EXECUTE format('CREATE POLICY "Public Access" ON %I FOR ALL USING (true) WITH CHECK (true);', t_name);
    END LOOP;
END $$;
