// src/services/contasReceberService.js

import { supabase } from '../supabase/client';

export const STATUS_CR = [
  { value: 'pendente',   label: 'Pendente' },
  { value: 'recebido',   label: 'Recebido' },
  { value: 'atrasado',   label: 'Atrasado' },
  { value: 'cancelado',  label: 'Cancelado' },
];

export const contasReceberService = {
  async getAll() {
    const { data, error } = await supabase
      .from('contas_receber')
      .select('*, clientes(name), orcamentos(numero_orcamento,status)')
      .order('data_vencimento', { ascending: true });
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return [];
    if (error) throw error;
    return data || [];
  },

  async getByPeriod({ startDate, endDate, status } = {}) {
    let q = supabase.from('contas_receber').select('*, clientes(name)').order('data_vencimento');
    if (startDate) q = q.gte('data_vencimento', startDate);
    if (endDate)   q = q.lte('data_vencimento', endDate);
    if (status)    q = q.eq('status', status);
    const { data, error } = await q;
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return [];
    if (error) throw error;
    return data || [];
  },

  async getTotalAReceber() {
    const { data, error } = await supabase
      .from('contas_receber')
      .select('valor_total, status')
      .in('status', ['pendente', 'atrasado']);
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return 0;
    if (error) throw error;
    return (data || []).reduce((s, r) => s + Number(r.valor_total || 0), 0);
  },

  async create(item) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      user_id: user?.id || null,
      ...normalizar(item),
    };
    const { data, error } = await supabase
      .from('contas_receber')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, item) {
    const { data, error } = await supabase
      .from('contas_receber')
      .update(normalizar(item))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async marcarRecebido(id, data_recebimento = new Date().toISOString().slice(0, 10)) {
    const { data, error } = await supabase
      .from('contas_receber')
      .update({ status: 'recebido', data_recebimento })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('contas_receber').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
};

function normalizar(d) {
  return {
    orcamento_id: d.orcamento_id || null,
    cliente_id: d.cliente_id || null,
    descricao: String(d.descricao || '').trim(),
    valor_total: Number(d.valor_total) || Number(d.valor) || 0,
    numero_parcelas: Number(d.numero_parcelas) || 1,
    parcela_atual: Number(d.parcela_atual) || null,
    data_emissao: d.data_emissao || new Date().toISOString().slice(0, 10),
    data_vencimento: d.data_vencimento || new Date().toISOString().slice(0, 10),
    data_recebimento: d.data_recebimento || null,
    forma_recebimento: d.forma_recebimento || null,
    status: d.status || 'pendente',
    observacao: d.observacao || null,
  };
}
