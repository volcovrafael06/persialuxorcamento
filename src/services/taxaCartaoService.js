// src/services/taxaCartaoService.js
// Wrapper do CRUD + lookup em tempo real (taxa por bandeira × parcela).
// Reaproveitado pelo módulo financeiro + modal de pagamento.

import { supabase } from '../supabase/client';

export const BANDEIRAS_CARTAO = [
  { value: 'visa',       label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo',        label: 'Elo' },
  { value: 'hipercard',  label: 'Hipercard' },
  { value: 'amex',       label: 'American Express' },
  { value: 'diners',     label: 'Diners' },
  { value: 'aura',       label: 'Aura' },
  { value: 'discover',   label: 'Discover' },
  { value: 'jcb',        label: 'JCB' },
  { value: 'outros',     label: 'Outros' },
];

const tabelaAusente = (err) =>
  err?.code === 'PGRST205' || /not found/i.test(err?.message || '');

export const taxaCartaoService = {
  async getAll() {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .select('*')
      .order('bandeira', { ascending: true })
      .order('parcelas', { ascending: true });
    if (tabelaAusente(error)) return [];
    if (error) throw error;
    return data || [];
  },

  async getByBandeira(bandeira) {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .select('*')
      .eq('bandeira', bandeira)
      .order('parcelas', { ascending: true });
    if (tabelaAusente(error)) return [];
    if (error) throw error;
    return data || [];
  },

  // Lookup exato por (bandeira, parcelas). Retorna null se não existir.
  async getTaxa(bandeira, parcelas) {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .select('taxa_percentual,ativa')
      .eq('bandeira', bandeira)
      .eq('parcelas', parcelas)
      .eq('ativa', true)
      .maybeSingle();
    if (tabelaAusente(error)) return null;
    if (error) return null;
    return data;
  },

  async create(item) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      user_id: user?.id || null,
      bandeira: item.bandeira,
      parcelas: Number(item.parcelas),
      taxa_percentual: Number(item.taxa_percentual) || 0,
      ativa: item.ativa !== false,
      observacao: item.observacao || null,
    };
    const { data, error } = await supabase
      .from('taxas_cartao')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, item) {
    const payload = {
      taxa_percentual: Number(item.taxa_percentual) || 0,
      ativa: item.ativa !== false,
      observacao: item.observacao || null,
    };
    const { data, error } = await supabase
      .from('taxas_cartao')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setAtiva(id, ativa) {
    const { error } = await supabase
      .from('taxas_cartao')
      .update({ ativa })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async remove(id) {
    const { error } = await supabase.from('taxas_cartao').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
};
