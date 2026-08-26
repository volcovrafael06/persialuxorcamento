const firstValue = (...values) => values.find(value => value !== null && value !== undefined && value !== '');

export const getProductPresentationFields = (product = {}, item = {}) => ({
  name: firstValue(
    product.nome,
    product.name,
    item.produto?.nome,
    item.produto?.name,
    item.product?.nome,
    item.product?.name,
    item.nome,
    item.name,
    item.produto_id ? `Produto #${item.produto_id}` : 'Produto sem nome'
  ),
  model: firstValue(product.modelo, item.produto?.modelo, item.product?.modelo),
  fabric: firstValue(product.tecido, item.produto?.tecido, item.product?.tecido),
  code: firstValue(product.codigo, item.produto?.codigo, item.product?.codigo)
});

export const buildCustomerPdfDescription = (product = {}, item = {}) => {
  const fields = getProductPresentationFields(product, item);
  const productParts = [fields.name];

  if (item.painel) {
    productParts.push('PAINEL');
  } else if (fields.model) {
    productParts.push(fields.model);
  }

  // Acionamento do modelo (D/E/X) — vem da seleção V2 (selection.acionamento)
  const acionamento = item.acionamento
    || item.selection?.acionamento
    || product.acionamento
    || '';
  if (acionamento && !item.painel) {
    productParts.push(`Acion: ${acionamento}`);
  }

  if (fields.fabric) productParts.push(fields.fabric);
  if (fields.code) productParts.push(fields.code);

  // Cor (vinda da cascata V2, selection V2 ou cadastro)
  const cor = item.cor || item.color || item.selection?.cor || '';
  if (cor) productParts.push(cor);

  const optionParts = [];
  if (item.painel && Number(item.num_folhas) > 1) {
    optionParts.push(`${Number(item.num_folhas)} FOLHAS`);
  }
  if (item.bando) optionParts.push('COM BANDO');
  if (item.trilho_tipo) optionParts.push(`TRILHO: ${item.trilho_tipo}`);

  // Customização do seletor em cascata (V2). Substitui underscores por espaço
  // e capitaliza pra ficar legível.
  if (item.customizacao && typeof item.customizacao === 'object') {
    Object.entries(item.customizacao).forEach(([k, v]) => {
      if (!v) return;
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      optionParts.push(`${label}: ${v}`);
    });
  }

  optionParts.push(item.instalacao ? 'INSTALADO' : 'SEM INSTALAÇÃO');

  return [productParts.join(' - '), optionParts.join(' - ')]
    .filter(Boolean)
    .join(' | ');
};

// Versão estruturada (linhas separadas) para renderizar como JSX no HTML.
// Retorna um array de strings, uma por linha.
export const buildCustomerHtmlDescription = (product = {}, item = {}) => {
  const fields = getProductPresentationFields(product, item);
  const lines = [];

  const headerParts = [fields.name];
  if (item.painel) headerParts.push('PAINEL');
  else if (fields.model) headerParts.push(fields.model);
  if (fields.fabric) headerParts.push(fields.fabric);
  if (fields.code) headerParts.push(fields.code);
  const cor = item.cor || item.color;
  if (cor) headerParts.push(cor);
  lines.push(headerParts.filter(Boolean).join(' - '));

  // Linha 2: dimensões + trilho + customização + instalação
  const inputWidth = firstValue(item.input_width, item.inputWidth, item.largura, item.width, '');
  const inputHeight = firstValue(item.input_height, item.inputHeight, item.altura, item.height, '');
  const line2 = [];
  if (inputWidth && inputHeight) {
    line2.push(`${parseFloat(inputWidth).toFixed(2)}m x ${parseFloat(inputHeight).toFixed(2)}m`);
  }
  if (item.painel && Number(item.num_folhas) > 1) {
    line2.push(`${Number(item.num_folhas)} FOLHAS`);
  }
  if (item.bando) line2.push('COM BANDO');
  if (item.trilho_tipo) line2.push(`TRILHO: ${item.trilho_tipo}`);
  if (item.customizacao && typeof item.customizacao === 'object') {
    Object.entries(item.customizacao).forEach(([k, v]) => {
      if (v) line2.push(`${k}: ${v}`);
    });
  }
  line2.push(item.instalacao ? 'INSTALADO' : 'SEM INSTALAÇÃO');
  if (line2.length) lines.push(line2.join(' - '));

  // Linha 3: folhas do painel
  if (item.painel && Number(item.num_folhas) > 1 && inputWidth && inputHeight) {
    const sheetWidth = (parseFloat(inputWidth) * 1.1 / Number(item.num_folhas)).toFixed(2);
    const sheetHeight = parseFloat(inputHeight).toFixed(2);
    lines.push(`Cada folha: ${sheetWidth}m x ${sheetHeight}m (${item.num_folhas} folhas)`);
  }

  return lines.filter(Boolean);
};

export const buildBudgetItemGroupKey = (product = {}, item = {}) => {
  const fields = getProductPresentationFields(product, item);
  const width = firstValue(item.input_width, item.inputWidth, item.largura, item.width, '');
  const height = firstValue(item.input_height, item.inputHeight, item.altura, item.height, '');
  const total = Number(firstValue(item.valor_total, item.subtotal, 0));
  const cor = item.cor || item.color || '';
  const customizacao = item.customizacao && typeof item.customizacao === 'object'
    ? JSON.stringify(item.customizacao)
    : '';

  return JSON.stringify({
    productId: item.produto_id || '',
    name: fields.name,
    model: fields.model || '',
    fabric: fields.fabric || '',
    code: fields.code || '',
    cor,
    environment: item.ambiente || '',
    width,
    height,
    panel: Boolean(item.painel),
    sheets: Number(item.num_folhas) || 0,
    band: Boolean(item.bando),
    installation: Boolean(item.instalacao),
    railType: item.trilho_tipo || '',
    customizacao,
    total
  });
};
