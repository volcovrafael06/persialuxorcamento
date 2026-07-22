import { supabase } from '../supabase/client';
import { localDB } from './localDatabase';

const fetchTable = async (table, queryBuilder = query => query.select('*')) => {
  const { data, error } = await queryBuilder(supabase.from(table));
  if (error) throw new Error(`Falha ao sincronizar ${table}: ${error.message}`);
  return data || [];
};

export const syncService = {
  async syncAll() {
    const [orcamentos, clientes, produtos, accessories, configuracoes, visits] = await Promise.all([
      fetchTable('orcamentos', query => query.select(`
        *,
        clientes (id, name, email, phone, address),
        vendedores (id, nome, email)
      `)),
      fetchTable('clientes'),
      fetchTable('produtos'),
      fetchTable('accessories'),
      fetchTable('configuracoes'),
      fetchTable('visits', query => query.select('*').order('date_time', { ascending: true }))
    ]);

    await Promise.all([
      localDB.replaceAll('orcamentos', orcamentos),
      localDB.replaceAll('clientes', clientes),
      localDB.replaceAll('produtos', produtos),
      localDB.replaceAll('accessories', accessories),
      localDB.replaceAll('configuracoes', configuracoes),
      localDB.replaceAll('visits', visits)
    ]);

    return {
      orcamentos: orcamentos.length,
      clientes: clientes.length,
      produtos: produtos.length,
      accessories: accessories.length,
      configuracoes: configuracoes.length,
      visits: visits.length
    };
  },

  async getFromLocalOrFetch(storeName, fetchFn) {
    const localData = await localDB.getAll(storeName);
    if (localData.length > 0) return localData;

    const data = await fetchFn();
    await localDB.replaceAll(storeName, data || []);
    return data || [];
  }
};
