import { supabase } from '../supabase/client'

export const acessorioService = {
  async getAll() {
    const { data, error } = await supabase
      .from('acessorios')
      .select('*')
    if (error) throw error
    return data
  },

  async create(acessorio) {
    const acessorioFormatted = {
      tipo: acessorio.type,
      modelo: acessorio.model,
      material: acessorio.material,
      nome: acessorio.name,
      codigo: acessorio.code,
      preco_custo: acessorio.cost_price,
      margem_lucro: acessorio.profit_margin,
      preco_venda: acessorio.sale_price,
      metodo_calculo: acessorio.calculation_method,
      altura_minima: acessorio.altura_minima,
      largura_minima: acessorio.largura_minima,
      area_minima: acessorio.area_minima
    }

    const { data, error } = await supabase
      .from('acessorios')
      .insert([acessorioFormatted])
      .select()
    if (error) throw error
    return data[0]
  },

  async update(id, acessorio) {
    const acessorioFormatted = {
      tipo: acessorio.type,
      modelo: acessorio.model,
      material: acessorio.material,
      nome: acessorio.name,
      codigo: acessorio.code,
      preco_custo: acessorio.cost_price,
      margem_lucro: acessorio.profit_margin,
      preco_venda: acessorio.sale_price,
      metodo_calculo: acessorio.calculation_method,
      altura_minima: acessorio.altura_minima,
      largura_minima: acessorio.largura_minima,
      area_minima: acessorio.area_minima
    }

    const { data, error } = await supabase
      .from('acessorios')
      .update(acessorioFormatted)
      .eq('id', id)
      .select()
    if (error) throw error
    return data[0]
  },

  async delete(id) {
    const { error } = await supabase
      .from('acessorios')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}
