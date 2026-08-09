import { supabase } from '../supabase/client'
import { localDB } from './localDatabase'

const STORE = 'produtos_acessorios'

export const produtosAcessorioService = {
  async getAll() {
    // Tenta Supabase primeiro; cai pro cache local em caso de falha.
    try {
      const { data, error } = await supabase
        .from('produtos_acessorios')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

      if (error) throw error

      const rows = data || []
      if (rows.length > 0) {
        try { await localDB.replaceAll(STORE, rows) } catch { /* offline ok */ }
      }
      const localOnly = (await localDB.getAll(STORE)).filter(
        (l) => !rows.some((r) => r.id === l.id)
      )
      return [...rows, ...localOnly]
    } catch (err) {
      console.warn('[produtosAcessorioService.getAll] Supabase falhou, usando cache:', err.message)
      return await localDB.getAll(STORE)
    }
  },

  async create(acessorio) {
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      user_id: user?.id || null,
      name: acessorio.name,
      unit: acessorio.unit,
      colors: acessorio.colors || [],
      description: acessorio.description || null,
      active: true
    }
    const { data, error } = await supabase
      .from('produtos_acessorios')
      .insert([payload])
      .select()
    if (error) throw error
    const created = data?.[0]
    if (created) await localDB.put(STORE, created)
    return created
  },

  async update(id, acessorio) {
    const payload = {
      name: acessorio.name,
      unit: acessorio.unit,
      colors: acessorio.colors || [],
      description: acessorio.description || null
    }
    const { data, error } = await supabase
      .from('produtos_acessorios')
      .update(payload)
      .eq('id', id)
      .select()
    if (error) throw error
    const updated = data?.[0]
    if (updated) await localDB.put(STORE, updated)
    return updated
  },

  async delete(id) {
    const { error } = await supabase
      .from('produtos_acessorios')
      .delete()
      .eq('id', id)
    if (error) throw error
    try { await localDB.delete(STORE, id) } catch { /* ok */ }
  }
}
