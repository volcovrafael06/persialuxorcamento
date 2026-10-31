const firstValue = (...values) => values.find(value => value !== null && value !== undefined && value !== '');

export const parseDimension = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  return isNaN(num) || num <= 0 ? null : num;
};

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

export const buildBudgetItemDescriptionParts = (product = {}, item = {}) => {
  const fields = getProductPresentationFields(product, item);
  const baseParts = [];

  if (fields.name) baseParts.push(fields.name);

  if (item.painel && Number(item.num_folhas) > 0) {
    baseParts.push('PAINEL');
  } else if (fields.model) {
    baseParts.push(fields.model);
  }

  if (fields.fabric) baseParts.push(fields.fabric);
  if (fields.code) baseParts.push(fields.code);

  const line1 = baseParts.length > 0
    ? baseParts.join(' - ')
    : (item.produto_id ? `Produto #${item.produto_id}` : 'Produto sem nome');

  const widthVal = firstValue(item.input_width, item.inputWidth, item.largura, item.width);
  const heightVal = firstValue(item.input_height, item.inputHeight, item.altura, item.height);
  const parsedW = parseDimension(widthVal);
  const parsedH = parseDimension(heightVal);
  const dimensions = (parsedW != null && parsedH != null)
    ? `${parsedW.toFixed(2)}m x ${parsedH.toFixed(2)}m`
    : '';

  const line2Parts = [];
  if (dimensions) line2Parts.push(dimensions);
  if (item.bando) line2Parts.push('COM BANDO');
  line2Parts.push(item.instalacao ? 'INSTALADO' : 'SEM INSTALAÇÃO');
  const line2 = line2Parts.join(' - ');

  let extraLine = null;
  const numFolhas = Number(item.num_folhas);
  if (item.painel && numFolhas > 1 && parsedW != null && parsedH != null) {
    const sheetWidth = ((parsedW * 1.1) / numFolhas).toFixed(2);
    const sheetHeight = parsedH.toFixed(2);
    extraLine = `Cada folha: ${sheetWidth}m x ${sheetHeight}m (${numFolhas} folhas)`;
  }

  const pdfText = [line1, line2, extraLine].filter(Boolean).join('\n');
  const fullText = [line1, line2, extraLine].filter(Boolean).join(' | ');

  // Group key uniquely identifies identical configurations to safely group them:
  // Same product identity, environment, measurements, panel, bando, installation, rail
  const key = JSON.stringify({
    productId: item.produto_id || '',
    name: fields.name,
    model: fields.model || '',
    fabric: fields.fabric || '',
    code: fields.code || '',
    environment: item.ambiente || '',
    width: parsedW != null ? parsedW.toFixed(2) : '',
    height: parsedH != null ? parsedH.toFixed(2) : '',
    panel: Boolean(item.painel),
    sheets: numFolhas || 0,
    band: Boolean(item.bando),
    installation: Boolean(item.instalacao),
    railType: item.trilho_tipo || ''
  });

  return {
    line1,
    line2,
    extraLine,
    pdfText,
    fullText,
    key,
    dimensions,
    parsedW,
    parsedH
  };
};

export const buildCustomerPdfDescription = (product = {}, item = {}) => {
  const parts = buildBudgetItemDescriptionParts(product, item);
  return parts.fullText;
};

export const buildBudgetItemGroupKey = (product = {}, item = {}) => {
  const parts = buildBudgetItemDescriptionParts(product, item);
  return parts.key;
};

export const groupBudgetProducts = (items = [], getProductDetails = () => ({})) => {
  const grouped = {};

  items.forEach(item => {
    const productDetails = getProductDetails(item.produto_id);
    const parts = buildBudgetItemDescriptionParts(productDetails, item);
    const groupKey = parts.key;
    const subtotal = Number(firstValue(item.valor_total, item.subtotal, 0));

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        key: groupKey,
        parts,
        description: parts.pdfText,
        environment: item.ambiente || '-',
        quantity: 1,
        totalPrice: subtotal,
        details: item,
        rawItems: [item]
      };
    } else {
      grouped[groupKey].quantity += 1;
      grouped[groupKey].totalPrice += subtotal;
      grouped[groupKey].rawItems.push(item);
    }
  });

  return Object.values(grouped).map(group => ({
    ...group,
    unitPrice: group.quantity > 0 ? (group.totalPrice / group.quantity) : 0
  }));
};

export const groupBudgetAccessories = (accessories = [], getAccessoryName = id => `Acessório #${id}`) => {
  const grouped = {};

  accessories.forEach(item => {
    const accessoryName = getAccessoryName(item.accessory_id);
    const colorSuffix = item.color ? ` - Cor: ${item.color}` : '';
    const desc = `${accessoryName}${colorSuffix}`;
    const key = `${item.accessory_id}_${item.color || ''}`;
    const qty = Number(item.quantity) || 1;
    const subtotal = Number(firstValue(item.valor_total, item.subtotal, 0));

    if (!grouped[key]) {
      grouped[key] = {
        key,
        description: desc,
        environment: '-',
        quantity: qty,
        totalPrice: subtotal
      };
    } else {
      grouped[key].quantity += qty;
      grouped[key].totalPrice += subtotal;
    }
  });

  return Object.values(grouped).map(group => ({
    ...group,
    unitPrice: group.quantity > 0 ? (group.totalPrice / group.quantity) : 0
  }));
};
