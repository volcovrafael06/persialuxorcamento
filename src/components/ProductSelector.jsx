import React, { useState, useEffect } from 'react';
import { produtoService } from '../services/produtoService';

function ProductSelector({ onSelect }) {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await produtoService.getAll();
      setProducts(data || []);
    } catch (err) {
      setError('Erro ao carregar produtos: ' + err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const name = (product.nome || '').toLowerCase();
    const code = (product.codigo || '').toLowerCase();
    const searchTermLower = (searchTerm || '').toLowerCase();
    return name.includes(searchTermLower) ||
           code.includes(searchTermLower);
  });

  const handleProductChange = (event) => {
    const selectedId = event.target.value;
    const product = products.find(p => p.id === selectedId);
    setSelectedProduct(product || null);
    setSelectedColor('');
    if (product) {
      onSelect({
        id: product.id,
        name: product.nome,
        code: product.codigo,
        price: product.preco_venda,
        calculationMethod: product.metodo_calculo,
        product: product.produto,
        model: product.modelo,
        material: product.tecido,
        availableColors: product.cores_disponiveis || [],
        color: null,
      });
    } else {
      onSelect(null);
    }
  };

  const handleColorChange = (event) => {
    const colorCode = event.target.value;
    setSelectedColor(colorCode);
    if (selectedProduct) {
      onSelect({
        id: selectedProduct.id,
        name: selectedProduct.nome,
        code: selectedProduct.codigo,
        price: selectedProduct.preco_venda,
        calculationMethod: selectedProduct.metodo_calculo,
        product: selectedProduct.produto,
        model: selectedProduct.modelo,
        material: selectedProduct.tecido,
        availableColors: selectedProduct.cores_disponiveis || [],
        color: colorCode || null,
      });
    }
  };

  if (loading) return <div>Carregando produtos...</div>;
  if (error) return <div>Erro: {error}</div>;

  const cores = selectedProduct?.cores_disponiveis || [];

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
            {product.nome} - {product.codigo} - R$ {product.preco_venda}
          </option>
        ))}
      </select>
      {selectedProduct && cores.length > 0 && (
        <select
          className="color-dropdown"
          onChange={handleColorChange}
          value={selectedColor}
        >
          <option value="">Selecione a cor (opcional)</option>
          {cores.map(c => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo} - {c.nome}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default ProductSelector;
