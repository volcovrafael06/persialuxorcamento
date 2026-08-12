#!/usr/bin/env node
// scripts/meta-ads-server.mjs
//
// MCP server local que expõe tools da Meta Ads API via stdio.
// Conecta direto na Meta Graph API — só precisa do META_ACCESS_TOKEN.
//
// Uso:
//   META_ACCESS_TOKEN=EAAxxxxxxx node scripts/meta-ads-server.mjs
//
// Configuração no Claude Desktop (~/.claude/settings.json):
//   { "mcpServers": {
//     "persialux-meta": {
//       "command": "node",
//       "args": ["/caminho/absoluto/para/projeto/scripts/meta-ads-server.mjs"],
//       "env": { "META_ACCESS_TOKEN": "EAAxxxxxxx" }
//     }
//   }}
//
// 15 tools em 3 grupos:
//   [Insights]    list_ad_accounts, get_account_insights, get_campaign_insights,
//                 get_adset_insights, get_ad_insights, get_top_creatives
//   [Campaigns]   update_campaign_status, update_adset_status, update_ad_status,
//                 update_campaign_budget
//   [Catalog]     list_catalogs, list_catalog_products, get_catalog_product,
//                 create_catalog_product, update_product_price_stock

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const META_GRAPH = 'https://graph.facebook.com/v18.0';

// ---------- helpers ----------

function getToken() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_ACCESS_TOKEN não configurado. Defina a variável de ambiente.');
  return token;
}

async function metaFetch(path, { method = 'GET', body, searchParams } = {}) {
  const token = getToken();
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

function text(s) {
  return { content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 2) }] };
}

function err(msg) {
  return { content: [{ type: 'text', text: `❌ ${msg}` }], isError: true };
}

// ---------- server ----------

const server = new McpServer(
  { name: 'persialux-meta', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// === INSIGHTS ===

server.registerTool('list_ad_accounts', {
  description: 'Lista todas as ad accounts acessíveis pelo token Meta.',
}, async () => {
  const r = await metaFetch('/me/adaccounts', {
    searchParams: { fields: 'id,name,account_status,currency,business_name,timezone_name' },
  });
  return r.ok ? text(r.data?.data || r.data) : err(r.error);
});

server.registerTool('get_account_insights', {
  description: 'Resumo agregado de uma ad account (spend, impressões, cliques, CTR, CPC, CPM, reach, conversões).',
  inputSchema: {
    ad_account_id: z.string().describe('ID numérico da ad account (sem act_)'),
    date_preset: z.string().describe('today|yesterday|last_7d|last_30d|this_month|last_month (padrão: last_30d)').optional(),
    time_range_since: z.string().describe('YYYY-MM-DD (alternativo a date_preset)').optional(),
    time_range_until: z.string().describe('YYYY-MM-DD').optional(),
  },
}, async (args) => {
  const { ad_account_id, date_preset = 'last_30d', time_range_since, time_range_until } = args;
  const params = {
    fields: 'spend,impressions,clicks,ctr,cpc,cpm,reach,results,cost_per_result',
    level: 'account',
    date_preset: time_range_since ? undefined : date_preset,
    time_range: time_range_since
      ? JSON.stringify({ since: time_range_since, until: time_range_until })
      : undefined,
  };
  const r = await metaFetch(`/act_${ad_account_id}/insights`, { searchParams: params });
  return r.ok ? text(r.data?.data?.[0] || r.data) : err(r.error);
});

server.registerTool('get_campaign_insights', {
  description: 'Insights por campanha (spend, CTR, conversions e ROAS de cada campanha).',
  inputSchema: {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  },
}, async (args) => {
  const { ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 } = args;
  const r = await metaFetch(`/act_${ad_account_id}/insights`, {
    searchParams: {
      fields: 'campaign_id,name,status,spend,impressions,clicks,ctr,cpc,results,cost_per_result',
      level: 'campaign',
      date_preset,
      sort,
      limit,
    },
  });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

server.registerTool('get_adset_insights', {
  description: 'Insights por ad set (identifica ad sets com alto gasto mas baixa conversão).',
  inputSchema: {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  },
}, async (args) => {
  const { ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 } = args;
  const r = await metaFetch(`/act_${ad_account_id}/insights`, {
    searchParams: {
      fields: 'adset_id,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,results',
      level: 'adset',
      date_preset,
      sort,
      limit,
    },
  });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

server.registerTool('get_ad_insights', {
  description: 'Insights por ad individual (ranqueia criativos).',
  inputSchema: {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  },
}, async (args) => {
  const { ad_account_id, date_preset = 'last_30d', sort = 'spend_descending', limit = 25 } = args;
  const r = await metaFetch(`/act_${ad_account_id}/insights`, {
    searchParams: {
      fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,results',
      level: 'ad',
      date_preset,
      sort,
      limit,
    },
  });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

server.registerTool('get_top_creatives', {
  description: 'Top N criativos ordenados por resultados (melhor conversão).',
  inputSchema: {
    ad_account_id: z.string(),
    date_preset: z.string().optional(),
    limit: z.number().optional(),
  },
}, async (args) => {
  const { ad_account_id, date_preset = 'last_30d', limit = 10 } = args;
  const r = await metaFetch(`/act_${ad_account_id}/insights`, {
    searchParams: {
      fields: 'ad_id,ad_name,spend,results,cost_per_result',
      level: 'ad',
      date_preset,
      sort: 'results_descending',
      limit,
    },
  });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

// === CAMPAIGNS ===

server.registerTool('update_campaign_status', {
  description: 'Pausa ou ativa uma campanha.',
  inputSchema: {
    campaign_id: z.string().describe('ID da campanha na Meta'),
    status: z.enum(['ACTIVE', 'PAUSED']).describe('Novo status'),
    confirm: z.boolean().describe('Tem que ser true (proteção contra ativação acidental)'),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const r = await metaFetch(`/${args.campaign_id}`, { method: 'POST', searchParams: { status: args.status } });
  return r.ok ? text(`✓ Campanha ${args.campaign_id} → ${args.status}`) : err(r.error);
});

server.registerTool('update_adset_status', {
  description: 'Pausa ou ativa um ad set.',
  inputSchema: {
    adset_id: z.string(),
    status: z.enum(['ACTIVE', 'PAUSED']),
    confirm: z.boolean(),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const r = await metaFetch(`/${args.adset_id}`, { method: 'POST', searchParams: { status: args.status } });
  return r.ok ? text(`✓ Ad set ${args.adset_id} → ${args.status}`) : err(r.error);
});

server.registerTool('update_ad_status', {
  description: 'Pausa ou ativa um ad individual.',
  inputSchema: {
    ad_id: z.string(),
    status: z.enum(['ACTIVE', 'PAUSED']),
    confirm: z.boolean(),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const r = await metaFetch(`/${args.ad_id}`, { method: 'POST', searchParams: { status: args.status } });
  return r.ok ? text(`✓ Ad ${args.ad_id} → ${args.status}`) : err(r.error);
});

server.registerTool('update_campaign_budget', {
  description: 'Altera o budget diário de uma campanha (em centavos BRL, ex: 5000 = R$50).',
  inputSchema: {
    campaign_id: z.string(),
    daily_budget_cents: z.number().describe('Budget diário em centavos (ex: 5000 = R$50)'),
    confirm: z.boolean(),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const r = await metaFetch(`/${args.campaign_id}`, {
    method: 'POST',
    searchParams: { daily_budget: args.daily_budget_cents },
  });
  return r.ok
    ? text(`✓ Campaign ${args.campaign_id} budget → R$${(args.daily_budget_cents / 100).toFixed(2)}/dia`)
    : err(r.error);
});

// === CATALOG ===

server.registerTool('list_catalogs', {
  description: 'Lista todos os Meta Product Catalogs acessíveis.',
}, async () => {
  const r = await metaFetch('/me/product_catalogs', {
    searchParams: { fields: 'id,name,vertical,product_count' },
  });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

server.registerTool('list_catalog_products', {
  description: 'Lista produtos de um catalog (com filtro opcional por nome/categoria).',
  inputSchema: {
    catalog_id: z.string(),
    limit: z.number().optional(),
    filter: z.string().describe('Filtro Graph API (ex: {"name":{"i_contains":"cortina"}})').optional(),
  },
}, async (args) => {
  const { catalog_id, limit = 25, filter } = args;
  const params = { fields: 'id,name,price,availability,image_url', limit };
  if (filter) params.filter = filter;
  const r = await metaFetch(`/${catalog_id}/products`, { searchParams: params });
  return r.ok ? text(r.data?.data || []) : err(r.error);
});

server.registerTool('get_catalog_product', {
  description: 'Detalhe de um produto específico do catalog.',
  inputSchema: { product_id: z.string() },
}, async (args) => {
  const r = await metaFetch(`/${args.product_id}`, {
    searchParams: { fields: 'id,name,description,price,availability,link,image_url,brand,category' },
  });
  return r.ok ? text(r.data) : err(r.error);
});

server.registerTool('create_catalog_product', {
  description: 'Cria um produto no Meta Catalog.',
  inputSchema: {
    catalog_id: z.string(),
    retailer_id: z.string().describe('Código do produto (SKU do DB PersiaLux)'),
    name: z.string().describe('Nome do produto'),
    price_cents: z.number().describe('Preço em centavos (ex: 19990 = R$199,90)'),
    availability: z.enum(['in stock', 'out of stock']),
    image_url: z.string().optional(),
    confirm: z.boolean(),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const { catalog_id, name, retailer_id, price_cents, availability, image_url } = args;
  const body = { name, retailer_id, price: price_cents, availability };
  if (image_url) body.image_url = image_url;
  const r = await metaFetch(`/${catalog_id}/products`, { method: 'POST', body });
  return r.ok ? text(`✓ Produto criado: ${JSON.stringify(r.data)}`) : err(r.error);
});

server.registerTool('update_product_price_stock', {
  description: 'Atualiza preço e disponibilidade de um produto no catalog.',
  inputSchema: {
    product_id: z.string(),
    price_brl: z.number().describe('Preço em reais (ex: 199.90)'),
    availability: z.enum(['in stock', 'out of stock', 'preorder', 'available for order', 'discontinued']),
    confirm: z.boolean(),
  },
}, async (args) => {
  if (!args.confirm) return err('Passe confirm=true pra confirmar');
  const r = await metaFetch(`/${args.product_id}`, {
    method: 'POST',
    body: { price: Math.round(args.price_brl * 100), availability: args.availability },
  });
  return r.ok ? text(`✓ Produto ${args.product_id} → R$${args.price_brl}, ${args.availability}`) : err(r.error);
});

// ---------- bootstrap ----------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[persialux-meta] Erro fatal:', err.message);
  process.exit(1);
});
