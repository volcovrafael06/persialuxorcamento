import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

function TestDB() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    testDatabase();
  }, []);

  const testDatabase = async () => {
    const results = {};
    setLoading(true);
    
    try {
      // Test configuracoes table
      const { data: configData, error: configError } = await supabase
        .from('configuracoes')
        .select('*');
      
      results.configuracoes = {
        success: !configError,
        count: configData?.length || 0,
        error: configError?.message
      };

      // Test storage
      const { data: files, error: storageError } = await supabase
        .storage
        .from('images')
        .list('logos');
      
      results.storage = {
        success: !storageError,
        count: files?.length || 0,
        error: storageError?.message,
        note: storageError?.message?.includes('bucket not found') ? 
          'É necessário criar um bucket "images" no Supabase' : undefined
      };

      setTestResults(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createConfiguracoesTable = async () => {
    try {
      // Create the table
      const { error: tableError } = await supabase
        .from('configuracoes')
        .insert([{
          cnpj: '',
          razao_social: '',
          nome_fantasia: '',
          endereco: '',
          telefone: '',
          validade_orcamento: 30,
          formula_m2: 'largura * altura',
          formula_comprimento: 'largura',
          formula_bando: 'largura * 0.3',
          formula_instalacao: 'quantidade * 50'
        }])
        .select();

      if (tableError) {
        throw tableError;
      }

      return { success: true };
    } catch (error) {
      console.error('Error creating configuracoes table:', error);
      return { success: false, error: error.message };
    }
  };

  const handleCreateTable = async () => {
    setLoading(true);
    const result = await createConfiguracoesTable();
    if (result.success) {
      alert('Configuração inicial criada com sucesso!');
      testDatabase(); // Refresh the test results
    } else {
      alert('Erro ao criar configuração: ' + result.error);
    }
    setLoading(false);
  };

  if (loading) return <div>Testando banco de dados...</div>;
  if (error) return <div>Erro ao testar banco de dados: {error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Resultados do Teste do Banco de Dados</h2>
      {Object.entries(testResults).map(([table, result]) => (
        <div key={table} style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd' }}>
          <h3>{table}</h3>
          <p>Status: {result.success ? '✅ OK' : '❌ Erro'}</p>
          {result.count !== undefined && (
            <p>Número de registros: {result.count}</p>
          )}
          {result.error && (
            <p style={{ color: 'red' }}>Erro: {result.error}</p>
          )}
          {result.note && (
            <p style={{ color: 'orange' }}>{result.note}</p>
          )}
        </div>
      ))}
      <button onClick={testDatabase}>Testar Novamente</button>
      <div style={{ marginTop: '20px' }}>
        <button onClick={handleCreateTable} disabled={loading}>
          Criar Configuração Inicial
        </button>
      </div>
    </div>
  );
}

export default TestDB;
