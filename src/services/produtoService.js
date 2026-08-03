import { supabase } from '../supabase/client'
import { localDB } from './localDatabase'

const STORE = 'produtos'

const formatForInsert = (produto) => {
  const isWave = (produto.model || '').toUpperCase() === 'WAVE'
  const formatted = {
    produto: produto.product,
    modelo: produto.model,
    tecido: produto.material,
    nome: produto.name,
    codigo: produto.code,
    preco_custo: isWave ? null : (parseFloat(produto.cost_price) || 0),
    margem_lucro: parseFloat(produto.profit_margin) || 0,
    preco_venda: parseFloat(produto.sale_price) || 0,
    metodo_calculo: produto.calculation_method,
    altura_minima: produto.altura_minima ? parseFloat(produto.altura_minima) : null,
    largura_minima: produto.largura_minima ? parseFloat(produto.largura_minima) : null,
    largura_maxima: produto.largura_maxima ? parseFloat(produto.largura_maxima) : null,
    area_minima: produto.area_minima ? parseFloat(produto.area_minima) : null
  }

  if (isWave && Array.isArray(produto.wave_pricing)) {
    formatted.wave_pricing_data = JSON.stringify(produto.wave_pricing)
  }

  return formatted
}

const cacheItem = async (item) => {
  if (!item) return item
  const id = item.id || `local-${item.codigo || crypto.randomUUID()}`
  const stored = { ...item, id }
  await localDB.put(STORE, stored)
  return stored
}

export const produtoService = {
  async getAll() {
    // Tenta Supabase primeiro (paginado para escapar do max_rows=1000 do
    // PostgREST). Se RLS/sessão bloquear, cai pro cache local.
    try {
      const PAGE = 1000;
      const rows = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .order('codigo', { ascending: true })
          .range(offset, offset + PAGE - 1);

        if (error) throw error;
        const chunk = data || [];
        rows.push(...chunk);
        if (chunk.length < PAGE) break;
        offset += PAGE;
      }

      // Reflete o estado remoto no cache para futuras leituras offline.
      if (rows.length > 0) {
        try { await localDB.replaceAll(STORE, rows) } catch { /* offline ok */ }
      }
      // Mescla com itens criados localmente que ainda não subiram.
      const localOnly = (await localDB.getAll(STORE)).filter(
        (l) => !rows.some((r) => r.id === l.id)
      );
      return [...rows, ...localOnly];
    } catch (err) {
      console.warn('[produtoService.getAll] Supabase falhou, usando cache local:', err.message);
      return await localDB.getAll(STORE);
    }
  },

  async create(produto) {
    const produtoFormatted = formatForInsert(produto)
    const { data, error } = await supabase
      .from('produtos')
      .insert([produtoFormatted])
      .select()

    if (error) {
      console.error('Database error:', error)
      throw new Error(error.message)
    }

    const created = data?.[0]
    // Garante que o item aparece no cache local imediatamente.
    await cacheItem(created)
    return created
  },

  async update(id, produto) {
    const produtoFormatted = formatForInsert(produto)
    const { data, error } = await supabase
      .from('produtos')
      .update(produtoFormatted)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Database error:', error)
      throw new Error(error.message)
    }

    const updated = data?.[0]
    if (updated) await cacheItem(updated)
    return updated
  },

  async delete(id) {
    const { error } = await supabase
      .from('produtos')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Database error:', error)
      throw new Error(error.message)
    }

    try { await localDB.delete(STORE, id) } catch { /* ok */ }
  }
}
