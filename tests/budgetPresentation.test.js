import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBudgetItemGroupKey,
  buildCustomerPdfDescription
} from '../src/utils/budgetPresentation.js';

const product = {
  id: 'product-1',
  nome: 'Persiana',
  modelo: 'Wave',
  tecido: 'Linho',
  codigo: 'P-01'
};

test('customer PDF description never includes product measurements', () => {
  const item = {
    produto_id: 'product-1',
    input_width: 1.2,
    input_height: 1.8,
    largura: 1.5,
    altura: 2,
    painel: true,
    num_folhas: 2,
    bando: true,
    instalacao: true
  };

  const description = buildCustomerPdfDescription(product, item);

  assert.equal(description, 'Persiana - PAINEL - Linho - P-01 | 2 FOLHAS - COM BANDO - INSTALADO');
  assert.doesNotMatch(description, /1[.,]20|1[.,]80|m²|cada folha|largura|altura/i);
});

test('group key keeps dimensions hidden from the customer description', () => {
  const baseItem = {
    produto_id: 'product-1',
    ambiente: 'Sala',
    input_width: 1.2,
    input_height: 1.8,
    subtotal: 500
  };

  const otherSize = { ...baseItem, input_width: 1.5, subtotal: 600 };

  assert.equal(
    buildCustomerPdfDescription(product, baseItem),
    buildCustomerPdfDescription(product, otherSize)
  );
  assert.notEqual(
    buildBudgetItemGroupKey(product, baseItem),
    buildBudgetItemGroupKey(product, otherSize)
  );
});
