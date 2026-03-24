import { supabase } from '../supabase/client'

export const orcamentoService = {
  async getAll() {
    const { data, error } = await supabase
      .from('orcamentos')
      .select('*')
    if (error) throw error
    return data
  },

  async create(orcamento) {
    const { data, error } = await supabase
      .from('orcamentos')
      .insert([orcamento])
      .select()
    if (error) throw error
    return data[0]
  },

  async update(id, orcamento) {
    const { data, error } = await supabase
      .from('orcamentos')
      .update(orcamento)
      .eq('id', id)
      .select()
    if (error) throw error
    return data[0]
  },

  async delete(id) {
    const { error } = await supabase
      .from('orcamentos')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}
