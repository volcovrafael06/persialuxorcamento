import { supabase } from '../supabase/client';
import { localDB } from './localDatabase';

export const syncService = {
  async syncAll() {
    try {
      // Sincronizar orçamentos
      const { data: orcamentos, error: orcamentosError } = await supabase
        .from('orcamentos')
        .select(`
          *,
          clientes (
            id,
            name,
            email,
            phone,
            address
          )
        `);
      if (orcamentosError) throw orcamentosError;
      await localDB.bulkPut('orcamentos', orcamentos);

      // Sincronizar clientes
      const { data: clientes, error: clientesError } = await supabase
        .from('clientes')
        .select('*');
      if (clientesError) throw clientesError;
      await localDB.bulkPut('clientes', clientes);

      // Sincronizar produtos
      const { data: produtos, error: produtosError } = await supabase
        .from('produtos')
        .select('*');
      if (produtosError) throw produtosError;
      await localDB.bulkPut('produtos', produtos);

      // Sincronizar acessórios
      const { data: accessories, error: accessoriesError } = await supabase
        .from('accessories')
        .select('*');
      if (accessoriesError) throw accessoriesError;
      await localDB.bulkPut('accessories', accessories);

      // Sincronizar configurações
      const { data: configuracoes, error: configuracoesError } = await supabase
        .from('configuracoes')
        .select('*')
        .single();
      if (configuracoesError) throw configuracoesError;
      if (configuracoes) {
        await localDB.put('configuracoes', configuracoes);
      }

      return true;
    } catch (error) {
      console.error('Erro na sincronização:', error);
      return false;
    }
  },

  async getFromLocalOrFetch(storeName, fetchFn) {
    try {
      // Tentar obter do cache local primeiro
      const localData = await localDB.getAll(storeName);
      if (localData && localData.length > 0) {
        return localData;
      }

      // Se não houver dados locais, buscar do servidor
      const data = await fetchFn();
      if (data) {
        await localDB.bulkPut(storeName, data);
      }
      return data;
    } catch (error) {
      console.error(`Erro ao buscar dados de ${storeName}:`, error);
      throw error;
    }
  }
};
