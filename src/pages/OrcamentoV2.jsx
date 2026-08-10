import React, { useState, useMemo } from 'react';
import ProductSelectorCascata from '../components/ProductSelectorCascata';
import '../components/ProductSelectorCascata.css';

// Mock do produtoService para o preview
import { produtoService } from '../services/produtoService';
produtoService.getAll = async () => [
  { id: 1, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,21 Espessura — Lisa', codigo: '01250100', largura_maxima: 3.0, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 120, preco_custo: 80, margem_lucro: 50, cores_disponiveis: ['Branco', 'Bege', 'Cinza', 'Preto'] },
  { id: 2, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,18 Espessura (Furo não aparente) — Lisa', codigo: '01250110', largura_maxima: 3.0, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 140, preco_custo: 90, margem_lucro: 55, cores_disponiveis: ['Branco', 'Preto'] },
  { id: 3, produto: 'CORTINA ROLÔ', modelo: 'Tubo 45', nome: 'BK ARUBA - CREAM (281-04)', codigo: '01100101', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 180, preco_custo: 110, margem_lucro: 63, cores_disponiveis: ['Cream', 'Linen', 'Sand'] },
  { id: 4, produto: 'CORTINA ROLÔ', modelo: 'Tubo 32', nome: 'BK ALPES - LINEN (282-01)', codigo: '01100102', largura_maxima: 2.5, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 160, preco_custo: 100, margem_lucro: 60, cores_disponiveis: ['Linen', 'Natural'] },
  { id: 5, produto: 'PERSIANA ROLÔ', modelo: 'Tubo 45', nome: 'BK Alpes', codigo: '01500102', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 150, preco_custo: 95, margem_lucro: 58 }
];

function fmt(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function OrcamentoV2() {
  const [cliente, setCliente] = useState('');
  const [itens, setItens] = useState([]);
  const [itemAtual, setItemAtual] = useState(null);

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

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* Coluna principal: cascata */}
        <section>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Cliente
            </label>
            <input
              type="text"
              placeholder="Nome do cliente"
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
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
        </section>

        {/* Coluna lateral: itens + total */}
        <aside>
          <div style={{ background: 'white', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>
              Itens ({itens.length})
            </h3>

            {itens.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }}>
                Nenhum item adicionado ainda
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {itens.map(i => (
                  <li key={i.id} style={{ padding: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {i.produto.nome}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        {i.selection.largura}m × {i.selection.altura}m · Qtd {i.selection.quantidade}
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
                ))}
              </ul>
            )}

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: '#15803d' }}>R$ {fmt(total)}</span>
              </div>
              <button
                disabled={itens.length === 0}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '12px 20px',
                  background: itens.length === 0 ? '#e5e7eb' : '#2563eb',
                  color: itens.length === 0 ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: itens.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Salvar orçamento
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default OrcamentoV2;
