import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductSelectorCascata from '../components/ProductSelectorCascata';
import '../components/ProductSelectorCascata.css';
import { supabase } from '../supabase/client';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcSubtotal(produto, largura, altura, qty) {
  if (!produto || !largura || !altura) return 0;
  const l = parseFloat(largura), a = parseFloat(altura);
  const q = parseInt(qty) || 1;
  const preco = parseFloat(produto.preco_venda) || 0;
  const metodo = (produto.metodo_calculo || 'm2').toLowerCase();
  let base = 0;
  if (metodo === 'ml' || metodo === 'linear') base = l * preco;
  else if (metodo === 'altura') base = a * preco;
  else {
    const area = l * a;
    const areaMin = parseFloat(produto.area_minima) || 0;
    base = Math.max(area, areaMin) * preco;
  }
  return base * q;
}

function OrcamentoV2({ products, customers, accessories }) {
  const navigate = useNavigate();
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState(customers || []);
  const [itens, setItens] = useState([]);
  const [itemAtual, setItemAtual] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (customers && customers.length > 0) setClientes(customers);
  }, [customers]);

  const total = useMemo(() => itens.reduce((s, i) => s + i.subtotal, 0), [itens]);

  const handleCascataSelect = (payload) => {
    const { selection, customizacao, produto } = payload;
    const subtotal = calcSubtotal(
      produto,
      selection.largura,
      selection.altura,
      selection.quantidade
    );
    setItemAtual({
      id: `item-${Date.now()}`,
      produto,
      selection: { ...selection },
      customizacao: { ...customizacao },
      subtotal
    });
  };

  const handleAdicionar = () => {
    if (!itemAtual) return;
    setItens(prev => [...prev, itemAtual]);
    setItemAtual(null);
  };

  const removerItem = (id) => {
    setItens(prev => prev.filter(i => i.id !== id));
  };

  const handleSalvar = async () => {
    if (!clienteId) {
      alert('Selecione um cliente antes de salvar.');
      return;
    }
    if (itens.length === 0) {
      alert('Adicione pelo menos um item ao orçamento.');
      return;
    }
    setSalvando(true);
    try {
      const cleanProducts = itens.map(i => ({
        produto_id: i.produto.id,
        produto: {
          id: i.produto.id,
          nome: i.produto.nome,
          modelo: i.produto.modelo,
          tecido: i.produto.tecido,
          codigo: i.produto.codigo,
          metodo_calculo: i.produto.metodo_calculo
        },
        largura: parseFloat(i.selection.largura),
        altura: parseFloat(i.selection.altura),
        input_width: parseFloat(i.selection.largura),
        input_height: parseFloat(i.selection.altura),
        ambiente: i.selection.ambiente || '',
        bando: false,
        instalacao: false,
        trilho_tipo: '',
        painel: false,
        num_folhas: 1,
        customizacao: i.customizacao,
        origem: 'cascata',
        selection: i.selection,
        subtotal: i.subtotal
      }));

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('orcamentos')
        .insert([{
          cliente_id: clienteId,
          vendedor_id: user?.id || null,
          valor_total: total,
          produtos_json: JSON.stringify(cleanProducts),
          acessorios_json: '[]',
          ambientes: JSON.stringify([]),
          observacao: observacao,
          status: 'pendente'
        }])
        .select()
        .single();
      if (error) throw error;
      alert('Orçamento criado com sucesso!');
      navigate(`/budgets/${data.id}/view`);
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const clienteSelecionado = clientes.find(c => String(c.id) === String(clienteId));

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Novo Orçamento — v2</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
              Fluxo redesenhado com seletor em cascata
            </p>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {itens.length} {itens.length === 1 ? 'item' : 'itens'} · Total: <strong style={{ color: '#15803d' }}>R$ {fmt(total)}</strong>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
        <section>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Cliente
            </label>
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' }}
            >
              <option value="">Selecione um cliente…</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clientes.length === 0 && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                Nenhum cliente cadastrado. Cadastre um cliente antes de continuar.
              </p>
            )}
          </div>

          <ProductSelectorCascata onSelect={handleCascataSelect} />

          {itemAtual && (
            <div style={{ marginTop: 16, padding: 20, background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8 }}>
              <h3 style={{ margin: '0 0 12px', color: '#14532d' }}>Pronto para adicionar</h3>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>{itemAtual.produto.nome}</strong> · <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>{itemAtual.produto.codigo}</code>
              </div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                {itemAtual.selection.largura}m × {itemAtual.selection.altura}m · Qtd: {itemAtual.selection.quantidade}
                {Object.values(itemAtual.customizacao).filter(Boolean).length > 0 && (
                  <span> · {Object.values(itemAtual.customizacao).filter(Boolean).length} customização(ões)</span>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d', marginBottom: 12 }}>
                R$ {fmt(itemAtual.subtotal)}
              </div>
              <button
                onClick={handleAdicionar}
                style={{ padding: '10px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
              >
                Adicionar ao orçamento
              </button>
            </div>
          )}

          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              placeholder="Notas internas sobre o orçamento (opcional)"
            />
          </div>
        </section>

        <aside>
          <div style={{ background: 'white', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>
              Itens ({itens.length})
            </h3>

            {clienteSelecionado && (
              <div style={{ padding: 8, background: '#eff6ff', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                <strong>Cliente:</strong> {clienteSelecionado.name}
              </div>
            )}

            {itens.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }}>
                Nenhum item adicionado ainda
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 400, overflowY: 'auto' }}>
                {itens.map(i => {
                  const customCount = Object.values(i.customizacao || {}).filter(Boolean).length;
                  return (
                    <li key={i.id} style={{ padding: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {i.produto.nome}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {i.selection.largura}m × {i.selection.altura}m · Qtd {i.selection.quantidade}
                          {customCount > 0 && ` · ${customCount} custom.`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>
                          R$ {fmt(i.subtotal)}
                        </div>
                        <button
                          onClick={() => removerItem(i.id)}
                          style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: '#15803d' }}>R$ {fmt(total)}</span>
              </div>
              <button
                onClick={handleSalvar}
                disabled={itens.length === 0 || !clienteId || salvando}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '12px 20px',
                  background: (itens.length === 0 || !clienteId || salvando) ? '#e5e7eb' : '#2563eb',
                  color: (itens.length === 0 || !clienteId || salvando) ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: (itens.length === 0 || !clienteId || salvando) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                {salvando ? 'Salvando…' : 'Salvar orçamento'}
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default OrcamentoV2;
