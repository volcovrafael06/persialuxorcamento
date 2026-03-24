import React, { useState, useEffect } from 'react';
import { produtoService } from '../services/produtoService';

function ProductSelector({ onSelect }) {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await produtoService.getAll();
      setProducts(data || []); // Ensure data is an array, even if null
    } catch (err) {
      setError('Erro ao carregar produtos: ' + err.message);
      setProducts([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    // Safely handle potential undefined or null values
    const name = (product.name || '').toLowerCase();
    const code = (product.codigo || '').toLowerCase();
    const searchTermLower = (searchTerm || '').toLowerCase();

    return name.includes(searchTermLower) || 
           code.includes(searchTermLower);
  });

  const handleProductChange = (event) => {
    const selectedProductId = event.target.value;
    const selectedProduct = products.find(product => product.id === parseInt(selectedProductId, 10));

    if (selectedProduct) {
      onSelect({
        id: selectedProduct.id,
        name: selectedProduct.name,
        code: selectedProduct.codigo,
        price: selectedProduct.preco_venda,
        calculationMethod: selectedProduct.metodo_calculo,
        product: selectedProduct.produto,
        model: selectedProduct.modelo,
        material: selectedProduct.tecido
      });
    }
  };

  if (loading) return <div>Carregando produtos...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <div className="product-selector">
      <input
        type="text"
        placeholder="Pesquisar produtos..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="product-search"
      />
      <select
        className="product-dropdown"
        onChange={handleProductChange}
        defaultValue=""
      >
        <option value="" disabled>Selecione um produto</option>
        {filteredProducts.map(product => (
          <option key={product.id} value={product.id}>
            {product.name} - {product.codigo} - R$ {product.preco_venda}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ProductSelector;
