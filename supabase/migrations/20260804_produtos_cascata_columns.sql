-- Migration: adiciona colunas explicitas da cascata na tabela produtos
-- e popula retroativamente via heuristica SQL equivalente ao codigo JS.
--
-- As colunas sao NULLABLE para nao quebrar nada: a UI cascata continua
-- funcionando via regex ate que o usuario faca um edit manual
-- (opcional, melhoria de performance + queries SQL futuras).

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS linha text,
  ADD COLUMN IF NOT EXISTS grupo text,
  ADD COLUMN IF NOT EXISTS colecao text,
  ADD COLUMN IF NOT EXISTS cor text,
  ADD COLUMN IF NOT EXISTS acionamento text;

-- Indices para queries que filtram por cascata
CREATE INDEX IF NOT EXISTS idx_produtos_linha ON public.produtos (linha);
CREATE INDEX IF NOT EXISTS idx_produtos_linha_grupo ON public.produtos (linha, grupo);
CREATE INDEX IF NOT EXISTS idx_produtos_linha_grupo_colecao ON public.produtos (linha, grupo, colecao);

-- Backfill: linha e grupo vem direto das colunas existentes.
UPDATE public.produtos
SET linha = produto,
    grupo = modelo
WHERE linha IS NULL;

-- Backfill de colecao e cor a partir do nome, replicando a heuristica JS
-- do ProductSelectorCascata. Estes sao best-effort: onde a regex nao
-- bater, o campo fica NULL e o frontend cai pro regex JS (que e o que ja
-- acontece hoje).

-- Colecao: parte antes do primeiro separador (' - ' ou ' — ') quando
-- ainda sobra um pedaco significativo antes do modelo final.
UPDATE public.produtos
SET colecao = CASE
  -- Caso 1: tem ' — ' (em dash) — pega a parte antes
  WHEN nome LIKE '% — %' THEN split_part(nome, ' — ', 1)
  -- Caso 2: tem ' - ' (hifen simples) — pega a parte antes
  WHEN nome LIKE '% - %' THEN split_part(nome, ' - ', 1)
  -- Caso 3: nome sem separador — usa o nome inteiro como colecao
  ELSE nome
END
WHERE colecao IS NULL;

-- Limpa a colecao removendo sufixos de modelo que aparecem no fim do nome:
-- "Tubo XX", "Blackout", "PVC", "Wave", "Prega Macho", "Cortina(s)",
-- "Plissada", "Translucidas", "Vertical Wave", "Soft Wave XxX",
-- "Franzida Normal/Mini/Colmeia", "Tradicional", "Sem Corda", "FIXA", etc.
UPDATE public.produtos
SET colecao = TRIM(REGEXP_REPLACE(
  colecao,
  '\s+(Tubo\s*\d+|16/25|50/63|Blackout|PVC|Pvc|Transl[uú]cidas|Vertical\s+Wave|Soft\s+Wave\s*[\dx.]+|Prega\s+(?:Macho|Americana)|Franzida\s+(?:Normal|Mini|Colmeia)|Cortina(?:s)?|Plissada|Tradicional|Sem\s+Corda|FIXA|Sky\s+Light|Teto\s+(?:Bast[aã]o|Monocorrente))$',
  '',
  'i'
))
WHERE colecao IS NOT NULL;

-- Cor: parte depois do separador, ou nome inteiro quando nao ha separador.
UPDATE public.produtos
SET cor = CASE
  -- Caso "X — Y" (em dash)
  WHEN nome LIKE '% — %' THEN TRIM(split_part(nome, ' — ', 2))
  -- Caso "X - Y" (hifen)
  WHEN nome LIKE '% - %' THEN TRIM(split_part(nome, ' - ', 2))
  ELSE NULL
END
WHERE cor IS NULL;

-- Quando nao ha separador mas ha " - " no fim, a cor pode estar vazia.
-- Esses casos serao inferidos pelo regex JS no frontend (que ja faz isso).

-- Acionamento: nao temos coluna para isso no schema atual, e o produto
-- geralmente nao define o acionamento (e uma escolha do usuario no
-- momento do orcamento). Mantem NULL — o cascata JS continua inferindo
-- via ACIONAMENTOS_POR_MODELO.

-- Comentario nas colunas
COMMENT ON COLUMN public.produtos.linha IS 'Linha do produto (cache da coluna produto para queries de cascata)';
COMMENT ON COLUMN public.produtos.grupo IS 'Grupo do produto (cache da coluna modelo)';
COMMENT ON COLUMN public.produtos.colecao IS 'Colecao extraida do nome (best-effort; o frontend faz fallback via regex JS)';
COMMENT ON COLUMN public.produtos.cor IS 'Cor extraida do nome (best-effort; o frontend faz fallback via regex JS)';
COMMENT ON COLUMN public.produtos.acionamento IS 'Acionamento (D/E/X). Geralmente NULL — escolhido no orcamento';
