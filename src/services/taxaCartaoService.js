// src/services/taxaCartaoService.js
//
// CRUD da tabela public.taxas_cartao — taxa por bandeira × parcela.
// O usuário pode editar as taxas padrão que foram seedadas na migration.

import { supabase } from '../supabase/client';

export const BANDEIRAS = [
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

const tabelaAusente = (err) => err && (err.code === 'PGRST205' || /not found/i.test(err.message || ''));

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

  /**
   * Retorna a taxa ativa para uma combinação bandeira × parcela.
   * Se não encontrar exata, procura a parcela mais próxima menor (fallback comum).
   * @returns {{ taxa_percentual: number, ativa: boolean } | null}
   */
  async getTaxa(bandeira, parcelas = 1) {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .select('taxa_percentual,ativa')
      .eq('bandeira', bandeira)
      .eq('parcelas', parcelas)
      .eq('ativa', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(item) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('taxas_cartao')
      .insert([{
        user_id: user?.id || null,
        bandeira: item.bandeira,
        parcelas: Number(item.parcelas),
        taxa_percentual: Number(item.taxa_percentual) || 0,
        ativa: item.ativa !== false,
        observacao: item.observacao || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, item) {
    const { data, error } = await supabase
      .from('taxas_cartao')
      .update({
        taxa_percentual: Number(item.taxa_percentual) || 0,
        ativa: item.ativa !== false,
        observacao: item.observacao || null,
      })
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
