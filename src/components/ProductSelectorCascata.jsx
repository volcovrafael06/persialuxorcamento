import React, { useState, useEffect, useMemo } from 'react';
import { produtoService } from '../services/produtoService';
import './ProductSelectorCascata.css';

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

// Normaliza um valor de cor (pode vir como string ou como objeto { color: '...' })
// para sempre devolver uma string.
const normalizeColor = (c) => {
  if (!c) return null;
  if (typeof c === 'string') return c.trim() || null;
  if (typeof c === 'object' && c !== null) {
    // suporta { color: 'Branco' } ou { nome: 'Branco' } etc.
    return (c.color || c.nome || String(c)).trim() || null;
  }
  return String(c).trim() || null;
};

function ProductSelectorCascata({ onSelect, initialProducts }) {
  const [produtos, setProdutos] = useState(Array.isArray(initialProducts) ? initialProducts : []);
  const [loading, setLoading] = useState(!Array.isArray(initialProducts) || initialProducts.length === 0);
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
    // Se initialProducts foi passado (modo preview/standalone), não recarregar
    // do Supabase — o estado já está populado.
    if (Array.isArray(initialProducts) && initialProducts.length > 0) {
      setLoading(false);
      return;
    }
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
  }, [initialProducts]);

  // Cascata derivada de produtos.
// Usa as colunas explicitas (linha/grupo/colecao/cor) quando populadas;
// cai pra regex do nome quando nao existem (compatibilidade retroativa).
const getLinha = (p) => p.linha || p.produto;
const getGrupo = (p) => p.grupo || p.modelo;
const getColecao = (p) => {
  if (p.colecao) return p.colecao;
  return extrairColecaoDoNome(p.nome);
};
const getCor = (p) => {
  if (p.cor) return p.cor;
  return extrairCorDoNome(p.nome);
};

const linhas = useMemo(() => [...new Set(produtos.map(getLinha).filter(Boolean))].sort(), [produtos]);

const gruposPorLinha = useMemo(() => {
    return [...new Set(
      produtos
        .filter(p => getLinha(p) === selection.linha)
        .map(getGrupo)
        .filter(Boolean)
    )].sort();
  }, [produtos, selection.linha]);

const colecoesPorGrupo = useMemo(() => {
    return [...new Set(
      produtos
        .filter(p =>
          getLinha(p) === selection.linha &&
          getGrupo(p) === selection.grupo
        )
        .map(getColecao)
        .filter(Boolean)
    )].sort();
  }, [produtos, selection.linha, selection.grupo]);

  const coresPorColecao = useMemo(() => {
    // Combina cores extraídas do nome (regex) com cores_disponiveis do banco
    // (JSONB) e da coluna explicita `cor`. A coluna explicita tem prioridade.
    const extracted = produtos
      .filter(p =>
        getLinha(p) === selection.linha &&
        getGrupo(p) === selection.grupo &&
        getColecao(p) === selection.colecao
      );
    const fromColuna = extracted.map(p => normalizeColor(p.cor)).filter(Boolean);
    const fromName = extracted.map(p => extrairCorDoNome(p.nome)).filter(Boolean);
    const fromDb = extracted
      .flatMap(p => Array.isArray(p.cores_disponiveis) ? p.cores_disponiveis : [])
      .map(c => normalizeColor(c))
      .filter(Boolean);
    return [...new Set([...fromColuna, ...fromName, ...fromDb])].sort();
  }, [produtos, selection.linha, selection.grupo, selection.colecao]);

  // Cores do produto selecionado (preferência: JSONB, fallback: regex).
  const produtoSelecionado = useMemo(() => {
    if (!selection.produtoId) return null;
    // Coerce to string para suportar option values que vêm como string
    return produtos.find(p => String(p.id) === String(selection.produtoId)) || null;
  }, [produtos, selection.produtoId]);

  const coresDoProduto = useMemo(() => {
    if (!produtoSelecionado) return [];
    if (Array.isArray(produtoSelecionado.cores_disponiveis) && produtoSelecionado.cores_disponiveis.length > 0) {
      return produtoSelecionado.cores_disponiveis
        .map(c => normalizeColor(c))
        .filter(Boolean);
    }
    const cor = extrairCorDoNome(produtoSelecionado.nome);
    return cor ? [cor] : [];
  }, [produtoSelecionado]);

  const produtosFiltrados = useMemo(() => {
    return produtos.filter(p =>
      getLinha(p) === selection.linha &&
      getGrupo(p) === selection.grupo &&
      getColecao(p) === selection.colecao &&
      getCor(p) === selection.cor
    );
  }, [produtos, selection]);

  const acionamentos = useMemo(() => ACIONAMENTOS_POR_MODELO[selection.modelo] || ['32', '38', '45', '55'], [selection.modelo]);

  // Calcula preço estimado em tempo real. Suporta m², ml e altura (Wave).
  const precoEstimado = useMemo(() => {
    if (!produtoSelecionado) return null;
    const largura = parseFloat(selection.largura) || 0;
    const altura = parseFloat(selection.altura) || 0;
    const qty = parseInt(selection.quantidade) || 1;
    if (largura <= 0 || altura <= 0) return null;
    const precoVenda = parseFloat(produtoSelecionado.preco_venda) || 0;
    if (precoVenda <= 0) return null;

    const metodo = (produtoSelecionado.metodo_calculo || '').toLowerCase();
    let base = 0;
    if (metodo === 'ml' || metodo === 'linear') {
      base = largura * precoVenda;
    } else if (metodo === 'altura') {
      base = altura * precoVenda;
    } else {
      // m² (default): respeita area_minima
      const area = largura * altura;
      const areaMin = parseFloat(produtoSelecionado.area_minima) || 0;
      const areaEfetiva = Math.max(area, areaMin);
      base = areaEfetiva * precoVenda;
    }
    return base * qty;
  }, [produtoSelecionado, selection.largura, selection.altura, selection.quantidade]);

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
            <div className="resumo-grid">
              {produtoSelecionado && (
                <div className="resumo-preview" aria-hidden="true">
                  <div className="preview-placeholder">
                    <span>{produtoSelecionado.produto?.charAt(0) || 'P'}</span>
                  </div>
                  <code className="codigo">{produtoSelecionado.codigo}</code>
                </div>
              )}
              <div className="resumo-detalhes">
                <p><strong>Produto:</strong> {produtoSelecionado?.nome}</p>
                <p><strong>Linha:</strong> {selection.linha}</p>
                <p><strong>Coleção:</strong> {selection.colecao}</p>
                <p><strong>Cor:</strong> {selection.cor || <em>não especificada</em>}</p>
                <p><strong>Modelo:</strong> {selection.modelo}</p>
                <p><strong>Acionamento:</strong> {selection.acionamento}</p>
                <p>
                  <strong>Medidas:</strong> {selection.largura}m × {selection.altura}m
                  {' · '}<strong>TC:</strong> {selection.tc || '—'}
                  {' · '}<strong>Qtd:</strong> {selection.quantidade}
                </p>
              </div>
            </div>
            {produtoSelecionado && (
              <div className="limites-medidas-inline">
                <span>Larg. Máx.: {produtoSelecionado.largura_maxima ?? 'N/A'}</span>
                <span>Alt. Máx.: {produtoSelecionado.altura_minima ?? 'N/A'}</span>
                <span>Área Mín.: {produtoSelecionado.area_minima ?? 'N/A'} m²</span>
              </div>
            )}
          </div>

          {coresDoProduto.length > 0 && (
            <div className="cores-disponiveis">
              <h4>Cores disponíveis para este produto</h4>
              <ul>
                {coresDoProduto.map(c => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}

          {precoEstimado !== null && (
            <div className="preco-estimado">
              <div className="preco-label">Preço estimado</div>
              <div className="preco-valor">
                R$ {precoEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="preco-detalhes">
                {(produtoSelecionado.metodo_calculo || 'm²').toLowerCase()} · {produtoSelecionado.area_minima ? `Área mín. ${produtoSelecionado.area_minima}` : ''}
              </div>
            </div>
          )}

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
