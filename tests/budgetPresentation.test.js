import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBudgetItemGroupKey,
  buildCustomerPdfDescription,
  buildBudgetItemDescriptionParts,
  groupBudgetProducts,
  groupBudgetAccessories
} from '../src/utils/budgetPresentation.js';

const product = {
  id: 'product-1',
  nome: 'Screen Solflex T1000 1% Tubo 38',
  modelo: 'Tubo 38',
  tecido: 'Screen',
  codigo: '206-38'
};

test('customer PDF and budget description includes product measurements and options', () => {
  const item = {
    produto_id: 'product-1',
    input_width: 1.03,
    input_height: 1.65,
    ambiente: 'Sacada',
    instalacao: true
  };

  const description = buildCustomerPdfDescription(product, item);

  assert.match(description, /1\.03m x 1\.65m/);
  assert.match(description, /INSTALADO/);
  assert.match(description, /Screen Solflex T1000 1% Tubo 38/);
});

test('groupBudgetProducts groups identical items with same measurements and calculates real unit price', () => {
  const items = [
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 927.60
    },
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 684.60
    },
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 633.12
    }
  ];

  const getProductDetails = () => product;
  const grouped = groupBudgetProducts(items, getProductDetails);

  assert.equal(grouped.length, 1, 'Should group identical items into 1 row');
  assert.equal(grouped[0].quantity, 3);
  assert.equal(grouped[0].totalPrice, 2245.32);

  // Unit price must be real: totalPrice / quantity
  const expectedUnitPrice = 2245.32 / 3;
  assert.equal(grouped[0].unitPrice, expectedUnitPrice);
  assert.equal(Math.round(grouped[0].unitPrice * grouped[0].quantity * 100) / 100, 2245.32);

  // Description must include the measurements
  assert.match(grouped[0].description, /1\.03m x 1\.65m/);
  assert.equal(grouped[0].environment, 'Sacada');
});

test('groupBudgetProducts separates items with different measurements', () => {
  const items = [
    {
      produto_id: 'product-1',
      input_width: 0.60,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 510.00
    },
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 927.60
    },
    {
      produto_id: 'product-1',
      input_width: 1.17,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 557.88
    }
  ];

  const getProductDetails = () => product;
  const grouped = groupBudgetProducts(items, getProductDetails);

  assert.equal(grouped.length, 3, 'Different measurements must not be grouped together');
  assert.equal(grouped[0].quantity, 1);
  assert.equal(grouped[0].unitPrice, 510.00);
  assert.match(grouped[0].description, /0\.60m x 1\.65m/);

  assert.equal(grouped[1].quantity, 1);
  assert.equal(grouped[1].unitPrice, 927.60);
  assert.match(grouped[1].description, /1\.03m x 1\.65m/);

  assert.equal(grouped[2].quantity, 1);
  assert.equal(grouped[2].unitPrice, 557.88);
  assert.match(grouped[2].description, /1\.17m x 1\.65m/);
});

test('groupBudgetProducts separates items with different environments', () => {
  const items = [
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Sacada',
      instalacao: true,
      subtotal: 927.60
    },
    {
      produto_id: 'product-1',
      input_width: 1.03,
      input_height: 1.65,
      ambiente: 'Quarto',
      instalacao: true,
      subtotal: 927.60
    }
  ];

  const getProductDetails = () => product;
  const grouped = groupBudgetProducts(items, getProductDetails);

  assert.equal(grouped.length, 2, 'Different environments must not be grouped');
});

test('groupBudgetAccessories groups identical accessories and calculates unit price', () => {
  const accessories = [
    {
      accessory_id: 'acc-1',
      color: 'Branco',
      quantity: 2,
      subtotal: 100
    },
    {
      accessory_id: 'acc-1',
      color: 'Branco',
      quantity: 3,
      subtotal: 150
    }
  ];

  const getAccessoryName = () => 'Suporte Lateral';
  const grouped = groupBudgetAccessories(accessories, getAccessoryName);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].quantity, 5);
  assert.equal(grouped[0].totalPrice, 250);
  assert.equal(grouped[0].unitPrice, 50);
  assert.equal(grouped[0].unitPrice * grouped[0].quantity, 250);
});
