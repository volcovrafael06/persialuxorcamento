// supabase/functions/mcp-meta/index.ts
//
// MCP server (Model Context Protocol) que expõe tools da Meta Ads API.
// Disponível pra LLMs (Claude, GPT, Cursor, etc) que falam MCP via HTTP.
//
// Tools expostas (3 grupos):
//   [Insights]   list_ad_accounts, get_account_insights, get_campaign_insights,
//                get_adset_insights, get_ad_insights, get_top_creatives
//   [Campaigns]  update_campaign_status, update_adset_status, update_ad_status,
//                create_campaign, update_campaign_budget
//   [Catalog]    list_catalogs, list_catalog_products, get_catalog_product,
//                create_catalog_product, update_product_price_stock
//
// Auth: JWT do Supabase Auth (Authorization: Bearer <token>).
//       Quando o JWT é do profile role='admin', libera mutating tools.
//       Não-admins só conseguem chamar tools de leitura.
//
// Variáveis de ambiente:
//   META_ACCESS_TOKEN     já configurado em Supabase Secrets
//   META_PIXEL_ID         id do pixel (informativo)
//
// Como conectar do Claude Desktop (config):
//   { "mcpServers": {
//     "persialux-meta": {
//       "url": "https://ozxpdccutroxtjqcpjea.supabase.co/functions/v1/mcp-meta",
//       "headers": { "Authorization": "Bearer <anon-key>" }
//     }
//   }}

// @ts-nocheck
declare const Deno: any;

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js';
import { z } from 'npm:zod@3.23.8';
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js';

const SUPABASE_URL = 'https://ozxpdccutroxtjqcpjea.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_78VLP54uyTLDDXsCan3N9w_G0_SqIzy';
const META_GRAPH = 'https://graph.facebook.com/v18.0';

// ---------- helpers ----------

async function metaFetch(path, { method = 'GET', body, accessToken, searchParams } = {}) {
  const token = accessToken || Deno.env.get('META_ACCESS_TOKEN');
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado no Supabase Secrets');
  const url = new URL(`${META_GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data?.error?.message || data?.error || `HTTP ${res.status}`,
      fbtrace_id: data?.error?.fbtrace_id,
    };
  }
  return { ok: true, data };
}

// Valida JWT do Supabase Auth e retorna profile (role).
// Aceita user JWT OU anon key. Anon key = role 'user' (sem permissão pra mutating tools).
async function getAuthProfile(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return { error: 'Falta Authorization header' };
  const token = authHeader.slice('Bearer '.length).trim();
  // /auth/v1/user valida o JWT e retorna o user. Anon key é aceita aqui também.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
  });
  if (!res.ok) return { error: 'JWT inválido ou expirado' };
  const user = await res.json();
  // Tenta buscar profile.role pra identificar admin.
  // Se RLS bloquear, role fica 'user' (default).
  let role = 'user';
  try {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      },
    );
    if (profileRes.ok) {
      const profiles = await profileRes.json();
      role = profiles?.[0]?.role || 'user';
    }
  } catch {
    // Silencioso — role default 'user' tá ok.
  }
  return { user, role, error: null };
}

function textResult(s) {
  return { content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] };
}
function errResult(msg) {
  return { content: [{ type: 'text', text: `❌ ${msg}` }], isError: true };
}

// ---------- server ----------

const server = new McpServer({
  name: 'persialux-meta',
  version: '1.0.0',
});

// authRequired fica disponível em todas as tools via closure.
let authRequired = true;
let userRole = 'user';

// === INSIGHTS (leitura) ===

server.tool(
  'list_ad_accounts',
  'Lista todas as ad accounts acessíveis pelo token Meta, com nome, status, currency e BM.',
  {},
  async () => {
    const r = await metaFetch('/me/adaccounts', {
      searchParams: { fields: 'id,name,account_status,currency,business_name,timezone_name' },
    });
    return r.ok ? textResult(r.data?.data || r.data) : errResult(r.error);
  },
);

server.tool(
  'get_account_insights',
  'Resumo agregado de uma ad account num período. Retorna spend, impressions, clicks, CTR, CPC, CPM, reach, conversions.',
  {
    ad_account_id: z.string().describe('ID numérico da ad account (sem act_)'),
    date_preset: z.string().optional().describe('today, yesterday, last_7d, last_30d, this_month, last_month (default last_30d)'),
    time_range_since: z.string().optional().describe('YYYY-MM-DD'),
    time_range_until: z.string().optional().describe('YYYY-MM-DD'),
  },
  async ({ ad_account_id, date_preset = 'last_30d', time_range_since, time_range_until }) => {
    const params = {
      fields: 'spend,impressions,clicks,ctr,cpc,cpm,reach,actions,cost_per_action_type,purchase_roas',
      level: 'account',
      date_preset: time_range_since ? undefined : date_preset,
      time_range: time_range_since
        ? JSON.stringify({ since: time_range_since, until: time_range_until })
        : undefined,
    };
    const r = await metaFetch(`/act_${ad_account_id}/insights`, { searchParams: params });
    return r.ok ? textResult(r.data?.data?.[0] || r.data) : errResult(r.error);
  },
);

server.tool(
  'get_campaign_insights',
  'Insights por campanha de uma ad account. Mostra spend, CTR, conversions e ROAS de cada campanha.',
  {
    ad_account_id: z.string().describe('ID numérico da ad account (sem act_)'),
    date_preset: z.string().optional().describe('last_7d, last_30d (default last_30d)'),
    sort: z.string().optional().describe('Campo pra ordenar (default spend_descending)'),
    limit: z.number().optional().describe('Quantidade (default 25)'),
  },
  async ({ ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 }) => {
    const r = await metaFetch(`/act_${ad_account_id}/insights`, {
      searchParams: {
        fields: 'campaign_id,campaign_name,status,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,purchase_roas',
        level: 'campaign',
        date_preset,
        sort,
        limit,
      },
    });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

server.tool(
  'get_adset_insights',
  'Insights por ad set. Útil pra encontrar ad sets com gasto alto mas conversão baixa.',
  {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    sort: z.string().optional().describe('Default spend_descending'),
    limit: z.number().optional(),
  },
  async ({ ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 }) => {
    const r = await metaFetch(`/act_${ad_account_id}/insights`, {
      searchParams: {
        fields: 'adset_id,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,purchase_roas',
        level: 'adset',
        date_preset,
        sort,
        limit,
      },
    });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

server.tool(
  'get_ad_insights',
  'Insights por ad individual. Bom pra ranquear criativos.',
  {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 }) => {
    const r = await metaFetch(`/act_${ad_account_id}/insights`, {
      searchParams: {
        fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,purchase_roas',
        level: 'ad',
        date_preset,
        sort,
        limit,
      },
    });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

server.tool(
  'get_top_creatives',
  'Top N criativos ordenados por ROAS. Combina ad insights com creative thumbnails.',
  {
    ad_account_id: z.string(),
    date_preset: z.string().optional().describe('Default last_30d'),
    limit: z.number().optional().describe('Default 10'),
  },
  async ({ ad_account_id, date_preset = 'last_30d', limit = 10 }) => {
    const r = await metaFetch(`/act_${ad_account_id}/insights`, {
      searchParams: {
        fields: 'ad_id,ad_name,spend,purchase_roas,actions,cost_per_action_type',
        level: 'ad',
        date_preset,
        sort: 'purchase_roas_descending',
        limit,
      },
    });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

// === CAMPAIGNS (mutação, exige admin) ===

server.tool(
  'update_campaign_status',
  '[ADMIN] Pausa ou ativa uma campanha.',
  {
    campaign_id: z.string(),
    status: z.enum(['ACTIVE', 'PAUSED']),
    confirm: z.boolean().describe('Tem que ser true. Segurança contra ativação acidental.'),
  },
  async ({ campaign_id, status, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode pausar/ativar campanhas');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    const r = await metaFetch(`/${campaign_id}`, {
      method: 'POST',
      searchParams: { status },
    });
    return r.ok ? textResult(`✓ Campanha ${campaign_id} → ${status}`) : errResult(r.error);
  },
);

server.tool(
  'update_adset_status',
  '[ADMIN] Pausa ou ativa um ad set.',
  {
    adset_id: z.string(),
    status: z.enum(['ACTIVE', 'PAUSED']),
    confirm: z.boolean(),
  },
  async ({ adset_id, status, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode pausar/ativar ad sets');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    const r = await metaFetch(`/${adset_id}`, { method: 'POST', searchParams: { status } });
    return r.ok ? textResult(`✓ Ad set ${adset_id} → ${status}`) : errResult(r.error);
  },
);

server.tool(
  'update_ad_status',
  '[ADMIN] Pausa ou ativa um ad individual.',
  {
    ad_id: z.string(),
    status: z.enum(['ACTIVE', 'PAUSED']),
    confirm: z.boolean(),
  },
  async ({ ad_id, status, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode pausar/ativar ads');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    const r = await metaFetch(`/${ad_id}`, { method: 'POST', searchParams: { status } });
    return r.ok ? textResult(`✓ Ad ${ad_id} → ${status}`) : errResult(r.error);
  },
);

server.tool(
  'update_campaign_budget',
  '[ADMIN] Altera o budget diário (ou lifetime) de uma campanha. Aceita valor em centavos (BRL).',
  {
    campaign_id: z.string(),
    daily_budget_cents: z.number().describe('Novo budget diário em centavos (ex: 5000 = R$50)'),
    confirm: z.boolean(),
  },
  async ({ campaign_id, daily_budget_cents, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode alterar budget');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    const r = await metaFetch(`/${campaign_id}`, {
      method: 'POST',
      searchParams: { daily_budget: daily_budget_cents },
    });
    return r.ok ? textResult(`✓ Campaign ${campaign_id} budget → R$${(daily_budget_cents/100).toFixed(2)}/dia`) : errResult(r.error);
  },
);

// === CATALOG (leitura + escrita) ===

server.tool(
  'list_catalogs',
  'Lista todos os Meta Product Catalogs acessíveis.',
  {},
  async () => {
    const r = await metaFetch('/me/product_catalogs', {
      searchParams: { fields: 'id,name,vertical,product_count' },
    });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

server.tool(
  'list_catalog_products',
  'Lista produtos de um catalog. Aceita filtro opcional por nome/categoria.',
  {
    catalog_id: z.string(),
    limit: z.number().optional().describe('Default 25'),
    filter: z.string().optional().describe('Filtro Graph API (ex: {\'name\':{\'i_contains\':\'cortina\'}})'),
  },
  async ({ catalog_id, limit = 25, filter }) => {
    const params = { fields: 'id,name,price,availability,image_url', limit };
    if (filter) params.filter = filter;
    const r = await metaFetch(`/${catalog_id}/products`, { searchParams: params });
    return r.ok ? textResult(r.data?.data || []) : errResult(r.error);
  },
);

server.tool(
  'get_catalog_product',
  'Detalhe de um produto específico do catalog.',
  {
    product_id: z.string(),
  },
  async ({ product_id }) => {
    const r = await metaFetch(`/${product_id}`, {
      searchParams: { fields: 'id,name,description,price,availability,link,image_url,brand,category,custom_data' },
    });
    return r.ok ? textResult(r.data) : errResult(r.error);
  },
);

server.tool(
  'create_catalog_product',
  '[ADMIN] Cria um produto no Meta Catalog a partir dos dados do DB Supabase (produtos).',
  {
    product_id: z.string().describe('UUID do produto na tabela public.produtos do Supabase'),
    catalog_id: z.string().describe('ID do catalog onde o produto vai ser criado'),
    confirm: z.boolean(),
  },
  async ({ product_id, catalog_id, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode criar produtos no catalog');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    // 1. Lê o produto do Supabase.
    const headers = { apikey: SUPABASE_ANON_KEY };
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/produtos?id=eq.${product_id}&select=nome,codigo,preco_venda,modelo,tecido`,
      { headers },
    );
    if (!dbRes.ok) return errResult(`Produto ${product_id} não encontrado no DB`);
    const [produto] = await dbRes.json();
    if (!produto) return errResult(`Produto ${product_id} sem retorno`);
    // 2. Cria no Meta Catalog.
    const r = await metaFetch(`/${catalog_id}/products`, {
      method: 'POST',
      body: {
        name: produto.nome,
        retailer_id: produto.codigo,
        price: Math.round(parseFloat(produto.preco_venda || 0) * 100),
        availability: 'in stock',
        custom_data: {
          modelo: produto.modelo || '',
          tecido: produto.tecido || '',
        },
      },
    });
    return r.ok ? textResult(`✓ Produto criado no catalog: ${JSON.stringify(r.data)}`) : errResult(r.error);
  },
);

server.tool(
  'update_product_price_stock',
  '[ADMIN] Atualiza preço e disponibilidade de um produto no catalog.',
  {
    product_id: z.string().describe('ID Meta do produto (não o UUID do Supabase)'),
    price_brl: z.number().describe('Novo preço em reais (ex: 199.90)'),
    availability: z.enum(['in stock', 'out of stock', 'preorder', 'available for order', 'discontinued']),
    confirm: z.boolean(),
  },
  async ({ product_id, price_brl, availability, confirm }) => {
    if (userRole !== 'admin') return errResult('Apenas admin pode atualizar catálogo');
    if (!confirm) return errResult('Passe confirm=true pra confirmar');
    const r = await metaFetch(`/${product_id}`, {
      method: 'POST',
      body: { price: Math.round(price_brl * 100), availability },
    });
    return r.ok ? textResult(`✓ Produto ${product_id} atualizado`) : errResult(r.error);
  },
);

// ---------- bootstrap do transport HTTP ----------

const transport = new WebStandardStreamableHTTPServerTransport({
  // Stateless: cada request é uma sessão nova. Bem mais simples pra Edge.
  sessionIdGenerator: undefined,
});
await server.connect(transport);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id',
      },
    });
  }

  // Healthcheck sem auth — útil pra o dashboard Supabase mostrar "ACTIVE".
  if (url.pathname.endsWith('/health')) {
    return new Response(JSON.stringify({ status: 'ok', name: 'persialux-meta' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Valida JWT do Supabase Auth.
  const auth = req.headers.get('authorization');
  const { role, error } = await getAuthProfile(auth);
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  userRole = role;

  // Delega pro transport MCP.
  return transport.handleRequest(req);
});
