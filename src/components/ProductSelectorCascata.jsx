import React, { useState, useEffect, useMemo } from 'react';
import { produtoService } from '../services/produtoService';

const PASSO_DEFINICAO = 'definicao';
const PASSO_CUSTOMIZACAO = 'customizacao';

const OPCOES_COR_COMPONENTES = [
  { value: 'COMPONENTES BRANCOS', label: 'COMPONENTES BRANCOS' },
  { value: 'COMPONENTES BEGES', label: 'COMPONENTES BEGES' },
  { value: 'COMPONENTES CINZAS', label: 'COMPONENTES CINZAS' },
  { value: 'COMPONENTES MARRONS', label: 'COMPONENTES MARRONS' },
  { value: 'COMPONENTES PRETOS', label: 'COMPONENTES PRETOS' }
];

// Acionamentos derivados do modelo (D = direito, E = esquerdo).
const ACIONAMENTOS_POR_MODELO = {
  'D - ACIONAMENTO DIREITO': ['32', '32 DUPLEX', '38', '38 DUPLEX', '38 TRIPLEX', '45', '45 DUPLEX', '45 TRIPLEX', '55'],
  'E - ACIONAMENTO ESQUERDO': ['32', '32 DUPLEX', '38', '38 DUPLEX', '38 TRIPLEX', '45', '45 DUPLEX', '45 TRIPLEX', '55'],
  'X - ACIONAMENTO DUPLO': ['45', '55']
};

// Extrai a linha/produto raiz de um código (ex: "D - ACIONAMENTO DIREITO" → 'D').
const extrairLinhaAcionamento = (modelo) => {
  if (!modelo) return '';
  const m = String(modelo).trim().toUpperCase();
  if (m.startsWith('D ')) return 'D';
  if (m.startsWith('E ')) return 'E';
  if (m.startsWith('X ')) return 'X';
  return m[0] || '';
};

// Heurística para separar Coleção de Cor (sufixo após nome da coleção):
//
// Padrões reconhecidos (ordem importa):
// 1) "CORT ROLÔ - BK ARUBA - CREAM (281-04)"  → split por " - "
// 2) "BK Aruba Tubo 45"                      → "Tubo XX" como delimitador
// 3) "BK Alpes"                               → nome = coleção, cor vazia
// 4) "Dolly Soft Wave 5x7.5"                 → nome composto por coleção + modelo
// 5) "BK Super Hermes Cortina"               → coleção + "Cortina" como modelo
//
// Lista de MODELOS reconhecidos (regex-anchored no fim do nome):
const MODELOS_RECONHECIDOS = [
  // Tubo XX (final da string)
  /Tubo\s*\d+\s*$/i,
  // Modelos de cortina no fim
  /(?:Teto\s+(?:Bastão|Monocorrente)|Sky\s+Light|Teto\s+Bastão)\s*$/i,
  /(?:Vertical\s+Wave|Soft\s+Wave\s+[\dx.]+|Prega\s+(?:Macho|Americana)|Franzida\s+(?:Normal|Mini|Colmeia)|Cortina(?:s)?|Translúcidas|Pvc|Blackout|Tradicional|Plissada|Sem\s+Corda|FIXA)\s*$/i,
  // Persiana Horizontal
  /16\/25\s*$/i
];

const encontrarModelo = (nome) => {
  for (const regex of MODELOS_RECONHECIDOS) {
    const m = nome.match(regex);
    if (m) return m[0].trim();
  }
  return null;
};

// Extrai a coleção do nome, devolvendo a parte antes do modelo ou separador.
const extrairColecaoDoNome = (nome) => {
  if (!nome) return '';
  const s = String(nome).trim();
  // Formato 1: split por " — " (em dash com espaços) — separa especificação da cor
  if (s.includes(' — ')) {
    const partes = s.split(' — ').map(p => p.trim());
    // Heurística: coleção é o lado que contém "Espessura" / "Furo" / palavras técnicas
    // (ex: "ALUMÍNIO 25 MM - 0,18 Espessura (Furo não aparente) — Lisa")
    if (/Espessura|Furo/i.test(partes[0])) {
      // Caso: "0,18 Espessura (Furo não aparente) — Lisa" → coleção é a primeira parte
      return partes[0];
    }
    // Caso genérico: "BK ARUBA — CREAM" → coleção é a primeira parte
    return partes[0];
  }
  // Formato 2: split por " - " (hífen simples)
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

// Extrai a cor (modelo no fim do nome, ou segmento após separador).
const extrairCorDoNome = (nome) => {
  if (!nome) return '';
  const s = String(nome).trim();
  if (s.includes(' — ')) {
    const partes = s.split(' — ').map(p => p.trim());
    if (/Espessura|Furo/i.test(partes[0])) {
      return partes[1] || '';
    }
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

function ProductSelectorCascata({ onSelect }) {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [passo, setPasso] = useState(PASSO_DEFINICAO);
  const [selection, setSelection] = useState({
    linha: '',
    grupo: '',
    colecao: '',
    cor: '',
    produtoId: '',
    modelo: '',
    acionamento: '',
    quantidade: 1,
    largura: '',
    altura: '',
    tc: '',
    ambiente: ''
  });

  const [customizacao, setCustomizacao] = useState({
    corComponentes: '',
    perfilSuperior: '',
    guiaLateral: '',
    base: '',
    comando: '',
    corrente: '',
    recorte: '',
    rolamentoTecido: '',
    modoInstalacao: '',
    localInstalacao: ''
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await produtoService.getAll();
        setProdutos(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Cascata derivada de produtos
  const linhas = useMemo(() => [...new Set(produtos.map(p => p.produto).filter(Boolean))].sort(), [produtos]);

  const gruposPorLinha = useMemo(() => {
    // Sem coluna "grupo" no schema atual. Derivamos do modelo (ex: "Tubo 45", "FIXA").
    return [...new Set(
      produtos
        .filter(p => p.produto === selection.linha)
        .map(p => p.modelo)
        .filter(Boolean)
    )].sort();
  }, [produtos, selection.linha]);

  const colecoesPorGrupo = useMemo(() => {
    return [...new Set(
      produtos
        .filter(p => p.produto === selection.linha && p.modelo === selection.grupo)
        .map(p => extrairColecaoDoNome(p.nome))
        .filter(Boolean)
    )].sort();
  }, [produtos, selection.linha, selection.grupo]);

  const coresPorColecao = useMemo(() => {
    return [...new Set(
      produtos
        .filter(p =>
          p.produto === selection.linha &&
          p.modelo === selection.grupo &&
          extrairColecaoDoNome(p.nome) === selection.colecao
        )
        .map(p => extrairCorDoNome(p.nome))
        .filter(Boolean)
    )].sort();
  }, [produtos, selection.linha, selection.grupo, selection.colecao]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p =>
      p.produto === selection.linha &&
      p.modelo === selection.grupo &&
      extrairColecaoDoNome(p.nome) === selection.colecao &&
      extrairCorDoNome(p.nome) === selection.cor
    );
  }, [produtos, selection]);

  const acionamentos = useMemo(() => ACIONAMENTOS_POR_MODELO[selection.modelo] || ['32', '38', '45', '55'], [selection.modelo]);

  const produtoSelecionado = useMemo(
    () => produtos.find(p => p.id === selection.produtoId),
    [produtos, selection.produtoId]
  );

  // Limpa selections filhos quando o pai muda
  const handleLinhaChange = (linha) => setSelection(s => ({ ...s, linha, grupo: '', colecao: '', cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleGrupoChange = (grupo) => setSelection(s => ({ ...s, grupo, colecao: '', cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleColecaoChange = (colecao) => setSelection(s => ({ ...s, colecao, cor: '', produtoId: '', modelo: '', acionamento: '' }));
  const handleCorChange = (cor) => setSelection(s => ({ ...s, cor, produtoId: '', modelo: '', acionamento: '' }));
  const handleProdutoChange = (produtoId) => setSelection(s => ({ ...s, produtoId }));
  const handleModeloChange = (modelo) => setSelection(s => ({ ...s, modelo, acionamento: '' }));
  const handleAcionamentoChange = (acionamento) => setSelection(s => ({ ...s, acionamento }));

  const handleField = (field, value) => setSelection(s => ({ ...s, [field]: value }));
  const handleCustom = (field, value) => setCustomizacao(c => ({ ...c, [field]: value }));

  const podeAvancar = !!selection.linha && !!selection.grupo && !!selection.colecao && !!selection.cor && !!selection.produtoId && !!selection.modelo && !!selection.acionamento;

  const handleAvancar = () => {
    if (podeAvancar) {
      setPasso(PASSO_CUSTOMIZACAO);
      onSelect?.({ selection, customizacao, produto: produtoSelecionado });
    }
  };

  const handleVoltar = () => {
    if (passo === PASSO_CUSTOMIZACAO) setPasso(PASSO_DEFINICAO);
  };

  if (loading) return <div>Carregando produtos...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <div className="product-selector-cascata">
      {passo === PASSO_DEFINICAO && (
        <section>
          <h3>DEFINIÇÃO DO PRODUTO</h3>

          <label>Linha de Produto</label>
          <select value={selection.linha} onChange={e => handleLinhaChange(e.target.value)}>
            <option value="">-- No Selection --</option>
            {linhas.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <label>Grupo</label>
          <select value={selection.grupo} onChange={e => handleGrupoChange(e.target.value)} disabled={!selection.linha}>
            <option value="">-- No Selection --</option>
            {gruposPorLinha.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <label>Coleção</label>
          <select value={selection.colecao} onChange={e => handleColecaoChange(e.target.value)} disabled={!selection.grupo}>
            <option value="">-- No Selection --</option>
            {colecoesPorGrupo.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label>Cor</label>
          <select value={selection.cor} onChange={e => handleCorChange(e.target.value)} disabled={!selection.colecao}>
            <option value="">-- No Selection --</option>
            {coresPorColecao.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label>Produtos (Escolha um Produto)</label>
          <select value={selection.produtoId} onChange={e => handleProdutoChange(e.target.value)} disabled={!selection.cor}>
            <option value="">-- No Selection --</option>
            {produtosFiltrados.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.codigo})</option>)}
          </select>

          <label>Modelo</label>
          <select value={selection.modelo} onChange={e => handleModeloChange(e.target.value)} disabled={!produtoSelecionado}>
            <option value="">-- No Selection --</option>
            <option value="D - ACIONAMENTO DIREITO">D - ACIONAMENTO DIREITO</option>
            <option value="E - ACIONAMENTO ESQUERDO">E - ACIONAMENTO ESQUERDO</option>
            <option value="X - ACIONAMENTO DUPLO">X - ACIONAMENTO DUPLO</option>
          </select>

          <label>Acionamento</label>
          <select value={selection.acionamento} onChange={e => handleAcionamentoChange(e.target.value)} disabled={!selection.modelo}>
            <option value="">-- No Selection --</option>
            {acionamentos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <label>Quantidade</label>
          <input type="number" min="1" value={selection.quantidade} onChange={e => handleField('quantidade', Number(e.target.value))} />

          <label>Largura</label>
          <input type="number" step="0.01" value={selection.largura} onChange={e => handleField('largura', e.target.value)} />

          <label>Altura</label>
          <input type="number" step="0.01" value={selection.altura} onChange={e => handleField('altura', e.target.value)} />

          <label>T.C.</label>
          <input type="number" step="0.01" value={selection.tc} onChange={e => handleField('tc', e.target.value)} />

          <label>Ambiente</label>
          <input type="text" value={selection.ambiente} onChange={e => handleField('ambiente', e.target.value)} placeholder="Ex: Sala, Hall, Quarto" />

          {produtoSelecionado && (
            <div className="limites-medidas">
              <h4>Limite de Medidas</h4>
              <p>Larg. Máx.: {produtoSelecionado.largura_maxima || 'N/A'}</p>
              <p>Alt. Máx.: {produtoSelecionado.altura_minima || 'N/A'}</p>
              <p>Área Máx.: N/A</p>
              <p>Larg. Mín.: {produtoSelecionado.largura_minima || 'N/A'}</p>
              <p>Alt. Mín.: {produtoSelecionado.altura_minima || 'N/A'}</p>
            </div>
          )}

          <div className="acoes">
            <button type="button" disabled>Voltar</button>
            <button type="button" onClick={handleAvancar} disabled={!podeAvancar}>Avançar</button>
          </div>
        </section>
      )}

      {passo === PASSO_CUSTOMIZACAO && (
        <section>
          <div className="resumo">
            <h3>RESUMO DO PRODUTO</h3>
            <p><strong>Produto:</strong> {produtoSelecionado?.nome}</p>
            <p><strong>Modelo:</strong> {selection.modelo}</p>
            <p><strong>Acionamento:</strong> {selection.acionamento} - <strong>Largura:</strong> {selection.largura} - <strong>Altura:</strong> {selection.altura} - <strong>TC:</strong> {selection.tc} - <strong>Quantidade:</strong> {selection.quantidade}</p>
          </div>

          <h3>CUSTOMIZAÇÃO</h3>
          <p className="aviso">Os campos opcionais devem ser preenchidos sequencialmente, de cima para baixo, em razão de sua interdependência.</p>

          <label>Opcional: COR DOS COMPONENTES</label>
          <select value={customizacao.corComponentes} onChange={e => handleCustom('corComponentes', e.target.value)}>
            <option value="">Selecionar</option>
            {OPCOES_COR_COMPONENTES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label>Opcional: PERFIL SUPERIOR T45</label>
          <select value={customizacao.perfilSuperior} onChange={e => handleCustom('perfilSuperior', e.target.value)}>
            <option value="">Selecionar</option>
            {['SUPORTE', 'BANDÔ 1720 (Alt. Máx. = 3,00)', 'BANDÔ PRIME 100 (Alt. Máx. = 4,20)', 'BOX QUADRADO 100 BRANCO (Alt. Máx. = 5,50)', 'BOX REDONDO 90 (Alt. Máx. = 2,80)', 'NIVELADOR', 'NIVELADOR DUPLO TRANSPASSE BRANCO'].map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          <label>Opcional: GUIA LATERAL</label>
          <select value={customizacao.guiaLateral} onChange={e => handleCustom('guiaLateral', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="SEM GUIA LATERAL">SEM GUIA LATERAL</option>
          </select>

          <label>Opcional: BASE</label>
          <select value={customizacao.base} onChange={e => handleCustom('base', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="BASE SLIM">BASE SLIM</option>
          </select>

          <label>Opcional: COMANDO 45</label>
          <select value={customizacao.comando} onChange={e => handleCustom('comando', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="COMANDO ROLÔ 45MM">COMANDO ROLÔ 45MM</option>
          </select>

          <label>Opcional: CORRENTE</label>
          <select value={customizacao.corrente} onChange={e => handleCustom('corrente', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="CORRENTE PLÁSTICA">CORRENTE PLÁSTICA</option>
          </select>

          <label>Opcional: RECORTE</label>
          <select value={customizacao.recorte} onChange={e => handleCustom('recorte', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="SEM RECORTE">SEM RECORTE</option>
          </select>

          <label>Opcional: ROLAMENTO DO TECIDO</label>
          <select value={customizacao.rolamentoTecido} onChange={e => handleCustom('rolamentoTecido', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="DESCE POR TRÁS">DESCE POR TRÁS</option>
          </select>

          <label>Opcional: MODO DE INSTALAÇÃO</label>
          <select value={customizacao.modoInstalacao} onChange={e => handleCustom('modoInstalacao', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="PADRÃO">PADRÃO</option>
          </select>

          <label>Opcional: LOCAL DE INSTALAÇÃO (NÃO ACOMPANHA SUPORTES)</label>
          <select value={customizacao.localInstalacao} onChange={e => handleCustom('localInstalacao', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="TETO">TETO</option>
          </select>

          <div className="acoes">
            <button type="button" onClick={handleVoltar}>Voltar</button>
            <button type="button" onClick={() => onSelect?.({ selection, customizacao, produto: produtoSelecionado })}>Avançar</button>
          </div>
        </section>
      )}
    </div>
  );
}

export default ProductSelectorCascata;
