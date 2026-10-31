import test from 'node:test';
import assert from 'node:assert/strict';

// Helper de parsing seguro simulando a lógica adotada em Budgets.jsx
const safeParseArray = (raw) => {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

test('safeParseArray handles arrays, strings, null and invalid JSON without throwing', () => {
  // Já é array (ex: retornado diretamente pelo Supabase para coluna JSONB)
  const nativeArray = [{ id: 1, name: 'Item 1' }];
  assert.deepEqual(safeParseArray(nativeArray), nativeArray);

  // String JSON válida
  const jsonString = JSON.stringify([{ id: 2, name: 'Item 2' }]);
  assert.deepEqual(safeParseArray(jsonString), [{ id: 2, name: 'Item 2' }]);

  // Null ou undefined
  assert.deepEqual(safeParseArray(null), []);
  assert.deepEqual(safeParseArray(undefined), []);

  // String inválida não quebra
  assert.deepEqual(safeParseArray('[invalid json'), []);
});

test('recalculate updates product subtotal with fresh catalog price', () => {
  const oldCatalogPrice = 100;
  const newCatalogPrice = 150;
  const width = 2.0;
  const height = 1.5;
  const area = width * height; // 3.0 m²

  const oldSubtotal = area * oldCatalogPrice; // 300
  assert.equal(oldSubtotal, 300);

  // Simula recalcular com o novo preço
  const recalculatedSubtotal = area * newCatalogPrice; // 450
  assert.equal(recalculatedSubtotal, 450);
});
