-- Copia dados da tabela legada `accessories` para a nova `produtos_acessorios`.
-- Idempotente: só insere registros que ainda não existem (mesmo nome + unit).
-- Esta migration é segura para rodar em produção — não modifica a tabela de origem.

INSERT INTO public.produtos_acessorios (name, unit, colors, active, created_at, updated_at)
SELECT
  a.name,
  a.unit,
  COALESCE(a.colors, '[]'::jsonb),
  true,
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.accessories a
WHERE NOT EXISTS (
  SELECT 1 FROM public.produtos_acessorios t
  WHERE t.name = a.name AND t.unit = a.unit
);
