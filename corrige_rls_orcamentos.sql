-- corrige_rls_orcamentos.sql
-- Remove as regras restritas
DROP POLICY IF EXISTS "Usuários logados podem ler orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem inserir orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem atualizar orçamentos" ON orcamentos;
DROP POLICY IF EXISTS "Usuários logados podem deletar orçamentos" ON orcamentos;

-- Cria regras públicas (permitindo que o site salve sem exigir login do Supabase Auth)
CREATE POLICY "Permitir leitura pública orçamentos" ON orcamentos FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública orçamentos" ON orcamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública orçamentos" ON orcamentos FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública orçamentos" ON orcamentos FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
