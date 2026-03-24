import { supabase } from '../supabase/client';

export const connectionService = {
  /**
   * Checks if the Supabase service is available
   * @returns {Promise<{isAvailable: boolean, error: string|null}>}
   */
  async checkConnection() {
    try {
      // Simple ping to Supabase to check connectivity
      const { error } = await supabase.from('configuracoes').select('id').limit(1);
      
      if (error) {
        console.error('Supabase connection error:', error);
        return {
          isAvailable: false,
          error: error.message || 'Erro de conexão com o servidor'
        };
      }
      
      return {
        isAvailable: true,
        error: null
      };
    } catch (error) {
      console.error('Unexpected connection error:', error);
      return {
        isAvailable: false,
        error: error.message || 'Serviço indisponível. Tente novamente mais tarde.'
      };
    }
  },

  /**
   * Executes a Supabase query with connection error handling
   * @param {Function} queryFn - Function that executes a Supabase query
   * @returns {Promise<{data: any|null, error: any|null, isConnectionError: boolean}>}
   */
  async executeWithErrorHandling(queryFn) {
    try {
      const result = await queryFn();
      
      if (result.error) {
        // Check if it's a connection-related error
        const isConnectionError = this.isConnectionError(result.error);
        
        return {
          data: null,
          error: result.error,
          isConnectionError
        };
      }
      
      return {
        data: result.data,
        error: null,
        isConnectionError: false
      };
    } catch (error) {
      return {
        data: null,
        error,
        isConnectionError: this.isConnectionError(error)
      };
    }
  },

  /**
   * Determines if an error is related to connection issues
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  isConnectionError(error) {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const connectionErrorKeywords = [
      'network error',
      'failed to fetch',
      'connection refused',
      'timeout',
      'offline',
      'service unavailable',
      'no internet',
      'net::err',
      'aborted'
    ];
    
    return connectionErrorKeywords.some(keyword => errorMessage.includes(keyword));
  }
};
