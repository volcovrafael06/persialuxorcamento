// src/services/metaCapiService.js
// Cliente server-side da Meta Conversions API (CAPI).
//
// Dispara eventos Lead (orçamento pendente) e Purchase (finalizado) pra Meta,
// que combina com o fbq() client-side via event_id compartilhado (se houver pixel).
//
// PII (email, telefone) é hasheada ANTES de sair do browser — Meta recebe SHA-256.
// O event_id (UUID) é a chave de dedupe; se o mesmo ID chegar duas vezes (browser +
// server), Meta ignora a duplicata.
//
// Por que isolar em um service: se a Meta mudar a API ou aparecer um retry job,
// só mexemos aqui.

import { supabase } from '../supabase/client';

const SUPABASE_URL = 'https://ozxpdccutroxtjqcpjea.supabase.co';
const EDGE_FUNCTION_NAME = 'meta-capi';

// SHA-256 hex lowercase. Web Crypto API é síncrona via Promise.
async function sha256Hex(input) {
  if (!input) return null;
  const normalized = String(input).toLowerCase().trim();
  const buf = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Phone: Meta exige só dígitos (DDI + DDD + número, sem +).
function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Envia um evento à Meta CAPI via Edge Function.
 *
 * @param {Object} params
 * @param {string} params.eventName       - 'Lead' | 'Purchase' | (outro padrão Meta)
 * @param {string} params.eventId         - UUID do evento (chave de dedupe)
 * @param {Object} params.cliente         - { name, email, phone }
 * @param {Object} params.orcamento       - { id, numero_orcamento, valor_total, produtos_json, acessorios_json }
 * @param {string} [params.eventSourceUrl] - URL onde o lead converteu
 * @param {string} [params.actionSource]   - 'website' (default) | 'business_messaging' | 'phone_call'
 * @param {string} [params.testEventCode]  - Código de teste do Events Manager (dev)
 * @returns {Promise<{ok: boolean, events_received?: number, fbtrace_id?: string, error?: string}>}
 */
export async function sendMetaEvent({
  eventName,
  eventId,
  cliente,
  orcamento,
  eventSourceUrl,
  actionSource = 'website',
  testEventCode,
}) {
  // user_data: hash ANTES de enviar (defesa em profundidade — o back também hashing).
  const userData = {
    external_id: orcamento?.id || undefined,
  };
  if (cliente?.email) userData.em = await sha256Hex(cliente.email);
  const phone = digitsOnly(cliente?.phone);
  if (phone) userData.ph = await sha256Hex(phone);

  // custom_data: dados da conversão em si (não-identificáveis).
  const contentIds = [];
  let numItems = 0;
  // Tenta extrair produtos do JSON armazenado (pode ser string ou array).
  try {
    const produtos = typeof orcamento?.produtos_json === 'string'
      ? JSON.parse(orcamento.produtos_json)
      : orcamento?.produtos_json || [];
    const acessorios = typeof orcamento?.acessorios_json === 'string'
      ? JSON.parse(orcamento.acessorios_json)
      : orcamento?.acessorios_json || [];
    produtos.forEach(p => {
      if (p?.produto_id) contentIds.push(p.produto_id);
    });
    numItems = (produtos.length || 0) + (acessorios.length || 0);
  } catch {
    // Silencioso — content_ids vazio não impede o evento.
  }

  const customData = {
    currency: 'BRL',
    value: parseFloat(orcamento?.valor_total) || 0,
    content_ids: contentIds,
    content_type: 'product',
    num_items: numItems,
    content_name: `Orçamento #${orcamento?.numero_orcamento || orcamento?.id || ''}`,
  };

  const body = {
    event_name: eventName,
    event_id: eventId,
    user_data: userData,
    custom_data: customData,
    event_source_url: eventSourceUrl || (typeof window !== 'undefined' ? window.location.href : undefined),
    action_source: actionSource,
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  // Pega o token do session atual (Edge Function do Supabase exige JWT válido).
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  const anonKey = 'sb_publishable_78VLP54uyTLDDXsCan3N9w_G0_SqIzy'; // mesma do client.js

  const url = `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[meta-capi] erro:', res.status, data);
      return { ok: false, error: data?.error || `HTTP ${res.status}`, fbtrace_id: data?.fbtrace_id };
    }
    return { ok: true, events_received: data?.events_received, fbtrace_id: data?.fbtrace_id };
  } catch (err) {
    // Falha de rede não bloqueia o fluxo principal — log e segue.
    console.warn('[meta-capi] falha de rede (não crítico):', err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

/**
 * Persiste o event_id e o resultado na linha do orçamento.
 * Chamada APÓS sendMetaEvent, best-effort.
 */
export async function persistMetaEventResult(orcamentoId, { eventId, eventName, response }) {
  if (!orcamentoId || !eventId) return;
  try {
    await supabase.from('orcamentos').update({
      meta_event_id: eventId,
      meta_event_name: eventName,
      meta_event_sent_at: new Date().toISOString(),
      meta_event_response: response || null,
    }).eq('id', orcamentoId);
  } catch (err) {
    console.warn('[meta-capi] falha ao persistir event_id:', err?.message || err);
  }
}
