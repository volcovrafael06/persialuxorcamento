import React, { useState, useEffect } from 'react';
import { produtoService } from '../services/produtoService';
import { supabase } from '../supabase/client';
import './Products.css';

function Products() {
  const initialProductState = {
    product: '',
    model: '',
    material: '',
    name: '',
    code: '',
    cost_price: '',
    profit_margin: '',
    sale_price: '',
    calculation_method: 'manual',
    altura_minima: '',
    largura_minima: '',
    largura_maxima: '',
    area_minima: '',
  };

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [materialOptions, setMaterialOptions] = useState([]);
  const [newProduct, setNewProduct] = useState(initialProductState);
  const [editingProductId, setEditingProductId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [wavePricing, setWavePricing] = useState({
    wave_pricing: [
      { min_height: 0, max_height: 2.5, price: '', sale_price: '' },
      { min_height: 2.501, max_height: 4, price: '', sale_price: '' },
      { min_height: 4.001, max_height: 5, price: '', sale_price: '' },
      { min_height: 5.001, max_height: 6, price: '', sale_price: '' }
    ]
  });

  // Filter products based on search term
  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    return (
      product.product?.toLowerCase().includes(searchLower) ||
      product.model?.toLowerCase().includes(searchLower) ||
      product.material?.toLowerCase().includes(searchLower) ||
      product.name?.toLowerCase().includes(searchLower) ||
      product.code?.toLowerCase().includes(searchLower) ||
      product.calculation_method?.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadOptions();
    updateScreenPremiumAreaMinima(); // Add this line to execute when products are loaded
  }, [products]);

  const loadOptions = () => {
    const loadedProductOptions = new Set(JSON.parse(localStorage.getItem('productOptions')) || []);
    const loadedModelOptions = new Set(JSON.parse(localStorage.getItem('modelOptions')) || []);
    const loadedMaterialOptions = new Set(JSON.parse(localStorage.getItem('materialOptions')) || []);

    // Add options from existing products
    products.forEach(product => {
      if (product.product) loadedProductOptions.add(product.product);
      if (product.model) loadedModelOptions.add(product.model);
      if (product.material) loadedMaterialOptions.add(product.material);
    });

    setProductOptions([...loadedProductOptions].sort());
    setModelOptions([...loadedModelOptions].sort());
    setMaterialOptions([...loadedMaterialOptions].sort());
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await produtoService.getAll();
      const formattedData = data.map(item => ({
        id: item.id,
        product: item.produto,
        model: item.modelo,
        material: item.tecido,
        name: item.nome,
        code: item.codigo,
        cost_price: item.preco_custo?.toString() || '0',
        profit_margin: item.margem_lucro?.toString() || '0',
        sale_price: item.preco_venda?.toString() || '0',
        calculation_method: item.metodo_calculo,
        altura_minima: item.altura_minima || '',
        largura_minima: item.largura_minima || '',
        largura_maxima: item.largura_maxima || '',
        area_minima: item.area_minima || '',
        wave_pricing: item.wave_pricing_data ? JSON.parse(item.wave_pricing_data) : initialProductState.wave_pricing
      }));
      setProducts(formattedData);
    } catch (err) {
      setError('Erro ao carregar produtos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateSalePrice = (costPrice, profitMargin) => {
    if (newProduct.model.toUpperCase() === 'WAVE') {
      const basePrice = getWavePrice(parseFloat(newProduct.altura_minima) || 0);
      const margin = parseFloat(profitMargin) || 0;
      const profitAmount = (basePrice * margin) / 100;
      return basePrice + profitAmount;
    }
    const cost = parseFloat(costPrice) || 0;
    const margin = parseFloat(profitMargin) || 0;
    return cost + (cost * (margin / 100));
  };

  const getWavePrice = (height) => {
    const pricing = wavePricing.wave_pricing;
    for (const tier of pricing) {
      if (height >= tier.min_height && height <= tier.max_height) {
        return tier.price;
      }
    }
    return 0;
  };

  const calculateWaveSalePrice = (price) => {
    const margin = parseFloat(newProduct.profit_margin) || 0;
    const profitAmount = (price * margin) / 100;
    return (price + profitAmount).toFixed(2);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleWavePriceChange = (index, value) => {
    setWavePricing(prev => {
      const updatedPricing = [...prev.wave_pricing];
      updatedPricing[index] = {
        ...updatedPricing[index],
        price: value,
        sale_price: calculateWaveSalePrice(parseFloat(value) || 0)
      };
      return {
        ...prev,
        wave_pricing: updatedPricing
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validate required fields
      if (!newProduct.product || !newProduct.model || !newProduct.material) {
        setError('Produto, Modelo e Tecido são campos obrigatórios');
        return;
      }

      // Special handling for Wave model
      if (newProduct.model.toUpperCase() === 'WAVE') {
        // Validate Wave pricing
        const isWavePricingValid = wavePricing.wave_pricing.every(tier => 
          tier.price && !isNaN(parseFloat(tier.price)) && parseFloat(tier.price) > 0
        );
        
        if (!isWavePricingValid) {
          setError('Por favor, preencha todos os preços de custo para o modelo Wave');
          return;
        }

        newProduct.calculation_method = 'altura';
        // Update sale prices before saving
        newProduct.wave_pricing = wavePricing.wave_pricing.map(tier => ({
          ...tier,
          sale_price: calculateWaveSalePrice(parseFloat(tier.price))
        }));
      }

      // Validate numeric fields
      const numericFields = {
        'Margem de Lucro': newProduct.profit_margin
      };

      // Only validate cost_price if not Wave model
      if (newProduct.model.toUpperCase() !== 'WAVE') {
        numericFields['Preço de Custo'] = newProduct.cost_price;
      }

      for (const [fieldName, value] of Object.entries(numericFields)) {
        if (value === '' || isNaN(value)) {
          setError(`${fieldName} deve ser um número válido`);
          return;
        }
      }

      const productData = {
        ...newProduct,
        sale_price: calculateSalePrice(newProduct.cost_price, newProduct.profit_margin)
      };

      if (editingProductId) {
        await produtoService.update(editingProductId, productData);
      } else {
        await produtoService.create(productData);
      }

      loadProducts();
      setNewProduct(initialProductState);
      setEditingProductId(null);
      setShowModal(false);
      setError(null);
    } catch (err) {
      console.error('Error saving product:', err);
      setError('Erro ao salvar produto: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const handleAddOption = (optionType) => {
    const newOption = prompt(`Digite novo ${optionType}:`);
    if (!newOption) return;

    const formattedOption = newOption.trim().toUpperCase();

    switch (optionType) {
      case 'produto':
        setProductOptions(prev => {
          const updated = [...prev, formattedOption];
          localStorage.setItem('productOptions', JSON.stringify(updated));
          return updated;
        });
        setNewProduct(prev => ({ ...prev, product: formattedOption }));
        break;
      case 'modelo':
        setModelOptions(prev => {
          const updated = [...prev, formattedOption];
          localStorage.setItem('modelOptions', JSON.stringify(updated));
          return updated;
        });
        setNewProduct(prev => ({ ...prev, model: formattedOption }));
        break;
      case 'tecido':
        setMaterialOptions(prev => {
          const updated = [...prev, formattedOption];
          localStorage.setItem('materialOptions', JSON.stringify(updated));
          return updated;
        });
        setNewProduct(prev => ({ ...prev, material: formattedOption }));
        break;
    }
  };

  const handleAddFabric = () => {
    const newFabric = prompt('Digite novo tecido:');
    if (!newFabric) return;

    const formattedFabric = newFabric.trim().toUpperCase();

    setMaterialOptions(prev => {
      const updated = [...prev, formattedFabric];
      localStorage.setItem('materialOptions', JSON.stringify(updated));
      return updated;
    });
    setNewProduct(prev => ({ ...prev, material: formattedFabric }));
  };

  const handleEditProduct = (product) => {
    setNewProduct(product);
    setEditingProductId(product.id);
    
    // Update wavePricing state if it's a Wave model
    if (product.model.toUpperCase() === 'WAVE' && product.wave_pricing) {
      setWavePricing({
        wave_pricing: product.wave_pricing
      });
    }
    
    setShowModal(true);
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Confirma a exclusão deste produto?')) {
      try {
        await produtoService.delete(id);
        loadProducts();
      } catch (error) {
        setError('Erro ao excluir produto: ' + error.message);
      }
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingProductId(null);
    setNewProduct(initialProductState);
  };

  const updateScreenPremiumAreaMinima = async () => {
    try {
      // Find the SCREEN 0,5 PREMIUM product and PARIS BK product
      const specialMinAreaProducts = products.filter(
        product => product.nome === 'SCREEN 0,5 PREMIUM' || 
                  product.nome === 'SCREEN 0.5 PREMIUM' ||
                  product.nome === 'PARIS BK'
      );
      
      // Process each product that needs a minimum area of 1.5m²
      specialMinAreaProducts.forEach(product => {
        const targetMinArea = 1.5;
        const needsUpdate = 
          product.area_minima !== targetMinArea ||
          Math.abs(parseFloat(product.largura_minima) * parseFloat(product.altura_minima) - targetMinArea) > 0.01;
          
        if (needsUpdate) {
          console.log(`Updating ${product.nome} minimum values:`);
          console.log('- area_minima from', product.area_minima, 'to', targetMinArea);
          
          // Calculate square dimensions for the minimum area (1.5m²)
          const minDimension = Math.sqrt(targetMinArea);
          console.log('- largura_minima from', product.largura_minima, 'to', minDimension.toFixed(2));
          console.log('- altura_minima from', product.altura_minima, 'to', minDimension.toFixed(2));
          
          // Update the product with the new minimum values
          const updatedProduct = {
            ...product,
            area_minima: targetMinArea,
            largura_minima: minDimension,
            altura_minima: minDimension
          };
          
          // Convert to the format expected by the update function
          const formattedProduct = {
            product: updatedProduct.produto,
            model: updatedProduct.modelo,
            material: updatedProduct.tecido,
            name: updatedProduct.nome,
            code: updatedProduct.codigo,
            cost_price: updatedProduct.preco_custo,
            profit_margin: updatedProduct.margem_lucro,
            sale_price: updatedProduct.preco_venda,
            calculation_method: updatedProduct.metodo_calculo,
            altura_minima: minDimension,
            largura_minima: minDimension,
            largura_maxima: updatedProduct.largura_maxima,
            area_minima: targetMinArea
          };
          
          // Update the product in the database
          produtoService.update(product.id, formattedProduct);
          
          // Refresh the products list
          loadProducts();
        }
      });
    } catch (error) {
      console.error('Error updating SCREEN 0,5 PREMIUM and PARIS BK:', error);
    }
  };

  if (loading) return <div>Carregando...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <div className="products-container">
      <div className="products-header">
        <h2>Produtos Cadastrados</h2>
        <div className="header-actions">
          <div className="search-container">
            <input
              type="text"
              placeholder="Pesquisar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="add-product-button" onClick={() => setShowModal(true)}>
            + Novo Produto
          </button>
        </div>
      </div>

      <div className="products-list">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Modelo</th>
              <th>Tecido</th>
              <th>Nome</th>
              <th>Código</th>
              <th>Preço Custo</th>
              <th>Margem</th>
              <th>Preço Venda</th>
              <th>Cálculo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => (
              <tr key={product.id}>
                <td>{product.product}</td>
                <td>{product.model}</td>
                <td>{product.material}</td>
                <td>{product.name}</td>
                <td>{product.code}</td>
                <td>R$ {parseFloat(product.cost_price).toFixed(2)}</td>
                <td>{product.profit_margin}%</td>
                <td>R$ {parseFloat(product.sale_price).toFixed(2)}</td>
                <td>{product.calculation_method}</td>
                <td>
                  <button 
                    type="button"
                    onClick={() => handleEditProduct(product)} 
                    className="edit-button"
                  >
                    Editar
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDeleteProduct(product.id)} 
                    className="delete-button"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingProductId ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button className="close-button" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="product-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Produto:</label>
                  <div className="input-with-button">
                    <select
                      name="product"
                      value={newProduct.product}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Selecione um produto</option>
                      {productOptions.map((option, index) => (
                        <option key={index} value={option}>{option}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => handleAddOption('produto')}>
                      + Novo
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Modelo:</label>
                  <div className="input-with-button">
                    <select
                      name="model"
                      value={newProduct.model}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Selecione um modelo</option>
                      {modelOptions.map((option, index) => (
                        <option key={index} value={option}>{option}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => handleAddOption('modelo')}>
                      + Novo
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Tecido:</label>
                  <div className="input-with-button">
                    <select
                      name="material"
                      value={newProduct.material}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Selecione o tecido</option>
                      {materialOptions.map((option, index) => (
                        <option key={index} value={option}>{option}</option>
                      ))}
                    </select>
                    <button type="button" onClick={handleAddFabric}>
                      + Novo
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Nome:</label>
                  <input
                    type="text"
                    name="name"
                    value={newProduct.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Código:</label>
                  <input
                    type="text"
                    name="code"
                    value={newProduct.code}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Largura Mínima:</label>
                  <input
                    type="number"
                    name="largura_minima"
                    value={newProduct.largura_minima}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Altura Mínima:</label>
                  <input
                    type="number"
                    name="altura_minima"
                    value={newProduct.altura_minima}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Área Mínima:</label>
                  <input
                    type="number"
                    name="area_minima"
                    value={newProduct.area_minima}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Largura Máxima:</label>
                  <input
                    type="number"
                    name="largura_maxima"
                    value={newProduct.largura_maxima}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Método de Cálculo:</label>
                  <select
                    name="calculation_method"
                    value={newProduct.calculation_method}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="manual">Manual</option>
                    <option value="m2">Metro Quadrado (m²)</option>
                    <option value="altura">Altura</option>
                  </select>
                </div>

                {newProduct.model.toUpperCase() === 'WAVE' ? (
                  <>
                    <div className="form-group">
                      <label>Margem de Lucro (%):</label>
                      <input
                        type="number"
                        name="profit_margin"
                        value={newProduct.profit_margin}
                        onChange={handleInputChange}
                        step="0.01"
                        min="0"
                        required
                      />
                    </div>

                    <div className="wave-options">
                      <div className="form-group">
                        <label htmlFor="wave_pricing">Configuração de Preços Wave</label>
                        <div className="wave-price-row">
                          <div className="wave-price-group">
                            <label>Preço para altura até 2,5m:</label>
                            <div className="price-inputs">
                              <div className="input-group">
                                <label>Custo:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[0].price}
                                  onChange={(e) => handleWavePriceChange(0, e.target.value)}
                                  step="0.01"
                                  min="0"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label>Venda:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[0].sale_price}
                                  disabled
                                />
                              </div>
                            </div>
                          </div>

                          <div className="wave-price-group">
                            <label>Preço para altura de 2,501m a 4m:</label>
                            <div className="price-inputs">
                              <div className="input-group">
                                <label>Custo:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[1].price}
                                  onChange={(e) => handleWavePriceChange(1, e.target.value)}
                                  step="0.01"
                                  min="0"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label>Venda:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[1].sale_price}
                                  disabled
                                />
                              </div>
                            </div>
                          </div>

                          <div className="wave-price-group">
                            <label>Preço para altura de 4,001m a 5m:</label>
                            <div className="price-inputs">
                              <div className="input-group">
                                <label>Custo:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[2].price}
                                  onChange={(e) => handleWavePriceChange(2, e.target.value)}
                                  step="0.01"
                                  min="0"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label>Venda:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[2].sale_price}
                                  disabled
                                />
                              </div>
                            </div>
                          </div>

                          <div className="wave-price-group">
                            <label>Preço para altura de 5,001m a 6m:</label>
                            <div className="price-inputs">
                              <div className="input-group">
                                <label>Custo:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[3].price}
                                  onChange={(e) => handleWavePriceChange(3, e.target.value)}
                                  step="0.01"
                                  min="0"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label>Venda:</label>
                                <input
                                  type="number"
                                  value={wavePricing.wave_pricing[3].sale_price}
                                  disabled
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Preço de Custo:</label>
                      <input
                        type="number"
                        name="cost_price"
                        value={newProduct.cost_price}
                        onChange={handleInputChange}
                        required={newProduct.calculation_method === 'manual'}
                      />
                    </div>

                    <div className="form-group">
                      <label>Margem de Lucro (%):</label>
                      <input
                        type="number"
                        name="profit_margin"
                        value={newProduct.profit_margin}
                        onChange={handleInputChange}
                        step="0.01"
                        min="0"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Preço de Venda:</label>
                      <input
                        type="number"
                        name="sale_price"
                        value={newProduct.sale_price}
                        onChange={handleInputChange}
                        step="0.01"
                        min="0"
                        disabled
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-button">
                  {editingProductId ? 'Atualizar Produto' : 'Cadastrar Produto'}
                </button>
                <button type="button" className="cancel-button" onClick={handleCloseModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
