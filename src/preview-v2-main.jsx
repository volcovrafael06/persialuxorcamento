import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import OrcamentoV2 from './pages/OrcamentoV2';
import ProductSelectorCascata from './components/ProductSelectorCascata';
import { produtosAcessorioService } from './services/produtosAcessorioService';

class EB extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('PREVIEW ERR:', err, info); }
  render() {
    if (this.state.err) return <pre style={{padding:20,color:'#900',background:'#fee'}}>{this.state.err.stack || this.state.err.message}</pre>;
    return this.props.children;
  }
}

// Injeta mocks no service para o preview standalone conseguir listar produtos
// e acessórios sem depender de autenticação no Supabase.
const PRODUTOS_MOCK = [
  { id: 1, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,21 Espessura — Lisa', codigo: '01250100', largura_maxima: 3.0, area_minima: 0.5, metodo_calculo: 'm2', preco_venda: 120, preco_custo: 80, margem_lucro: 50, cores_disponiveis: ['Branco', 'Bege', 'Cinza', 'Preto'] },
  { id: 2, produto: 'CORTINA ROLÔ', modelo: 'Tubo 45', nome: 'BK ARUBA - CREAM (281-04)', codigo: '01100101', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 180, preco_custo: 110, margem_lucro: 63, cores_disponiveis: ['Cream', 'Linen', 'Sand'] },
  { id: 3, produto: 'PERSIANA ROLÔ', modelo: 'Tubo 45', nome: 'BK Alpes', codigo: '01500102', largura_maxima: 3.5, area_minima: 0.8, metodo_calculo: 'm2', preco_venda: 150, preco_custo: 95, margem_lucro: 58 }
];
const ACESSORIOS_MOCK = [
  { id: 'acc-001', name: 'Trilho Redondo com Comando', unit: 'ml', colors: [{ color: 'Branco', sale_price: 45, cost_price: 30 }, { color: 'Preto', sale_price: 50, cost_price: 35 }] },
  { id: 'acc-002', name: 'Trilho Slim com Comando', unit: 'ml', colors: [{ color: 'Branco', sale_price: 60, cost_price: 40 }] },
  { id: 'acc-003', name: 'Bandô Prime 100', unit: 'm²', colors: [{ color: 'Branco', sale_price: 180, cost_price: 120 }] },
  { id: 'acc-004', name: 'Bando 1720', unit: 'm²', colors: [{ color: 'Aluminio', sale_price: 220, cost_price: 150 }] },
  { id: 'acc-005', name: 'Box Quadrado 100 Branco', unit: 'm²', colors: [{ color: 'Branco', sale_price: 280, cost_price: 200 }] },
  { id: 'acc-006', name: 'Corrente Plástica', unit: 'ml', colors: [{ color: 'Branco', sale_price: 8, cost_price: 4 }, { color: 'Preto', sale_price: 9, cost_price: 5 }] },
  { id: 'acc-007', name: 'Suporte Teto', unit: 'un', colors: [{ color: 'Branco', sale_price: 12, cost_price: 6 }] },
  { id: 'acc-008', name: 'Comando Rolô 45mm', unit: 'un', colors: [{ color: 'Branco', sale_price: 35, cost_price: 22 }] }
];
const CLIENTES_MOCK = [
  { id: 'cli-1', name: 'Maria Silva', phone: '11999990000' },
  { id: 'cli-2', name: 'João Santos', phone: '11988887777' },
  { id: 'cli-3', name: 'Ana Oliveira', phone: '11977776666' }
];

// Patch do service para retornar mocks em vez de tentar Supabase.
produtosAcessorioService.getAll = async () => ACESSORIOS_MOCK;

// Wrapper que injeta initialProducts no cascata e mocks no OrcamentoV2.
function PreviewWrapper() {
  const handleCascataSelect = (payload) => {
    console.log('[preview v2] cascata payload:', payload);
  };
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ marginBottom: 16, padding: 12, background: '#fef3c7', borderRadius: 8, fontSize: 13 }}>
        <strong>Modo preview standalone</strong> · dados mockados · sem autenticação · salvar tentará INSERT no Supabase (irá falhar 401 — esperado)
      </div>
      <ProductSelectorCascata initialProducts={PRODUTOS_MOCK} onSelect={handleCascataSelect} />
      <div style={{ marginTop: 24, padding: 16, background: 'white', borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Acessórios (mock)</h3>
        <ul style={{ fontSize: 13, color: '#374151' }}>
          {ACESSORIOS_MOCK.map(a => <li key={a.id}>{a.name} ({a.unit}) — {a.colors.length} cor(es)</li>)}
        </ul>
      </div>
      <div style={{ marginTop: 24, padding: 16, background: 'white', borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Clientes (mock)</h3>
        <ul style={{ fontSize: 13, color: '#374151' }}>
          {CLIENTES_MOCK.map(c => <li key={c.id}>{c.name} · {c.phone}</li>)}
        </ul>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <EB>
        <PreviewWrapper />
      </EB>
    </BrowserRouter>
  </React.StrictMode>
);
