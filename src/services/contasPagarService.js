// src/services/contasPagarService.js
// CRUD de contas_a_pagar. Módulo financeiro PersiFix.

import { supabase } from '../supabase/client';

export const STATUS_CP = [
  { value: 'pendente',   label: 'Pendente' },
  { value: 'pago',       label: 'Pago' },
  { value: 'atrasado',   label: 'Atrasado' },
  { value: 'cancelado',  label: 'Cancelado' },
];

export const CATEGORIAS_CP = [
  { value: 'compra',    label: 'Compra de mercadoria' },
  { value: 'servico',   label: 'Serviço / Fornecedor' },
  { value: 'imposto',   label: 'Imposto' },
  { value: 'taxa',      label: 'Taxa bancária / cartão' },
  { value: 'outros',    label: 'Outros' },
];

export const contasPagarService = {
  async getAll() {
    const { data, error } = await supabase
      .from('contas_pagar')
      .select('*')
      .order('data_vencimento', { ascending: true });
    const tabelaAusente = error?.code === 'PGRST205' || /not found/i.test(error?.message || '');
    if (tabelaAusente) return [];
    if (error) throw error;
    return data || [];
  },

  async getByPeriod({ startDate, endDate, status } = {}) {
    let q = supabase.from('contas_pagar').select('*').order('data_vencimento');
    if (startDate) q = q.gte('data_vencimento', startDate);
    if (endDate)   q = q.lte('data_vencimento', endDate);
    if (status)    q = q.eq('status', status);
    const { data, error } = await q;
    if (error?.code === 'PGRST205' || /not found/i.test(error?.message || '')) return [];
    if (error) throw error;
    return data || [];
  },

  async create(item) {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      user_id: user?.id || null,
      ...normalizar(item),
    };
    const { data, error } = await supabase
      .from('contas_pagar')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, item) {
    const { data, error } = await supabase
      .from('contas_pagar')
      .update(normalizar(item))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async marcarPago(id, data_pagamento = new Date().toISOString().slice(0, 10)) {
    const { data, error } = await supabase
      .from('contas_pagar')
      .update({ status: 'pago', data_pagamento })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('contas_pagar').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
};

function normalizar(d) {
  return {
    descricao: String(d.descricao || '').trim(),
    fornecedor_id: d.fornecedor_id || null,
    fornecedor_nome: d.fornecedor_nome || d.fornecedor || null,
    produto_id: d.produto_id || null,
    categoria: d.categoria,
    valor_total: Number(d.valor_total) || Number(d.valor) || 0,
    numero_parcelas: Number(d.numero_parcelas) || 1,
    parcela_atual: Number(d.parcela_atual) || null,
    data_emissao: d.data_emissao || new Date().toISOString().slice(0, 10),
    data_vencimento: d.data_vencimento || new Date().toISOString().slice(0, 10),
    data_pagamento: d.data_pagamento || null,
    forma_pagamento: d.forma_pagamento || null,
    status: d.status || 'pendente',
    nota_fiscal: d.nota_fiscal || null,
    observacao: d.observacao || null,
    orcamento_id: d.orcamento_id || null,
    despesa_vinculada: d.despesa_vinculada || null,
  };
}
