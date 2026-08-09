-- Cria a tabela produtos_acessorios (nova) sem afetar a tabela existente `accessories`.
-- O nome 'produtos_acessorios' evita colisão com a tabela legada `acessorios`
-- (que ficou vazia) e com `accessories` (que tem a estrutura que usamos hoje).

CREATE TABLE IF NOT EXISTS public.produtos_acessorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL,
  colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para busca por nome (usado em filtros)
CREATE INDEX IF NOT EXISTS idx_produtos_acessorios_name
  ON public.produtos_acessorios USING btree (lower(name));

CREATE INDEX IF NOT EXISTS idx_produtos_acessorios_user_active
  ON public.produtos_acessorios (user_id, active);

-- RLS: usuário autenticado lê apenas seus próprios registros, ou registros sem user_id (legado).
ALTER TABLE public.produtos_acessorios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS produtos_acessorios_select ON public.produtos_acessorios;
CREATE POLICY produtos_acessorios_select ON public.produtos_acessorios
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS produtos_acessorios_insert ON public.produtos_acessorios;
CREATE POLICY produtos_acessorios_insert ON public.produtos_acessorios
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS produtos_acessorios_update ON public.produtos_acessorios;
CREATE POLICY produtos_acessorios_update ON public.produtos_acessorios
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS produtos_acessorios_delete ON public.produtos_acessorios;
CREATE POLICY produtos_acessorios_delete ON public.produtos_acessorios
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Trigger para manter updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produtos_acessorios_touch ON public.produtos_acessorios;
CREATE TRIGGER trg_produtos_acessorios_touch
  BEFORE UPDATE ON public.produtos_acessorios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
