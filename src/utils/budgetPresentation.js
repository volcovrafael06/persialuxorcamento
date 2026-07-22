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

  if (fields.fabric) productParts.push(fields.fabric);
  if (fields.code) productParts.push(fields.code);

  const optionParts = [];
  if (item.painel && Number(item.num_folhas) > 1) {
    optionParts.push(`${Number(item.num_folhas)} FOLHAS`);
  }
  if (item.bando) optionParts.push('COM BANDO');
  optionParts.push(item.instalacao ? 'INSTALADO' : 'SEM INSTALAÇÃO');

  return [productParts.join(' - '), optionParts.join(' - ')]
    .filter(Boolean)
    .join(' | ');
};

export const buildBudgetItemGroupKey = (product = {}, item = {}) => {
  const fields = getProductPresentationFields(product, item);
  const width = firstValue(item.input_width, item.inputWidth, item.largura, item.width, '');
  const height = firstValue(item.input_height, item.inputHeight, item.altura, item.height, '');
  const total = Number(firstValue(item.valor_total, item.subtotal, 0));

  return JSON.stringify({
    productId: item.produto_id || '',
    name: fields.name,
    model: fields.model || '',
    fabric: fields.fabric || '',
    code: fields.code || '',
    environment: item.ambiente || '',
    width,
    height,
    panel: Boolean(item.painel),
    sheets: Number(item.num_folhas) || 0,
    band: Boolean(item.bando),
    installation: Boolean(item.instalacao),
    railType: item.trilho_tipo || '',
    total
  });
};
