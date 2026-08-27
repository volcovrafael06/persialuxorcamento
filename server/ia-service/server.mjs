// server/ia-service/server.mjs
// Proxy local no servidor Oracle ARM. Roda em :8000 atrás do nginx (/api/*).
//
// Endpoints:
//   POST /api/chat           → Ollama chat com tools (gemma4:e2b-it-qat)
//   POST /api/rag-search     → Busca híbrida (semântica + ILIKE) via pgvector
//   POST /api/rag-index     → (Re)indexa produtos/acessórios no pgvector
//   GET  /api/health        → Healthcheck (Ollama + DB)
//   POST /api/save-orcamento → Persiste o orçamento final no Supabase
//
// Variáveis de ambiente (lidas do .env no servidor):
//   OLLAMA_URL=http://localhost:11434
//   OLLAMA_MODEL=gemma4:e2b-it-qat       (chat)
//   OLLAMA_EMBED_MODEL=nomic-embed-text  (embeddings, 768 dims)
//   SUPABASE_URL=https://ozxpdccutroxtjqcpjea.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...           (do .env, nunca exposto ao browser)
//   PORT=8000

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b-it-qat";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = Number(process.env.PORT || 8000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();
app.use(express.json({ limit: "2mb" }));

// === CORS (browser chama direto quando /api é exposto) ===
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "authorization, apikey, content-type");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// === Health ===
app.get("/api/health", async (req, res) => {
  try {
    const ollamaCheck = await fetch(`${OLLAMA_URL}/api/tags`).then((r) => r.ok).catch(() => false);
    const { count } = await supabaseAdmin.from("produto_embeddings").select("*", { count: "exact", head: true });
    res.json({
      ok: true,
      ollama: ollamaCheck,
      embeddings_produtos: count ?? 0,
      model: OLLAMA_MODEL,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// === Embedding helper ===
async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

// === RAG Search (busca híbrida semântica + ILIKE via RPC) ===
app.post("/api/rag-search", async (req, res) => {
  try {
    const { query, entity = "produtos", threshold = 0.65, limit = 8 } = req.body || {};
    if (!query) return res.status(400).json({ error: "query obrigatório" });

    let embedding;
    try {
      embedding = await embed(query);
    } catch (e) {
      console.warn("[rag-search] embedding falhou, fallback para busca textual:", e.message);
    }

    const rpcFn = entity === "acessorios" ? "search_acessorios_similar" : "search_produtos_similar";
    if (!embedding) {
      // fallback puro ILIKE
      const table = entity === "acessorios" ? "produtos_acessorios" : "produtos";
      const fields = entity === "acessorios"
        ? "id, name, description, unit"
        : "id, codigo, nome, preco_venda, metodo_calculo";
      const filter = entity === "acessorios"
        ? `name.ilike.%${query}%`
        : `nome.ilike.%${query}%,codigo.ilike.%${query}%`;
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(fields)
        .or(filter)
        .limit(limit);
      if (error) throw error;
      return res.json({ entity, query, results: data || [], via: "fallback_ilike" });
    }

    const { data, error } = await supabaseAdmin.rpc(rpcFn, {
      query_embedding: embedding,
      query_text: query,
      match_threshold: threshold,
      match_count: limit,
    });
    if (error) throw error;
    res.json({ entity, query, results: data || [], via: "hybrid_pgvector" });
  } catch (err) {
    console.error("[rag-search]", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// === RAG Index (reindexação completa) ===
app.post("/api/rag-index", async (req, res) => {
  try {
    const entity = req.body?.entity || "all";
    const limit = Math.min(req.body?.limit || 5000, 10000);
    const dryRun = !!req.body?.dry_run;

    const results = { entity, dry_run: dryRun };

    if (entity === "produtos" || entity === "all") {
      const { data: produtos, error } = await supabaseAdmin
        .from("produtos")
        .select("id, codigo, nome, modelo, tecido, metodo_calculo, preco_venda")
        .limit(limit);
      if (error) throw error;
      let indexed = 0, errors = 0;
      for (const p of produtos || []) {
        try {
          const chunk = [p.nome, p.codigo ? `código ${p.codigo}` : null, p.modelo, p.tecido, p.metodo_calculo]
            .filter(Boolean).join(". ");
          const embedding = await embed(chunk);
          if (!dryRun) {
            await supabaseAdmin.from("produto_embeddings").upsert({
              produto_id: p.id,
              text_chunk: chunk,
              embedding,
              metadata: { codigo: p.codigo, nome: p.nome, preco_venda: p.preco_venda },
              updated_at: new Date().toISOString(),
            }, { onConflict: "produto_id" });
          }
          indexed++;
        } catch (e) {
          errors++;
          console.error("[produto]", p.codigo, e.message);
        }
      }
      results.produtos = { indexed, errors, total: (produtos || []).length };
    }

    if (entity === "acessorios" || entity === "all") {
      const { data: acessorios, error } = await supabaseAdmin
        .from("produtos_acessorios")
        .select("id, name, description, unit")
        .limit(limit);
      if (error) throw error;
      let indexed = 0, errors = 0;
      for (const a of acessorios || []) {
        try {
          const chunk = [a.name, a.description, a.unit ? `unidade: ${a.unit}` : null].filter(Boolean).join(". ");
          const embedding = await embed(chunk);
          if (!dryRun) {
            await supabaseAdmin.from("acessorio_embeddings").upsert({
              acessorio_id: a.id,
              text_chunk: chunk,
              embedding,
              metadata: { name: a.name, description: a.description, unit: a.unit },
              updated_at: new Date().toISOString(),
            }, { onConflict: "acessorio_id" });
          }
          indexed++;
        } catch (e) {
          errors++;
          console.error("[acessorio]", a.name, e.message);
        }
      }
      results.acessorios = { indexed, errors, total: (acessorios || []).length };
    }

    res.json(results);
  } catch (err) {
    console.error("[rag-index]", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// === Chat (Ollama) com tools estruturados ===
const TOOLS = [
  {
    type: "function",
    function: {
      name: "buscar_produto",
      description: "Busca produtos por termo livre (nome, código, modelo, descrição semântica).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca — ex: 'cortina rolo tela solar', 'código 259-08', 'persiana que bloqueia luz'" },
          limit: { type: "number", description: "Quantos resultados retornar", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_acessorio",
      description: "Busca acessórios (motor, trilho, suporte etc) por termo livre.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number", default: 5 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalhes_produto",
      description: "Retorna todos os dados de 1 produto (preços, dimensões, customização, cores).",
      parameters: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "Código do produto" },
        },
        required: ["codigo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalizar_orcamento",
      description: "Salva o orçamento no Supabase com status 'pendente'.",
      parameters: {
        type: "object",
        properties: {
          cliente: {
            type: "object",
            properties: {
              nome: { type: "string" },
              telefone: { type: "string" },
              email: { type: "string" },
              endereco: { type: "string" },
              cpf: { type: "string" },
            },
            required: ["nome"],
          },
          itens_produtos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                codigo: { type: "string" },
                nome: { type: "string" },
                largura: { type: "number" },
                altura: { type: "number" },
                quantidade: { type: "number", default: 1 },
                customizacao: { type: "object" },
              },
            },
          },
          itens_acessorios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                codigo: { type: "string" },
                nome: { type: "string" },
                quantidade: { type: "number", default: 1 },
              },
            },
          },
          observacao: { type: "string" },
        },
        required: ["cliente", "itens_produtos"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Você é o assistente de orçamentos da PersiaLux (cortinas e persianas).
Você ajuda vendedores brasileiros a montar orçamentos conversando em português natural.

REGRAS:
1. SEMPRE use a tool buscar_produto quando o usuário mencionar um produto. Nunca invente códigos ou preços.
2. Use a tool finalizar_orcamento APENAS quando o usuário disser explicitamente "finalizar", "pode salvar", "tá pronto", "fechar".
3. Sempre confirme em linguagem natural o que adicionou (produto, dimensões, preço).
4. Tom: profissional, conciso, amigável. Use emojis com moderação (🪟 ✨ 📐).
5. Se o usuário fornecer dimensões em "1,5", interprete como 1.5 metros.
6. Se a collection não tiver cor única (ex: Vertical Wave), não peça cor.
7. Quando finalizar, dê o ID do orçamento criado e parabenize.

Você recebe o orçamento em construção (draft) junto com cada mensagem — use para entender o contexto.`;

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], draft = null } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages obrigatório" });
    }

    // Compila system prompt + estado do orçamento em construção
    const draftInfo = draft && (draft.cliente || (draft.itens || []).length > 0)
      ? `\n\nESTADO ATUAL DO ORÇAMENTO:\n${JSON.stringify(draft, null, 2)}`
      : "";

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT + draftInfo },
      ...messages,
    ];

    // Loop de tool calls: Gemma pode pedir tools, executamos e voltamos
    const toolCallLog = [];
    let response;
    for (let i = 0; i < 5; i++) {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: fullMessages,
          tools: TOOLS,
          stream: false,
          options: { temperature: 0.3 },
        }),
      });
      if (!ollamaRes.ok) {
        const txt = await ollamaRes.text();
        throw new Error(`Ollama chat failed: ${ollamaRes.status} ${txt}`);
      }
      response = await ollamaRes.json();

      const toolCalls = response.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      fullMessages.push(response.message);

      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        const args = tc.function?.arguments || {};
        let toolResult;
        try {
          toolResult = await executeTool(fnName, args, req);
        } catch (e) {
          toolResult = { error: String(e.message || e) };
        }
        toolCallLog.push({ tool: fnName, args, result: toolResult });
        fullMessages.push({ role: "tool", content: JSON.stringify(toolResult) });
      }
    }

    res.json({
      reply: response?.message?.content || "",
      tool_calls: toolCallLog,
      done: !response?.message?.tool_calls,
    });
  } catch (err) {
    console.error("[chat]", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

async function executeTool(name, args, req) {
  switch (name) {
    case "buscar_produto":
    case "buscar_acessorio": {
      const entity = name === "buscar_acessorio" ? "acessorios" : "produtos";
      try {
        const embedding = await embed(args.query);
        const { data, error } = await supabaseAdmin.rpc(
          entity === "acessorios" ? "search_acessorios_similar" : "search_produtos_similar",
          {
            query_embedding: embedding,
            query_text: args.query,
            match_threshold: 0.6,
            match_count: args.limit || 5,
          },
        );
        if (error) throw error;
        return { results: data || [] };
      } catch (e) {
        // Fallback textual
        const table = entity === "acessorios" ? "produtos_acessorios" : "produtos";
        const { data } = await supabaseAdmin
          .from(table)
          .select("id, codigo, nome, preco_venda, unit_price, metodo_calculo")
          .or(`nome.ilike.%${args.query}%,codigo.ilike.%${args.query}%`)
          .limit(args.limit || 5);
        return { results: data || [], note: `fallback textual: ${e.message}` };
      }
    }
    case "detalhes_produto": {
      const { data, error } = await supabaseAdmin
        .from("produtos")
        .select("*")
        .eq("codigo", args.codigo)
        .maybeSingle();
      if (error) throw error;
      return data || { error: "produto não encontrado" };
    }
    case "finalizar_orcamento": {
      // Calcula valor_total baseado nos produtos (best-effort; UI refina depois)
      let valorTotal = 0;
      const cleanProducts = [];
      for (const item of args.itens_produtos || []) {
        const { data: prod } = await supabaseAdmin
          .from("produtos")
          .select("*")
          .eq("codigo", item.codigo)
          .maybeSingle();
        if (!prod) continue;
        const preco = Number(prod.preco_venda) || 0;
        const l = Number(item.largura) || 0;
        const a = Number(item.altura) || 0;
        const q = Number(item.quantidade) || 1;
        const metodo = (prod.metodo_calculo || "m2").toLowerCase();
        let base = 0;
        if (metodo === "ml" || metodo === "linear") base = l * preco;
        else if (metodo === "altura") base = a * preco;
        else {
          const area = l * a;
          const areaMin = Number(prod.area_minima) || 0;
          base = Math.max(area, areaMin) * preco;
        }
        const subtotal = base * q;
        valorTotal += subtotal;
        cleanProducts.push({
          produto_id: prod.id,
          produto: { id: prod.id, nome: prod.nome, codigo: prod.codigo, modelo: prod.modelo, tecido: prod.tecido, metodo_calculo: prod.metodo_calculo },
          largura: l,
          altura: a,
          input_width: l,
          input_height: a,
          ambiente: "",
          modelo: "",
          acionamento: "",
          cor: "",
          customizacao: item.customizacao || {},
          customizacao_texto: "",
          origem: "chat_ia",
          subtotal,
        });
      }
      // Acessórios
      const cleanAcc = [];
      for (const item of args.itens_acessorios || []) {
        const { data: acc } = await supabaseAdmin
          .from("produtos_acessorios")
          .select("*")
          .eq("codigo", item.codigo)
          .maybeSingle();
        if (!acc) continue;
        const unit = Number(acc.unit_price) || 0;
        const q = Number(item.quantidade) || 1;
        cleanAcc.push({
          accessory_id: acc.codigo || acc.id,
          accessory: { id: acc.id, name: acc.nome },
          name: acc.nome,
          unit: acc.unit || "",
          color: "",
          unit_price: unit,
          quantity: q,
          subtotal: unit * q,
          valor_total: unit * q,
        });
        valorTotal += unit * q;
      }

      // Cliente (cria se não existir pelo telefone)
      let clienteId = null;
      if (args.cliente?.telefone) {
        const tel = args.cliente.telefone.replace(/\D/g, "");
        const { data: existing } = await supabaseAdmin
          .from("clientes")
          .select("id")
          .eq("phone", tel)
          .maybeSingle();
        if (existing) clienteId = existing.id;
      }
      if (!clienteId && args.cliente?.nome) {
        const { data: novo, error: insertErr } = await supabaseAdmin
          .from("clientes")
          .insert({
            name: args.cliente.nome,
            phone: (args.cliente.telefone || "").replace(/\D/g, ""),
            email: args.cliente.email || null,
            address: args.cliente.endereco || null,
            cpf: args.cliente.cpf || null,
          })
          .select("id")
          .single();
        if (!insertErr && novo) clienteId = novo.id;
      }

      if (!clienteId) {
        return { error: "cliente não informado ou não foi possível criar" };
      }

      const { data: orc, error: orcErr } = await supabaseAdmin
        .from("orcamentos")
        .insert({
          cliente_id: clienteId,
          valor_total: valorTotal,
          produtos_json: JSON.stringify(cleanProducts),
          acessorios_json: JSON.stringify(cleanAcc),
          ambientes: JSON.stringify([]),
          observacao: args.observacao || "",
          status: "pendente",
        })
        .select("id, status, valor_total")
        .single();
      if (orcErr) throw orcErr;

      return {
        sucesso: true,
        orcamento_id: orc.id,
        status: orc.status,
        valor_total: orc.valor_total,
        itens_adicionados: cleanProducts.length + cleanAcc.length,
      };
    }
    default:
      return { error: `tool '${name}' não implementada` };
  }
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`IA service em http://127.0.0.1:${PORT} (Ollama: ${OLLAMA_URL})`);
});