// Standalone NO-AUTH do OrcamentoV2 para pré-visualizar a UI com dados reais
// do Supabase (cache localDB) sem precisar de tela de login.
//
// Comportamento:
// - em browser SEM session: o serviço vai cair no localDB (pode estar vazio)
// - este arquivo NAO existe em produção (não muda o bundle)
// - é SÓ para desenvolvimento rápido

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import OrcamentoV2 from './pages/OrcamentoV2';

class EB extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('PREVIEW ERR:', err, info); }
  render() {
    if (this.state.err) return <pre style={{ padding: 20, color: '#900', background: '#fee' }}>{this.state.err.stack || this.state.err.message}</pre>;
    return this.props.children;
  }
}

function PreviewWrapper() {
  return (
    <OrcamentoV2
      products={[]}
      customers={[]}
      setCustomers={() => {}}
      accessories={[]}
    />
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
