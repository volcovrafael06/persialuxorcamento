-- ==========================================
-- Profile Policies Fix
-- ==========================================

-- First, drop existing profile policies
DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create simplified profile policies
CREATE POLICY "Public profiles are viewable"
ON profiles 
FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can insert their own profile"
ON profiles 
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own profile"
ON profiles 
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
ON profiles 
FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Grant profile permissions
GRANT ALL ON profiles TO authenticated;
GRANT SELECT ON profiles TO anon;

-- ==========================================
-- Configuration Policies Fix
-- ==========================================

-- Drop existing configuration policies
DROP POLICY IF EXISTS "Enable read access for all users" ON configuracoes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Public Access" ON configuracoes;

-- Create unified public access policy for configurations
CREATE POLICY "Public Access"
ON configuracoes
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Insert or update default configuration
INSERT INTO configuracoes (
    id,
    cnpj,
    razao_social,
    nome_fantasia,
    endereco,
    telefone,
    validade_orcamento,
    formula_m2,
    formula_comprimento,
    formula_bando,
    formula_instalacao
)
VALUES (
    1,
    '',
    '',
    '',
    '',
    '',
    30,
    'largura * altura',
    'largura',
    'largura * 0.3',
    'quantidade * 50'
)
ON CONFLICT (id) DO NOTHING;
