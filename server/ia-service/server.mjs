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
    const { query, entity = "produtos", threshold = 0.30, limit = 10 } = req.body || {};
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

const SYSTEM_PROMPT = `Você é um assistente de orçamentos da PersiaLux (cortinas e persianas).

REGRAS OBRIGATÓRIAS:
1. RESPONDA EM ATÉ 1 FRASE CURTA.
2. Se o [CONTEXTO] mostra que o cliente já tem NOME, TELEFONE ou ENDEREÇO, NÃO perunte novamente.
3. Se o [CONTEXTO] mostra que JÁ EXISTEM ITENS no orçamento, faça referência a eles.
4. Se o usuário já passou dimensões (2x1,5), confirme que adicionou.
5. Se o usuário quer finalizar e tem cliente + itens, diga "Vou salvar o orçamento".
6. JAMAIS repita perguntas cujas respostas já estão no contexto.

USO DE TOOLS (sempre que aplicável):
- SEMPRE que o usuário mencionar um código de produto (ex: "120-02", "259-08", "MOT-220"), nome de produto (ex: "cortina rolo", "persiana", "tela solar"), tecido (ex: "blackout", "screen"), ou dimensões (ex: "2x1,5"), CHAME a tool \`buscar_produto\` com o termo EXATO que o usuário digitou.
- Quando o usuário falar de acessórios (motor, trilho, suporte, bandô), CHAME \`buscar_acessorio\`.
- Quando ele disser "finalizar" / "pode salvar" / "está bom", CHAME \`finalizar_orcamento\`.
- NUNCA invente preços ou nomes de produto — sempre use as tools primeiro.`;

// URL do microsserviço RAG v2 (FastAPI + LangGraph + FAISS)
const RAG_V2_URL = process.env.RAG_V2_URL || "http://127.0.0.1:8001";

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], draft = null } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages obrigatório" });
    }

    // Compila system prompt + estado do orçamento em construção
    let draftInfo = "";
    if (draft) {
      const c = draft.cliente || {};
      const temCliente = c.nome || c.telefone || c.endereco;
      const temItens = (draft.itens || []).length > 0;

      if (temCliente || temItens) {
        draftInfo = "\n\n[CONTEXTO ATUAL]";
        if (c.nome) draftInfo += `\nCliente: ${c.nome}`;
        if (c.telefone) draftInfo += `\nTelefone: ${c.telefone}`;
        if (c.endereco) draftInfo += `\nEndereço: ${c.endereco}`;
        if (temItens) {
          draftInfo += "\nItens no orçamento:";
          (draft.itens || []).forEach((i, idx) => {
            draftInfo += `\n${idx + 1}. ${i.produto?.nome || i.nome} - ${i.selection?.largura || 1}m x ${i.selection?.altura || 1}m - R$ ${(i.subtotal || 0).toFixed(2)}`;
          });
          draftInfo += `\nTotal: R$ ${(draft.total || 0).toFixed(2)}`;
        }
      }
    }

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT + draftInfo },
      ...messages,
    ];

    // Loop com tools: Ollama pode chamar tool_calls (buscar_produto, etc)
    // e a gente executa contra o RAG v2 / Supabase e devolve o resultado.
    let ollamaMsgs = [...fullMessages];
    let toolCallsExecuted = [];
    let reply = "";
    const maxIters = 3;
    for (let i = 0; i < maxIters; i++) {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: ollamaMsgs,
          tools: TOOLS,
          stream: false,
          think: false,
          options: { temperature: 0.3, num_predict: 400 },
        }),
      });
      if (!ollamaRes.ok) {
        const txt = await ollamaRes.text();
        throw new Error(`Ollama chat failed: ${ollamaRes.status} ${txt}`);
      }
      const data = await ollamaRes.json();
      const assistantMsg = data?.message || {};
      const tcs = assistantMsg.tool_calls || [];

      // Adiciona a resposta do assistant ao histórico
      ollamaMsgs.push(assistantMsg);

      if (!tcs.length) {
        reply = assistantMsg.content || "";
        // Fallback inteligente: se Gemma não chamou tool mas a mensagem parece
        // de produto (código, dimensões, keyword), força busca_produto no RAG.
        const pareceProduto = _msgPareceProduto(messages);
        if (pareceProduto) {
          console.log(`[chat] Gemma ignorou tool — forçando buscar_produto para "${pareceProduto}"`);
          const forced = await executeTool("buscar_produto", { query: pareceProduto, limit: 20 }, req);
          toolCallsExecuted.push({ name: "buscar_produto", args: { query: pareceProduto }, result: forced, forced: true });
        }
        break;
      }

      // Executa cada tool_call e adiciona o resultado ao histórico
      for (const tc of tcs) {
        const fnName = tc.function?.name || tc.name;
        let fnArgs = {};
        try {
          fnArgs = typeof tc.function?.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : (tc.function?.arguments || {});
        } catch (_) {
          fnArgs = {};
        }
        const toolResult = await executeTool(fnName, fnArgs, req);
        toolCallsExecuted.push({ name: fnName, args: fnArgs, result: toolResult });
        ollamaMsgs.push({
          role: "tool",
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        });
      }
    }

    res.json({
      reply,
      tool_calls: toolCallsExecuted,
      done: true,
    });
  } catch (err) {
    console.error("[chat]", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

/**
 * Detecta se a mensagem do usuário parece ser de produto (código, tecido, dimensões)
 * sem precisar do Gemma. Usado como fallback para forçar tool_call quando o Gemma erra.
 */
function _msgPareceProduto(messages) {
  if (!messages?.length) return null;
  const last = messages[messages.length - 1];
  if (last?.role !== "user") return null;
  const txt = (last.content || "").toLowerCase();
  if (!txt.trim()) return null;
  // Muito curta / só saudação → ignora
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem)\b/.test(txt.trim())) return null;
  // Código XXX-YY (ex: 120-02, MOT-220)
  if (/\b[a-z]*\d[\w\-]+\b/.test(txt)) return txt;
  // Dimensões 2x1,5 / 2.0 x 1.5
  if (/\d+([.,]\d+)?\s*[x×]\s*\d+/.test(txt)) return txt;
  // Palavras-chave de produto
  const kw = /\b(cortina|persiana|tela\s*solar|solflex|screen|blackout|rolo|rol[oô]|romana|wave|vertical|horizontal|plissada|painel|c[oó]digo|band[oô]|motor|trilho)\b/;
  if (kw.test(txt)) return txt;
  return null;
}

// =============================================================================
// RAG v2 — DELEGA para microsserviço Python (:8001, LangGraph + FAISS)
// Resolve busca estruturada com pós-filtragem robusta por modelo/tecido.
// =============================================================================

app.post("/api/resolve", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message obrigatório" });
    }

    const timeoutMs = 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch(`${RAG_V2_URL}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const txt = await resp.text();
      console.error(`[resolve] RAG v2 retornou ${resp.status}: ${txt.slice(0, 200)}`);
      // Fallback gracioso: retorna resposta vazia para o chat decidir
      return res.status(502).json({ error: `RAG v2 indisponível: ${resp.status}` });
    }

    const resultado = await resp.json();
    console.log(`[resolve] msg="${message.slice(0, 50)}..." | tem_produto=${resultado?.item?.tem_produto} | estrategia=${resultado?.estrategia_busca}`);
    res.json(resultado);
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("[resolve] RAG v2 timeout (>30s)");
      return res.status(504).json({ error: "RAG v2 timeout" });
    }
    console.error("[resolve]", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/reindex", async (req, res) => {
  try {
    const { entity, dry_run } = req.body || {};
    const resp = await fetch(`${RAG_V2_URL}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, dry_run }),
    });
    const data = await resp.json();
    res.status(resp.ok ? 200 : 500).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

async function executeTool(name, args, req) {
  switch (name) {
    case "buscar_produto":
    case "buscar_acessorio": {
      // Delega para o RAG v2 (LangGraph + FAISS + ILIKE corrigido)
      // Suporta código (120-02), tecido (tela solar), modelo (cortina rolo), etc
      try {
        const limit = args.limit || 20;
        const resp = await fetch(`${RAG_V2_URL}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: args.query }),
        });
        if (!resp.ok) {
          // Fallback: rota antiga (embedding RPC)
          throw new Error(`RAG v2 ${resp.status}`);
        }
        const data = await resp.json();
        const item = data?.item || {};
        const produto = item.produto;
        const opcoes = (item.opcoes || []).slice(0, limit);

        // Formato para o Gemma entender: 1 produto escolhido + lista de opções
        const resultados = [];
        if (produto) {
          resultados.push({
            escolhido: true,
            id: produto.id,
            codigo: produto.codigo,
            nome: produto.nome,
            preco_venda: produto.preco_venda,
            tecido: produto.tecido,
            modelo: produto.modelo,
          });
        }
        for (const o of opcoes) {
          resultados.push({
            id: o.id,
            codigo: o.codigo,
            nome: o.nome,
            preco_venda: o.preco_venda,
          });
        }
        return {
          query: args.query,
          estrategia: data.estrategia_busca,
          precisa_escolha: item.precisa_escolha || false,
          total_encontrados: item.opcoes?.length || 0,
          resultados,
        };
      } catch (e) {
        console.error(`[buscar_produto] RAG v2 falhou: ${e.message}, usando fallback`);
        const table = name === "buscar_acessorio" ? "produtos_acessorios" : "produtos";
        const { data } = await supabaseAdmin
          .from(table)
          .select("id, codigo, nome, preco_venda, unit_price")
          .or(`nome.ilike.%${args.query}%,codigo.ilike.%${args.query}%`)
          .limit(args.limit || 5);
        return { resultados: data || [], note: `fallback textual: ${e.message}` };
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