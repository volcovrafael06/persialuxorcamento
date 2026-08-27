// supabase/functions/rag-index/index.ts
// Indexa produtos e acessórios gerando embeddings via Ollama local.
// Chamada manual: POST /functions/v1/rag-index
// Opcionalmente aceita { entity: "produtos" | "acessorios" | "all", limit: number, dry_run: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OLLAMA_URL = Deno.env.get("OLLAMA_URL") || "http://localhost:11434";
// nomic-embed-text: embedding_length=768, otimizado para busca semântica
const EMBED_MODEL = "nomic-embed-text";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  modelo: string | null;
  tecido: string | null;
  metodo_calculo: string | null;
  preco_venda: number | null;
}

interface Acessorio {
  id: string;
  codigo: string;
  nome: string;
  unit_price: number | null;
  fornecedor: string | null;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama embeddings failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.embedding;
}

function buildProdutoChunk(p: Produto): string {
  const parts = [
    p.nome,
    p.codigo ? `código ${p.codigo}` : null,
    p.modelo ? `modelo ${p.modelo}` : null,
    p.tecido ? `tecido ${p.tecido}` : null,
    p.metodo_calculo ? `cálculo ${p.metodo_calculo}` : null,
  ].filter(Boolean);
  return parts.join(". ");
}

function buildAcessorioChunk(a: Acessorio): string {
  const parts = [
    a.nome,
    a.codigo ? `código ${a.codigo}` : null,
    a.fornecedor ? `fornecedor ${a.fornecedor}` : null,
  ].filter(Boolean);
  return parts.join(". ");
}

async function indexProdutos(
  supabase: ReturnType<typeof createClient>,
  limit: number,
  dryRun: boolean,
): Promise<{ indexed: number; errors: number }> {
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("id, codigo, nome, modelo, tecido, metodo_calculo, preco_venda")
    .limit(limit);
  if (error) throw error;
  if (!produtos || produtos.length === 0) return { indexed: 0, errors: 0 };

  let indexed = 0;
  let errors = 0;
  for (const p of produtos as Produto[]) {
    try {
      const chunk = buildProdutoChunk(p);
      const embedding = await embed(chunk);
      if (!dryRun) {
        const { error: upsertErr } = await supabase
          .from("produto_embeddings")
          .upsert(
            {
              produto_id: p.id,
              text_chunk: chunk,
              embedding,
              metadata: {
                codigo: p.codigo,
                nome: p.nome,
                preco_venda: p.preco_venda,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "produto_id" },
          );
        if (upsertErr) throw upsertErr;
      }
      indexed++;
      console.log(`[produto] ${indexed}/${produtos.length} ${p.codigo} ${p.nome}`);
    } catch (err) {
      errors++;
      console.error(`[produto] erro ${p.codigo}:`, err);
    }
  }
  return { indexed, errors };
}

async function indexAcessorios(
  supabase: ReturnType<typeof createClient>,
  limit: number,
  dryRun: boolean,
): Promise<{ indexed: number; errors: number }> {
  const { data: acessorios, error } = await supabase
    .from("produtos_acessorios")
    .select("id, codigo, nome, unit_price, fornecedor")
    .limit(limit);
  if (error) throw error;
  if (!acessorios || acessorios.length === 0) return { indexed: 0, errors: 0 };

  let indexed = 0;
  let errors = 0;
  for (const a of acessorios as Acessorio[]) {
    try {
      const chunk = buildAcessorioChunk(a);
      const embedding = await embed(chunk);
      if (!dryRun) {
        const { error: upsertErr } = await supabase
          .from("acessorio_embeddings")
          .upsert(
            {
              acessorio_id: a.id,
              text_chunk: chunk,
              embedding,
              metadata: {
                codigo: a.codigo,
                nome: a.nome,
                unit_price: a.unit_price,
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "acessorio_id" },
          );
        if (upsertErr) throw upsertErr;
      }
      indexed++;
      console.log(`[acessorio] ${indexed}/${acessorios.length} ${a.codigo} ${a.nome}`);
    } catch (err) {
      errors++;
      console.error(`[acessorio] erro ${a.codigo}:`, err);
    }
  }
  return { indexed, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: { entity?: string; limit?: number; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine */ }

  const entity = body.entity || "all";
  const limit = Math.min(body.limit || 5000, 10000);
  const dryRun = !!body.dry_run;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: Record<string, unknown> = { dry_run: dryRun, entity };
  if (entity === "produtos" || entity === "all") {
    results.produtos = await indexProdutos(supabase, limit, dryRun);
  }
  if (entity === "acessorios" || entity === "all") {
    results.acessorios = await indexAcessorios(supabase, limit, dryRun);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});