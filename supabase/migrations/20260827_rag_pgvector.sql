-- 20260827_rag_pgvector.sql
-- RAG: embeddings de produtos + acessórios usando pgvector.
-- Modelo: nomic-embed-text (embedding_length = 768)
--
-- O chat orçamentista usa essas tabelas para busca semântica:
--   "persiana que bloqueia luz" → encontra "Persiana Blackout" mesmo sem match exato

CREATE TABLE IF NOT EXISTS produto_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid REFERENCES produtos(id) ON DELETE CASCADE,
  text_chunk text NOT NULL,
  embedding vector(768),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(produto_id)
);

CREATE INDEX IF NOT EXISTS produto_embeddings_vec_idx
  ON produto_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS acessorio_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acessorio_id uuid REFERENCES produtos_acessorios(id) ON DELETE CASCADE,
  text_chunk text NOT NULL,
  embedding vector(768),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(acessorio_id)
);

CREATE INDEX IF NOT EXISTS acessorio_embeddings_vec_idx
  ON acessorio_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Função RPC: busca híbrida (semântica + ILIKE) retornando top N produtos
CREATE OR REPLACE FUNCTION search_produtos_similar(
  query_embedding vector(768),
  query_text text,
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  codigo text,
  nome text,
  preco_venda numeric,
  metodo_calculo text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT pe.produto_id,
           1 - (pe.embedding <=> query_embedding) AS sim
    FROM produto_embeddings pe
    WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count
  )
  SELECT p.id, p.codigo, p.nome, p.preco_venda, p.metodo_calculo, s.sim AS similarity
  FROM produtos p
  JOIN semantic s ON s.produto_id = p.id
  UNION ALL
  SELECT p.id, p.codigo, p.nome, p.preco_venda, p.metodo_calculo, 0.5::float AS similarity
  FROM produtos p
  WHERE (p.nome ILIKE '%' || query_text || '%'
      OR p.codigo ILIKE '%' || query_text || '%'
      OR p.modelo ILIKE '%' || query_text || '%')
    AND NOT EXISTS (SELECT 1 FROM semantic WHERE produto_id = p.id)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Mesma coisa para acessórios
CREATE OR REPLACE FUNCTION search_acessorios_similar(
  query_embedding vector(768),
  query_text text,
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  codigo text,
  nome text,
  unit_price numeric,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT ae.acessorio_id,
           1 - (ae.embedding <=> query_embedding) AS sim
    FROM acessorio_embeddings ae
    WHERE 1 - (ae.embedding <=> query_embedding) > match_threshold
    ORDER BY ae.embedding <=> query_embedding
    LIMIT match_count
  )
  SELECT a.id, a.codigo, a.nome, a.unit_price, s.sim AS similarity
  FROM produtos_acessorios a
  JOIN semantic s ON s.acessorio_id = a.id
  UNION ALL
  SELECT a.id, a.codigo, a.nome, a.unit_price, 0.5::float AS similarity
  FROM produtos_acessorios a
  WHERE (a.nome ILIKE '%' || query_text || '%'
      OR a.codigo ILIKE '%' || query_text || '%')
    AND NOT EXISTS (SELECT 1 FROM semantic WHERE acessorio_id = a.id)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- RLS: leitura para usuários autenticados
ALTER TABLE produto_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE acessorio_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read produto_embeddings" ON produto_embeddings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read acessorio_embeddings" ON acessorio_embeddings
  FOR SELECT TO authenticated USING (true);

-- Service role pode inserir/atualizar (Edge function rag-index)
CREATE POLICY "Service role write produto_embeddings" ON produto_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role write acessorio_embeddings" ON acessorio_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
