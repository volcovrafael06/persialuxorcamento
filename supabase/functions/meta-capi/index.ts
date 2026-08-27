// supabase/functions/meta-capi/index.ts
// Proxy server-side para Meta Conversions API (CAPI).
//
// Por que server-side:
//  - iOS 14+ bloqueia fbq() no browser; CAPI server-side é a fonte da verdade.
//  - Não depende do AdBlock nem do consent mode.
//  - Token fica em secret, nunca exposto no bundle.
//
// Setup uma vez:
//   supabase secrets set META_PIXEL_ID=1234567890
//   supabase secrets set META_ACCESS_TOKEN=EAAxxxxxxx
//   supabase functions deploy meta-capi
//
// Input esperado:
//   { event_name, event_id, user_data, custom_data, event_source_url, action_source }
//
// Output:
//   { ok: true, events_received, fbtrace_id }  // se 200 da Meta
//   { ok: false, error, fbtrace_id }           // se 4xx/5xx

// @ts-nocheck
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const META_API_VERSION = 'v18.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// SHA-256 em hex lowercase. Subset do Web Crypto API disponível em Deno.
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input.toLowerCase().trim());
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Hash user_data conforme docs Meta: email lowercase trim, phone só dígitos (sem +).
async function hashUserData(userData: Record<string, any>) {
  const hashed: Record<string, any> = {};
  if (userData.em) hashed.em = await sha256Hex(String(userData.em));
  if (userData.ph) {
    const onlyDigits = String(userData.ph).replace(/\D/g, '');
    if (onlyDigits) hashed.ph = await sha256Hex(onlyDigits);
  }
  // external_id vem em texto puro (id do orçamento) — útil pra matching.
  if (userData.external_id) hashed.external_id = String(userData.external_id);
  if (userData.client_ip_address) hashed.client_ip_address = userData.client_ip_address;
  if (userData.user_agent) hashed.user_agent = userData.user_agent;
  if (userData.fbc) hashed.fbc = userData.fbc;
  if (userData.fbp) hashed.fbp = userData.fbp;
  return hashed;
}

Deno.serve(async (req: Request) => {
  // CORS preflight (necessário se o front chamar do browser).
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pixelId = Deno.env.get('META_PIXEL_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');
  if (!pixelId || !accessToken) {
    return new Response(
      JSON.stringify({ error: 'META_PIXEL_ID / META_ACCESS_TOKEN não configurados nos secrets' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Validação de input.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido (esperava JSON)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    event_name,
    event_id,
    user_data = {},
    custom_data = {},
    event_source_url,
    action_source = 'business_messaging',
    test_event_code, // opcional, pra usar o "Test Events" do Events Manager
  } = body;

  if (!event_name || !event_id) {
    return new Response(
      JSON.stringify({ error: 'event_name e event_id são obrigatórios' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Event_time em segundos (epoch) — Meta aceita até 7 dias no passado.
  const event_time = Math.floor(Date.now() / 1000);

  // Enriquece user_data com IP/UA do request (Meta usa pra matching).
  const enrichedUserData = await hashUserData({
    ...user_data,
    client_ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
  });

  const payload = {
    data: [{
      event_name,
      event_time,
      event_id,
      event_source_url: event_source_url || undefined,
      action_source,
      user_data: enrichedUserData,
      custom_data,
    }],
    // Se vier test_event_code, é modo teste (não conta nos relatórios de produção).
    ...(test_event_code ? { test_event_code } : {}),
  };

  const url = `${META_GRAPH_URL}/${pixelId}/events?access_token=${accessToken}`;

  try {
    const metaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const metaBody = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: metaRes.status,
          error: metaBody.error?.message || metaBody || 'Meta CAPI retornou erro',
          fbtrace_id: metaBody.error?.fbtrace_id,
        }),
        {
          status: metaRes.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        events_received: metaBody.events_received,
        fbtrace_id: metaBody.fbtrace_id,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
