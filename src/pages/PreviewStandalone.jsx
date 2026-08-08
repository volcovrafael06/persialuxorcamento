import React, { useState } from 'react';

// Mock mínimo para visualização: não chama Supabase, não passa por auth.
// Replica as heurísticas de extração do ProductSelectorCascata para renderizar
// os selects a partir de uma lista estática de produtos.

const MODELOS_RECONHECIDOS = [
  /Tubo\s*\d+\s*$/i,
  /(?:Teto\s+(?:Bastão|Monocorrente)|Sky\s+Light|Teto\s+Bastão)\s*$/i,
  /(?:Vertical\s+Wave|Soft\s+Wave\s+[\dx.]+|Prega\s+(?:Macho|Americana)|Franzida\s+(?:Normal|Mini|Colmeia)|Cortina(?:s)?|Translúcidas|Pvc|Blackout|Tradicional|Plissada|Sem\s+Corda|FIXA)\s*$/i,
  /16\/25\s*$/i
];

const encontrarModelo = (nome) => {
  for (const regex of MODELOS_RECONHECIDOS) {
    const m = nome.match(regex);
    if (m) return m[0].trim();
  }
  return null;
};

const extrairColecaoDoNome = (nome) => {
  if (!nome) return '';
  const s = String(nome).trim();
  if (s.includes(' — ')) {
    const partes = s.split(' — ').map(p => p.trim());
    if (/Espessura|Furo/i.test(partes[0])) return partes[0];
    return partes[0];
  }
  if (s.includes(' - ')) {
    const partes = s.split(' - ').map(p => p.trim());
    return partes[0];
  }
  const modelo = encontrarModelo(s);
  if (modelo) {
    const idx = s.lastIndexOf(modelo);
    if (idx > 0) return s.slice(0, idx).trim();
  }
  return s;
};

const extrairCorDoNome = (nome) => {
  if (!nome) return '';
  const s = String(nome).trim();
  if (s.includes(' — ')) {
    const partes = s.split(' — ').map(p => p.trim());
    return partes[1] || '';
  }
  if (s.includes(' - ')) {
    const partes = s.split(' - ').map(p => p.trim());
    return partes[1] || '';
  }
  const modelo = encontrarModelo(s);
  if (modelo) {
    const idx = s.lastIndexOf(modelo);
    if (idx >= 0) return s.slice(idx).trim();
  }
  return '';
};

const PRODUTOS_MOCK = [
  { id: 1, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,21 Espessura — Lisa', codigo: '01250100', largura_maxima: 3.0, area_minima: 0.5, cores_disponiveis: ['Branco', 'Bege', 'Cinza', 'Preto'] },
  { id: 2, produto: 'PERSIANA HORIZONTAL', modelo: '16/25', nome: 'ALUMÍNIO 25 MM - 0,18 Espessura (Furo não aparente) — Lisa', codigo: '01250110', largura_maxima: 3.0, area_minima: 0.5, cores_disponiveis: ['Branco', 'Preto'] },
  { id: 3, produto: 'CORTINA ROLÔ', modelo: 'Tubo 45', nome: 'BK ARUBA - CREAM (281-04)', codigo: '01100101', largura_maxima: 3.5, area_minima: 0.8, cores_disponiveis: ['Cream', 'Linen', 'Sand'] },
  { id: 4, produto: 'CORTINA ROLÔ', modelo: 'Tubo 32', nome: 'BK ALPES - LINEN (282-01)', codigo: '01100102', largura_maxima: 2.5, area_minima: 0.5, cores_disponiveis: ['Linen', 'Natural'] },
  { id: 5, produto: 'CORTINA ROLÔ', modelo: 'Tubo 45', nome: 'BK SUPER HERMES Cortina', codigo: '01100103', largura_maxima: 3.5, area_minima: 0.8, cores_disponiveis: ['Gold', 'Silver'] },
  { id: 6, produto: 'PERSIANA VERTICAL', modelo: 'Vertical Wave', nome: 'Dolly Soft Wave 5x7.5 - BRANCO', codigo: '01300101', largura_maxima: 4.0, area_minima: 1.0, cores_disponiveis: ['Branco', 'Bege'] },
  { id: 7, produto: 'PERSIANA VERTICAL', modelo: 'Vertical Wave', nome: 'Dolly Soft Wave 5x7.5 - BEGE', codigo: '01300102', largura_maxima: 4.0, area_minima: 1.0, cores_disponiveis: ['Bege'] },
  { id: 8, produto: 'TOLDOS', modelo: 'Teto Bastão', nome: 'Toldo TEB - Lona Bege', codigo: '01400101', largura_maxima: 6.0, area_minima: 2.0 },
  { id: 9, produto: 'TOLDOS', modelo: 'Teto Monocorrente', nome: 'Toldo TEM - Lona Cinza', codigo: '01400102', largura_maxima: 6.0, area_minima: 2.0 },
  { id: 10, produto: 'PERSIANA ROLÔ', modelo: 'FIXA', nome: 'Sky Light FIXA - Cristal', codigo: '01500101', largura_maxima: 2.0, area_minima: 0.3 },
  { id: 11, produto: 'PERSIANA ROLÔ', modelo: 'Tubo 45', nome: 'BK Alpes', codigo: '01500102', largura_maxima: 3.5, area_minima: 0.8 },
  { id: 12, produto: 'CORTINA ROLÔ', modelo: 'Tubo 38', nome: 'Roxinol Prega Macho - MARROM', codigo: '01100104', largura_maxima: 3.0, area_minima: 0.7, cores_disponiveis: ['Marrom', 'Tabaco'] }
];

const ACIONAMENTOS_POR_MODELO = {
  'D - ACIONAMENTO DIREITO': ['32', '32 DUPLEX', '38', '38 DUPLEX', '38 TRIPLEX', '45', '45 DUPLEX', '45 TRIPLEX', '55'],
  'E - ACIONAMENTO ESQUERDO': ['32', '32 DUPLEX', '38', '38 DUPLEX', '38 TRIPLEX', '45', '45 DUPLEX', '45 TRIPLEX', '55'],
  'X - ACIONAMENTO DUPLO': ['45', '55']
};

const OPCOES_COR_COMPONENTES = [
  { value: 'COMPONENTES BRANCOS', label: 'COMPONENTES BRANCOS' },
  { value: 'COMPONENTES BEGES', label: 'COMPONENTES BEGES' },
  { value: 'COMPONENTES CINZAS', label: 'COMPONENTES CINZAS' },
  { value: 'COMPONENTES MARRONS', label: 'COMPONENTES MARRONS' },
  { value: 'COMPONENTES PRETOS', label: 'COMPONENTES PRETOS' }
];

function PreviewStandalone() {
  const [sel, setSel] = useState({
    linha: '', grupo: '', colecao: '', cor: '', produtoId: '', modelo: '', acionamento: '',
    quantidade: 1, largura: '', altura: '', tc: '', ambiente: ''
  });
  const [custom, setCustom] = useState({
    corComponentes: '', perfilSuperior: '', guiaLateral: '', base: '',
    comando: '', corrente: '', recorte: '', rolamentoTecido: '',
    modoInstalacao: '', localInstalacao: ''
  });
  const [passo, setPasso] = useState('definicao');

  const produtos = PRODUTOS_MOCK;
  const linhas = [...new Set(produtos.map(p => p.produto).filter(Boolean))].sort();
  const gruposPorLinha = [...new Set(produtos.filter(p => p.produto === sel.linha).map(p => p.modelo).filter(Boolean))].sort();
  const colecoesPorGrupo = [...new Set(produtos.filter(p => p.produto === sel.linha && p.modelo === sel.grupo).map(p => extrairColecaoDoNome(p.nome)).filter(Boolean))].sort();
  const coresPorColecao = [...new Set(produtos.filter(p => p.produto === sel.linha && p.modelo === sel.grupo && extrairColecaoDoNome(p.nome) === sel.colecao).map(p => extrairCorDoNome(p.nome)).filter(Boolean))].sort();
  const produtosFiltrados = produtos.filter(p => p.produto === sel.linha && p.modelo === sel.grupo && extrairColecaoDoNome(p.nome) === sel.colecao && extrairCorDoNome(p.nome) === sel.cor);
  const acionamentos = ACIONAMENTOS_POR_MODELO[sel.modelo] || ['32', '38', '45', '55'];
  const produtoSelecionado = produtos.find(p => p.id === Number(sel.produtoId));

  const setField = (field, value) => setSel(s => ({ ...s, [field]: value }));
  const handleLinha = (v) => setSel(s => ({ ...s, linha: v, grupo: '', colecao: '', cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleGrupo = (v) => setSel(s => ({ ...s, grupo: v, colecao: '', cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleColecao = (v) => setSel(s => ({ ...s, colecao: v, cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleCor = (v) => setSel(s => ({ ...s, cor: v, produtoId: '', modelo: '', acionamento: '' }));
  const handleModelo = (v) => setSel(s => ({ ...s, modelo: v, acionamento: '' }));

  const podeAvancar = !!sel.linha && !!sel.grupo && !!sel.colecao && !!sel.cor && !!sel.produtoId && !!sel.modelo && !!sel.acionamento;

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui, sans-serif', background: '#f7f7f8', minHeight: '100vh' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Preview do Seletor Cascata</h1>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
          Dados mockados — sem Supabase, sem login. Mostra como o seletor vai aparecer para o usuário final.
        </p>
      </header>

      {passo === 'definicao' && (
        <section style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ marginTop: 0, fontSize: 16, color: '#333' }}>DEFINIÇÃO DO PRODUTO</h3>

          <Field label="Linha de Produto">
            <select value={sel.linha} onChange={e => handleLinha(e.target.value)} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {linhas.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>

          <Field label="Grupo">
            <select value={sel.grupo} onChange={e => handleGrupo(e.target.value)} disabled={!sel.linha} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {gruposPorLinha.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>

          <Field label="Coleção">
            <select value={sel.colecao} onChange={e => handleColecao(e.target.value)} disabled={!sel.grupo} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {colecoesPorGrupo.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Cor">
            <select value={sel.cor} onChange={e => handleCor(e.target.value)} disabled={!sel.colecao} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {coresPorColecao.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Produtos (Escolha um Produto)">
            <select value={sel.produtoId} onChange={e => setField('produtoId', e.target.value)} disabled={!sel.cor} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {produtosFiltrados.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.codigo})</option>)}
            </select>
          </Field>

          <Field label="Modelo">
            <select value={sel.modelo} onChange={e => handleModelo(e.target.value)} disabled={!produtoSelecionado} style={selectStyle}>
              <option value="">-- No Selection --</option>
              <option value="D - ACIONAMENTO DIREITO">D - ACIONAMENTO DIREITO</option>
              <option value="E - ACIONAMENTO ESQUERDO">E - ACIONAMENTO ESQUERDO</option>
              <option value="X - ACIONAMENTO DUPLO">X - ACIONAMENTO DUPLO</option>
            </select>
          </Field>

          <Field label="Acionamento">
            <select value={sel.acionamento} onChange={e => setField('acionamento', e.target.value)} disabled={!sel.modelo} style={selectStyle}>
              <option value="">-- No Selection --</option>
              {acionamentos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Quantidade">
              <input type="number" min="1" value={sel.quantidade} onChange={e => setField('quantidade', Number(e.target.value))} style={selectStyle} />
            </Field>
            <Field label="Largura">
              <input type="number" step="0.01" value={sel.largura} onChange={e => setField('largura', e.target.value)} style={selectStyle} />
            </Field>
            <Field label="Altura">
              <input type="number" step="0.01" value={sel.altura} onChange={e => setField('altura', e.target.value)} style={selectStyle} />
            </Field>
            <Field label="T.C.">
              <input type="number" step="0.01" value={sel.tc} onChange={e => setField('tc', e.target.value)} style={selectStyle} />
            </Field>
          </div>
          <Field label="Ambiente">
            <input type="text" value={sel.ambiente} onChange={e => setField('ambiente', e.target.value)} placeholder="Ex: Sala, Hall, Quarto" style={selectStyle} />
          </Field>

          {produtoSelecionado && (
            <div style={{ marginTop: 16, padding: 12, background: '#f0f4ff', borderRadius: 6, fontSize: 13 }}>
              <h4 style={{ margin: '0 0 8px' }}>Limite de Medidas</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span>Larg. Máx.: {produtoSelecionado.largura_maxima ?? 'N/A'}</span>
                <span>Alt. Máx.: {produtoSelecionado.altura_maxima ?? 'N/A'}</span>
                <span>Larg. Mín.: {produtoSelecionado.largura_minima ?? 'N/A'}</span>
                <span>Alt. Mín.: {produtoSelecionado.altura_minima ?? 'N/A'}</span>
                <span>Área Mín.: {produtoSelecionado.area_minima ?? 'N/A'} m²</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button disabled style={btnDisabled}>Voltar</button>
            <button onClick={() => setPasso('customizacao')} disabled={!podeAvancar} style={podeAvancar ? btnPrimary : btnDisabled}>Avançar</button>
          </div>
        </section>
      )}

      {passo === 'customizacao' && (
        <section style={{ background: 'white', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: 16, background: '#f9fafb', borderRadius: 6, marginBottom: 16, fontSize: 13, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>RESUMO DO PRODUTO</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 8, color: 'white',
                  background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 700
                }}>
                  {(produtoSelecionado?.produto || 'P').charAt(0)}
                </div>
                <code style={{ fontFamily: 'monospace', fontSize: 11, background: '#e5e7eb', padding: '2px 6px', borderRadius: 4 }}>
                  {produtoSelecionado?.codigo}
                </code>
              </div>
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
                <div><strong>Produto:</strong> {produtoSelecionado?.nome}</div>
                <div><strong>Linha:</strong> {sel.linha} · <strong>Coleção:</strong> {sel.colecao}</div>
                <div><strong>Cor:</strong> {sel.cor || <em>—</em>}</div>
                <div><strong>Modelo:</strong> {sel.modelo} · <strong>Acionamento:</strong> {sel.acionamento}</div>
                <div><strong>Medidas:</strong> {sel.largura}m × {sel.altura}m · <strong>TC:</strong> {sel.tc || '—'} · <strong>Qtd:</strong> {sel.quantidade}</div>
              </div>
            </div>
            {produtoSelecionado && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
                <span style={limiteBadge}>Larg. Máx.: {produtoSelecionado.largura_maxima ?? 'N/A'}</span>
                <span style={limiteBadge}>Área Mín.: {produtoSelecionado.area_minima ?? 'N/A'} m²</span>
              </div>
            )}
          </div>

          {produtoSelecionado?.cores_disponiveis?.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#14532d', textTransform: 'uppercase' }}>Cores disponíveis</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {produtoSelecionado.cores_disponiveis.map(c => (
                  <span key={c} style={{
                    fontSize: 11, background: 'white', color: '#14532d',
                    padding: '4px 10px', borderRadius: 12, border: '1px solid #86efac'
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 16, color: '#333' }}>CUSTOMIZAÇÃO</h3>
          <p style={{ fontSize: 12, color: '#666', margin: '4px 0 16px' }}>
            Os campos opcionais devem ser preenchidos sequencialmente, de cima para baixo, em razão de sua interdependência.
          </p>

          <Field label="Opcional: COR DOS COMPONENTES">
            <select value={custom.corComponentes} onChange={e => setCustom(c => ({...c, corComponentes: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              {OPCOES_COR_COMPONENTES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Opcional: PERFIL SUPERIOR T45">
            <select value={custom.perfilSuperior} onChange={e => setCustom(c => ({...c, perfilSuperior: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              {['SUPORTE', 'BANDÔ 1720 (Alt. Máx. = 3,00)', 'BANDÔ PRIME 100 (Alt. Máx. = 4,20)', 'BOX QUADRADO 100 BRANCO (Alt. Máx. = 5,50)', 'BOX REDONDO 90 (Alt. Máx. = 2,80)', 'NIVELADOR', 'NIVELADOR DUPLO TRANSPASSE BRANCO'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Opcional: GUIA LATERAL">
            <select value={custom.guiaLateral} onChange={e => setCustom(c => ({...c, guiaLateral: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="SEM GUIA LATERAL">SEM GUIA LATERAL</option>
            </select>
          </Field>
          <Field label="Opcional: BASE">
            <select value={custom.base} onChange={e => setCustom(c => ({...c, base: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="BASE SLIM">BASE SLIM</option>
            </select>
          </Field>
          <Field label="Opcional: COMANDO 45">
            <select value={custom.comando} onChange={e => setCustom(c => ({...c, comando: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="COMANDO ROLÔ 45MM">COMANDO ROLÔ 45MM</option>
            </select>
          </Field>
          <Field label="Opcional: CORRENTE">
            <select value={custom.corrente} onChange={e => setCustom(c => ({...c, corrente: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="CORRENTE PLÁSTICA">CORRENTE PLÁSTICA</option>
            </select>
          </Field>
          <Field label="Opcional: RECORTE">
            <select value={custom.recorte} onChange={e => setCustom(c => ({...c, recorte: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="SEM RECORTE">SEM RECORTE</option>
            </select>
          </Field>
          <Field label="Opcional: ROLAMENTO DO TECIDO">
            <select value={custom.rolamentoTecido} onChange={e => setCustom(c => ({...c, rolamentoTecido: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="DESCE POR TRÁS">DESCE POR TRÁS</option>
            </select>
          </Field>
          <Field label="Opcional: MODO DE INSTALAÇÃO">
            <select value={custom.modoInstalacao} onChange={e => setCustom(c => ({...c, modoInstalacao: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="PADRÃO">PADRÃO</option>
            </select>
          </Field>
          <Field label="Opcional: LOCAL DE INSTALAÇÃO (NÃO ACOMPANHA SUPORTES)">
            <select value={custom.localInstalacao} onChange={e => setCustom(c => ({...c, localInstalacao: e.target.value}))} style={selectStyle}>
              <option value="">Selecionar</option>
              <option value="TETO">TETO</option>
            </select>
          </Field>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button onClick={() => setPasso('definicao')} style={btnSecondary}>Voltar</button>
            <button onClick={() => alert('Em modo preview, o item não é salvo.')} style={btnPrimary}>Avançar</button>
          </div>
        </section>
      )}
    </div>
  );
}

const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d0d0d7',
  borderRadius: 6,
  fontSize: 14,
  background: 'white'
};
const limiteBadge = { fontSize: 11, background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: 4 };
const btnPrimary = { padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const btnSecondary = { padding: '10px 20px', background: 'white', color: '#333', border: '1px solid #d0d0d7', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const btnDisabled = { padding: '10px 20px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontWeight: 600 };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

export default PreviewStandalone;
