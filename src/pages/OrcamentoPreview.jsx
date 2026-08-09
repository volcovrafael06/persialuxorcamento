import React, { useState } from 'react';
import ProductSelectorCascata from '../components/ProductSelectorCascata';
import '../components/ProductSelectorCascata.css';

const PRODUTOS_MOCK = [
  { id: 1, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,21 Espessura — Lisa', codigo: '01250100', largura_maxima: 3.0, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 120, preco_custo: 80, margem_lucro: 50, cores_disponiveis: ['Branco', 'Bege', 'Cinza', 'Preto'] },
  { id: 2, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,18 Espessura (Furo não aparente) — Lisa', codigo: '01250110', largura_maxima: 3.0, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 140, preco_custo: 90, margem_lucro: 55, cores_disponiveis: ['Branco', 'Preto'] },
  { id: 3, produto: 'CORTINA ROLÔ', modelo: 'Tubo 45', nome: 'BK ARUBA - CREAM (281-04)', codigo: '01100101', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 180, preco_custo: 110, margem_lucro: 63, cores_disponiveis: ['Cream', 'Linen', 'Sand'] },
  { id: 4, produto: 'CORTINA ROLÔ', modelo: 'Tubo 32', nome: 'BK ALPES - LINEN (282-01)', codigo: '01100102', largura_maxima: 2.5, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 160, preco_custo: 100, margem_lucro: 60, cores_disponiveis: ['Linen', 'Natural'] },
  { id: 5, produto: 'PERSIANA ROLÔ', modelo: 'Tubo 45', nome: 'BK Alpes', codigo: '01500102', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 150, preco_custo: 95, margem_lucro: 58 }
];

// Mocka o produtoService para o preview
import { produtoService } from '../services/produtoService';
produtoService.getAll = async () => PRODUTOS_MOCK;

function calcularSubtotal(produto, largura, altura, qty) {
  if (!produto || !largura || !altura) return 0;
  const area = parseFloat(largura) * parseFloat(altura);
  const areaEfetiva = Math.max(area, produto.area_minima || 0);
  const preco = parseFloat(produto.preco_venda) || 0;
  return areaEfetiva * preco * qty;
}

function OrcamentoPreview() {
  const [itens, setItens] = useState([]);
  const [currentProduct, setCurrentProduct] = useState({});

  const handleCascataSelect = (payload) => {
    const { selection, customizacao, produto } = payload;
    const mapped = {
      product: produto,
      width: String(selection.largura || ''),
      height: String(selection.altura || ''),
      ambiente: selection.ambiente || '',
      quantity: parseInt(selection.quantidade) || 1,
      tc: selection.tc || '',
      customizacao: { ...customizacao }
    };
    setCurrentProduct(mapped);
  };

  const handleAdicionar = () => {
    if (!currentProduct.product) return;
    const subtotal = calcularSubtotal(
      currentProduct.product,
      currentProduct.width,
      currentProduct.height,
      currentProduct.quantity
    );
    setItens(prev => [...prev, { ...currentProduct, subtotal, id: Date.now() }]);
    setCurrentProduct({});
  };

  const total = itens.reduce((sum, i) => sum + (i.subtotal || 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Novo Orçamento — preview</h1>
        <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
          Cascata integrada com o fluxo de orçamento. Calcula subtotal em tempo real.
        </p>
      </header>

      <ProductSelectorCascata onSelect={handleCascataSelect} />

      {currentProduct.product && (
        <div style={{ marginTop: 16, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 8px' }}>Pronto para adicionar</h3>
          <div><strong>{currentProduct.product.nome}</strong> ({currentProduct.product.codigo})</div>
          <div>{currentProduct.width}m × {currentProduct.height}m · Qtd: {currentProduct.quantity}</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: '#14532d' }}>
            Subtotal: R$ {calcularSubtotal(currentProduct.product, currentProduct.width, currentProduct.height, currentProduct.quantity).toFixed(2)}
          </div>
          <button
            onClick={handleAdicionar}
            style={{ marginTop: 8, padding: '10px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            Adicionar ao orçamento
          </button>
        </div>
      )}

      {itens.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Itens do orçamento ({itens.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Produto</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Larg.</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Alt.</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Qtd</th>
                <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #e5e7eb' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                    <div>{i.product.nome}</div>
                    <code style={{ fontSize: 11, color: '#666' }}>{i.product.codigo}</code>
                  </td>
                  <td style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{i.width}m</td>
                  <td style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{i.height}m</td>
                  <td style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{i.quantity}</td>
                  <td style={{ padding: 8, textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>
                    R$ {i.subtotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" style={{ padding: 12, textAlign: 'right', fontWeight: 700 }}>Total:</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, fontSize: 16, color: '#16a34a' }}>
                  R$ {total.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default OrcamentoPreview;
