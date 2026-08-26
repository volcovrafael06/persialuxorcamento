// src/services/taxaCartaoService.js
// Wrapper do CRUD + lookup em tempo real (taxa por bandeira/parcela).
// Reaproveitado do módulo financeiro.

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

export const taxaCartaoService = {
  async getAll() {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .select('*')
      .order('bandeira', { ascending: true })
      .order('parcelas', { ascending: true });
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return [];
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
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return null;
    if (error) return null;
    return data;
  },
};
