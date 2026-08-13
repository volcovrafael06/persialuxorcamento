-- supabase/migrations/20260812_ph_correction.sql
--
-- Limpa a coluna `cor` de produtos PH onde ela foi importada errada com
-- tipo de acionamento ("Monocomando corrente", "Entre Vidros", "Standard", etc).
--
-- Esses produtos seguem o padrão "PH X — <Acionamento>" e o acionamento
-- já está no nome. Movemos pra coluna `acionamento` (nullable) e zeramos
-- `cor` para evitar que o cascata dropdown mostre acionamentos como cores.
--
-- Casos cobertos:
--   "PH Alumínio — Monocomando corrente"          → acionamento="Monocomando corrente"
--   "PH Alumínio — Standard"                       → acionamento="Standard"
--   "PH Alumínio — Entre Vidros"                   → acionamento="Entre Vidros"
--   "PH Madeira — Monocomando Corrente"            → acionamento="Monocomando Corrente"
--   "PH Madeira Natural e Bamboo — Standard"       → acionamento="Standard"
--   "PH Madeira Sintética e PVC — Monocomando..."  → acionamento="Monocomando corrente"
--   "PH PVC — Standard"                            → acionamento="Standard"
--   "Gerais — Acionamento monocomando corrente (...)" → acionamento="..."
--   "Gerais — Corrente bola 10 metal*"             → acionamento="Corrente bola 10 metal*"
--   "PH Alumínio — Kit entre vidros (botão)"        → acionamento="Kit entre vidros (botão)"
--
-- Backfill `cores_disponiveis` para PH com `cor` populada:
-- Quando `cor` tem valor que NÃO é acionamento, adicionamos como opção
-- única no JSONB se estiver vazio (para a cascata mostrar).

BEGIN;

-- 1) Mover acionamento errado pra coluna `acionamento` e limpar `cor`.
--    Padrão: nome tem " — X" onde X é o acionamento.
UPDATE public.produtos p
SET
  acionamento = split_part(p.nome, ' — ', 2),
  cor = NULL
WHERE p.linha = 'Persiana Horizontal'
  AND p.cor IS NOT NULL
  AND p.cor ILIKE ANY (ARRAY['%Monocomando%', '%Entre Vidros%', '%Standard%', '%Bead Chain%', '%Double Pull%', '%Manual Motor%', '%corrente%', '%comando%'])
  AND p.nome LIKE '% — %'
  AND split_part(p.nome, ' — ', 2) <> '';

-- 2) Backfill `cores_disponiveis` para PH com `cor` real (não-acionamento)
--    que está sem cores_disponiveis populado. Roda DEPOIS do passo 1
--    pra não backfillar produtos cujo `cor` acabou de virar NULL.
UPDATE public.produtos p
SET cores_disponiveis = jsonb_build_array(jsonb_build_object('color', p.cor))
WHERE p.linha = 'Persiana Horizontal'
  AND p.cor IS NOT NULL
  AND p.cor NOT ILIKE ANY (ARRAY['%Monocomando%', '%Entre Vidros%', '%Standard%', '%Bead Chain%', '%Double Pull%', '%Manual Motor%', '%corrente%', '%comando%'])
  AND (p.cores_disponiveis IS NULL OR jsonb_array_length(p.cores_disponiveis) = 0);

-- 3) Limpa cores_disponiveis com cores nullas (defesa em profundidade)
UPDATE public.produtos p
SET cores_disponiveis = '[]'::jsonb
WHERE p.linha = 'Persiana Horizontal'
  AND p.cor IS NULL
  AND p.cores_disponiveis @> '[{"color": null}]'::jsonb;

-- 4) Caso "Gerais — Acionamento X" — o split captura "Acionamento X" como
--    acionamento. Limpa para só a parte acionamento real.
UPDATE public.produtos p
SET acionamento = regexp_replace(
  split_part(p.nome, ' — ', 2),
  '^Acionamento\s+',
  '',
  'i'
)
WHERE p.linha = 'Persiana Horizontal'
  AND p.nome LIKE 'Gerais — Acionamento %'
  AND p.acionamento IS NOT NULL
  AND p.acionamento ILIKE 'Acionamento %';

COMMIT;