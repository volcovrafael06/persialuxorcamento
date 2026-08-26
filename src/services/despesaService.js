// src/services/despesaService.js
//
// Despesas operacionais da empresa (aluguel, folha, marketing, taxas de cartão, etc).
//
// Categorias fechadas — alinhadas com CHECK constraint em public.despesas.
// Mantemos a lista em um único lugar pra evitar divergência entre DB e UI.

import { supabase } from '../supabase/client';

export const CATEGORIAS_DESPESA = [
  { value: 'aluguel',                label: 'Aluguel' },
  { value: 'folha',                  label: 'Folha de pagamento' },
  { value: 'marketing',              label: 'Marketing / Anúncios' },
  { value: 'taxa_cartao',            label: 'Taxa de Cartão' },
  { value: 'fornecedor',             label: 'Fornecedores' },
  { value: 'energia',                label: 'Energia elétrica' },
  { value: 'agua',                   label: 'Água' },
  { value: 'internet',               label: 'Internet / Telefonia' },
  { value: 'impostos',               label: 'Impostos / Taxas' },
  { value: 'manutencao',             label: 'Manutenção' },
  { value: 'material_escritorio',    label: 'Material de escritório' },
  { value: 'combustivel',            label: 'Combustível' },
  { value: 'alimentacao',            label: 'Alimentação' },
  { value: 'outros',                 label: 'Outros' },
];

export const FORMAS_PAGAMENTO = [
  { value: 'dinheiro',      label: 'Dinheiro' },
  { value: 'pix',           label: 'PIX' },
  { value: 'debito',        label: 'Débito' },
  { value: 'credito',       label: 'Crédito' },
  { value: 'boleto',        label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outros',        label: 'Outros' },
];

export const STATUS_DESPESA = [
  { value: 'pago',       label: 'Pago' },
  { value: 'pendente',   label: 'Pendente' },
  { value: 'cancelado',  label: 'Cancelado' },
];

export const despesaService = {
  async getAll() {
    const { data, error } = await supabase
      .from('despesas')
      .select('*')
      .order('data_despesa', { ascending: false });
    // Tabela ainda não existe (migration não aplicada) — retorna vazio, sem quebrar UI.
    if (error && (error.code === 'PGRST205' || /not found/i.test(error.message || ''))) {
      return [];
    }
    if (error) throw error;
    return data || [];
  },

  // Lista despesas dentro de um período (inclusive) + filtro opcional por categoria/status.
  async getByPeriod({ startDate, endDate, categoria, status } = {}) {
    let query = supabase
      .from('despesas')
      .select('*')
      .gte('data_despesa', startDate)
      .lte('data_despesa', endDate)
      .order('data_despesa', { ascending: false });

    if (categoria) query = query.eq('categoria', categoria);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('despesas')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(despesa) {
    const payload = await normalizarPayload(despesa);
    const { data, error } = await supabase
      .from('despesas')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, despesa) {
    const payload = await normalizarPayload(despesa);
    const { data, error } = await supabase
      .from('despesas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from('despesas').delete().eq('id', id);
    if (error) throw error;
    return true;
  },
};

// Normaliza payload (data, valores numéricos, etc) e adiciona user_id da sessão atual.
async function normalizarPayload(d) {
  const { data: { user } } = await supabase.auth.getUser();
  return {
    user_id: user?.id || null,
    descricao: String(d.descricao || '').trim(),
    categoria: d.categoria,
    valor: Number(d.valor) || 0,
    data_despesa: d.data_despesa || new Date().toISOString().slice(0, 10),
    forma_pagamento: d.forma_pagamento || null,
    status: d.status || 'pago',
    fornecedor: d.fornecedor || null,
    nota_fiscal: d.nota_fiscal || null,
    observacao: d.observacao || null,
  };
}
