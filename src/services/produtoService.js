import { supabase } from '../supabase/client'

export const produtoService = {
  async getAll() {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')

      if (error) {
        console.error('Database error:', error);
        throw new Error(error.message);
      }

      return data;
    } catch (err) {
      console.error('Error in getAll:', err);
      throw err;
    }
  },

  async create(produto) {
    try {
      // Ajustando os nomes dos campos para corresponder ao banco de dados
      const produtoFormatted = {
        produto: produto.product,
        modelo: produto.model,
        tecido: produto.material,
        nome: produto.name,
        codigo: produto.code,
        preco_custo: produto.model.toUpperCase() === 'WAVE' ? null : (parseFloat(produto.cost_price) || 0),
        margem_lucro: parseFloat(produto.profit_margin) || 0,
        preco_venda: parseFloat(produto.sale_price) || 0,
        metodo_calculo: produto.calculation_method,
        altura_minima: produto.altura_minima ? parseFloat(produto.altura_minima) : null,
        largura_minima: produto.largura_minima ? parseFloat(produto.largura_minima) : null,
        largura_maxima: produto.largura_maxima ? parseFloat(produto.largura_maxima) : null,
        area_minima: produto.area_minima ? parseFloat(produto.area_minima) : null
      }

      // Only add wave_pricing_data if it's a Wave model
      if (produto.model.toUpperCase() === 'WAVE' && Array.isArray(produto.wave_pricing)) {
        produtoFormatted.wave_pricing_data = JSON.stringify(produto.wave_pricing);
      }

      const { data, error } = await supabase
        .from('produtos')
        .insert([produtoFormatted])
        .select()

      if (error) {
        console.error('Database error:', error);
        throw new Error(error.message);
      }

      return data[0];
    } catch (err) {
      console.error('Error in create:', err);
      throw err;
    }
  },

  async update(id, produto) {
    try {
      // Ajustando os nomes dos campos para corresponder ao banco de dados
      const produtoFormatted = {
        produto: produto.product,
        modelo: produto.model,
        tecido: produto.material,
        nome: produto.name,
        codigo: produto.code,
        preco_custo: produto.model.toUpperCase() === 'WAVE' ? null : (parseFloat(produto.cost_price) || 0),
        margem_lucro: parseFloat(produto.profit_margin) || 0,
        preco_venda: parseFloat(produto.sale_price) || 0,
        metodo_calculo: produto.calculation_method,
        altura_minima: produto.altura_minima ? parseFloat(produto.altura_minima) : null,
        largura_minima: produto.largura_minima ? parseFloat(produto.largura_minima) : null,
        largura_maxima: produto.largura_maxima ? parseFloat(produto.largura_maxima) : null,
        area_minima: produto.area_minima ? parseFloat(produto.area_minima) : null
      }

      // Only add wave_pricing_data if it's a Wave model
      if (produto.model.toUpperCase() === 'WAVE' && Array.isArray(produto.wave_pricing)) {
        produtoFormatted.wave_pricing_data = JSON.stringify(produto.wave_pricing);
      }

      const { data, error } = await supabase
        .from('produtos')
        .update(produtoFormatted)
        .eq('id', id)
        .select()

      if (error) {
        console.error('Database error:', error);
        throw new Error(error.message);
      }

      return data[0];
    } catch (err) {
      console.error('Error in update:', err);
      throw err;
    }
  },

  async delete(id) {
    try {
      const { error } = await supabase
        .from('produtos')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Database error:', error);
        throw new Error(error.message);
      }
    } catch (err) {
      console.error('Error in delete:', err);
      throw err;
    }
  }
}
