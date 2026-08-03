import React from 'react';
import ProductSelectorCascata from '../components/ProductSelectorCascata';

function ProductSelectorCascataTest() {
  const handleSelect = (data) => {
    console.log('ProductSelectorCascata emitiu:', data);
  };

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <h1>Teste do ProductSelectorCascata</h1>
      <p>Esta página existe apenas para validar o redesign.</p>
      <ProductSelectorCascata onSelect={handleSelect} />
    </div>
  );
}

export default ProductSelectorCascataTest;
