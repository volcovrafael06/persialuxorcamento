-- Adiciona coluna ambientes (lista de ambientes únicos por orçamento)
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS ambientes text[] DEFAULT '{}'::text[];

-- Popular ambientes a partir de produtos_json existentes
UPDATE public.orcamentos o
SET ambientes = (
  SELECT ARRAY(
    SELECT DISTINCT ambiente
    FROM (
      SELECT NULLIF(trim(p->>'ambiente'), '') AS ambiente
      FROM jsonb_array_elements(
        CASE 
          WHEN jsonb_typeof(COALESCE(o.produtos_json::jsonb, '[]'::jsonb)) = 'array' 
            THEN COALESCE(o.produtos_json::jsonb, '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      ) p
    ) s
    WHERE ambiente IS NOT NULL
  )
)
WHERE o.produtos_json IS NOT NULL;

-- Índice para consultas por ambiente
CREATE INDEX IF NOT EXISTS idx_orcamentos_ambientes_gin
  ON public.orcamentos USING GIN (ambientes);
