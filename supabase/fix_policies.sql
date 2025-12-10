-- First drop all existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON configuracoes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON configuracoes;
DROP POLICY IF EXISTS "Public Access" ON configuracoes;

-- Create a single public access policy
CREATE POLICY "Public Access"
ON configuracoes
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Make sure we have the initial configuration row
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
    1,                   /* id */
    '',                  /* cnpj */
    '',                  /* razao_social */
    '',                  /* nome_fantasia */
    '',                  /* endereco */
    '',                  /* telefone */
    30,                  /* validade_orcamento */
    'largura * altura',  /* formula_m2 */
    'largura',          /* formula_comprimento */
    'largura * 0.3',    /* formula_bando */
    'quantidade * 50'    /* formula_instalacao */
)
ON CONFLICT (id) DO NOTHING;
