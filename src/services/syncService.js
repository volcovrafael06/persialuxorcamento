import { supabase } from '../supabase/client';
import { localDB } from './localDatabase';

const PAGE_SIZE = 1000;

const fetchAllRows = async (table, queryBuilder = query => query.select('*')) => {
  // PostgREST trunca em 1000 rows por padrão. Paginamos manualmente
  // para que syncService traga TODOS os registros.
  const rows = [];
  let offset = 0;
  while (true) {
    const builder = queryBuilder(supabase.from(table));
    const { data, error } = await builder.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao sincronizar ${table}: ${error.message}`);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
};

export const syncService = {
  async syncAll() {
    const [orcamentos, clientes, produtos, produtosAcessorios, accessories, configuracoes, visits] = await Promise.all([
      fetchAllRows('orcamentos', query => query.select(`
        *,
        clientes (id, name, email, phone, address),
        vendedores (id, nome, email)
      `)),
      fetchAllRows('clientes'),
      fetchAllRows('produtos', query => query.select('*').order('codigo', { ascending: true })),
      fetchAllRows('produtos_acessorios', query => query.select('*').order('name', { ascending: true })),
      fetchAllRows('accessories', query => query.select('*').order('name', { ascending: true })),
      fetchAllRows('configuracoes'),
      fetchAllRows('visits', query => query.select('*').order('date_time', { ascending: true }))
    ]);

    await Promise.all([
      localDB.replaceAll('orcamentos', orcamentos),
      localDB.replaceAll('clientes', clientes),
      localDB.replaceAll('produtos', produtos),
      localDB.replaceAll('produtos_acessorios', produtosAcessorios),
      localDB.replaceAll('accessories', accessories),
      localDB.replaceAll('configuracoes', configuracoes),
      localDB.replaceAll('visits', visits)
    ]);

    return {
      orcamentos: orcamentos.length,
      clientes: clientes.length,
      produtos: produtos.length,
      produtosAcessorios: produtosAcessorios.length,
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
