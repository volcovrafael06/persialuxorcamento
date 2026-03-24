import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase/client';
import './Accessories.css';
import { v4 as uuidv4 } from 'uuid';
import debounce from 'lodash.debounce';

function Accessories() {
  const [accessories, setAccessories] = useState([]);
  const [newAccessory, setNewAccessory] = useState({
    name: '',
    unit: '',
    colors: []
  });
  const [newColor, setNewColor] = useState({
    color: '',
    cost_price: 0,
    profit_margin: 0,
    sale_price: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAccessoryId, setEditingAccessoryId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAccessories();
  }, []);

  const fetchAccessories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('accessories')
        .select('*')
        .order('name');

      if (error) {
        throw error;
      }

      console.log('Fetched accessories:', data);
      setAccessories(data || []);
    } catch (error) {
      console.error('Error fetching accessories:', error);
      setError('Erro ao carregar acessórios: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateSalePrice = (costPrice, profitMargin) => {
    const cost = parseFloat(costPrice) || 0;
    const margin = parseFloat(profitMargin) || 0;
    return cost + (cost * (margin / 100));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewAccessory(prev => ({ ...prev, [name]: value }));
  };

  const handleColorInputChange = (e) => {
    const { name, value } = e.target;
    setNewColor(prev => {
      const updates = { ...prev, [name]: value };

      if (name === 'cost_price' || name === 'profit_margin') {
        updates.sale_price = calculateSalePrice(
          name === 'cost_price' ? value : prev.cost_price,
          name === 'profit_margin' ? value : prev.profit_margin
        );
      }

      return updates;
    });
  };

  const handleAddColor = () => {
    if (!newColor.color.trim() || newColor.cost_price < 0) {
      setError('Cor inválida ou preço de custo negativo');
      return;
    }

    setNewAccessory(prev => ({
      ...prev,
      colors: [...prev.colors, { ...newColor }]
    }));

    setNewColor({
      color: '',
      cost_price: 0,
      profit_margin: 0,
      sale_price: 0
    });
    setError(null);
  };

  const handleDeleteColor = (indexToDelete) => {
    setNewAccessory(prev => ({
      ...prev,
      colors: prev.colors.filter((_, index) => index !== indexToDelete)
    }));
  };

  const validateAccessory = () => {
    if (!newAccessory.name.trim()) return 'Digite o nome do acessório';
    if (!newAccessory.unit.trim()) return 'Digite uma unidade';
    if (newAccessory.colors.length === 0) return 'Adicione pelo menos uma cor';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateAccessory();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const accessoryData = {
        name: newAccessory.name,
        unit: newAccessory.unit,
        colors: newAccessory.colors
      };

      if (editingAccessoryId) {
        const { data, error: updateError } = await supabase
          .from('accessories')
          .upsert([accessoryData], { onConflict: 'id' })
          .eq('id', editingAccessoryId);

        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('accessories')
          .upsert([accessoryData], { onConflict: 'id' })
          .select();

        if (insertError) throw insertError;
      }
      
      setNewAccessory({
        name: '',
        unit: '',
        colors: []
      });
      
      fetchAccessories();
      
    } catch (error) {
      console.error('Error updating accessory:', error);
      setError(`Erro ao ${editingAccessoryId ? 'atualizar' : 'adicionar'} acessório: ${error.message}`);
    } finally {
      setLoading(false);
      setShowModal(false);
      setEditingAccessoryId(null);
    }
  };

  const handleDeleteAccessory = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este acessório?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('accessories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAccessories(prev => prev.filter(acc => acc.id !== id));
    } catch (error) {
      setError('Erro ao excluir acessório: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAccessoryId(null);
    setNewAccessory({
      name: '',
      unit: '',
      colors: []
    });
    setNewColor({
      color: '',
      cost_price: 0,
      profit_margin: 0,
      sale_price: 0
    });
  };

  const handleEditAccessory = (accessory) => {
    setNewAccessory(accessory);
    setEditingAccessoryId(accessory.id);
    setShowModal(true);
  };

  // Filter accessories based on search term
  const filteredAccessories = accessories.filter(accessory => {
    const searchLower = searchTerm.toLowerCase();
    return (
      accessory.name?.toLowerCase().includes(searchLower) ||
      accessory.unit?.toLowerCase().includes(searchLower) ||
      accessory.colors.some(color => color.color.toLowerCase().includes(searchLower))
    );
  });

  if (loading) {
    return <div className="loading">Carregando...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="accessories-container">
      <div className="accessories-header">
        <h2>Acessórios Cadastrados</h2>
        <div className="header-actions">
          <div className="search-container">
            <input
              type="text"
              placeholder="Pesquisar acessórios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="add-accessory-button" onClick={() => setShowModal(true)}>
            + Novo Acessório
          </button>
        </div>
      </div>

      <div className="accessories-list">
        <table className="accessories-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Unidade</th>
              <th>Cores e Preços</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccessories.map(accessory => (
              <tr key={accessory.id}>
                <td>{accessory.name}</td>
                <td>{accessory.unit}</td>
                <td>
                  <table className="nested-colors-table">
                    <thead>
                      <tr>
                        <th>Cor</th>
                        <th>Custo</th>
                        <th>Margem</th>
                        <th>Venda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accessory.colors?.map((color, index) => (
                        <tr key={index}>
                          <td>{color.color}</td>
                          <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(color.cost_price)}</td>
                          <td>{color.profit_margin}%</td>
                          <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(color.sale_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      type="button"
                      onClick={() => handleEditAccessory(accessory)} 
                      className="edit-button"
                    >
                      Editar
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeleteAccessory(accessory.id)} 
                      className="delete-button"
                    >
                      Excluir
                    </button>
                  </div>
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
              <h3>{editingAccessoryId ? 'Editar Acessório' : 'Novo Acessório'}</h3>
              <button className="close-button" onClick={handleCloseModal}>&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="accessories-form">
              <div className="form-group">
                <label htmlFor="accessoryName">Nome do Acessório:</label>
                <input
                  type="text"
                  id="accessoryName"
                  name="name"
                  value={newAccessory.name}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="unit">Unidade:</label>
                <input
                  type="text"
                  id="unit"
                  name="unit"
                  value={newAccessory.unit}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="colors-section">
                <h3>Cores e Preços</h3>
                <div className="color-form">
                  <div className="form-group">
                    <label>Cor:</label>
                    <input
                      type="text"
                      name="color"
                      value={newColor.color}
                      onChange={handleColorInputChange}
                      placeholder="Nome da cor"
                    />
                  </div>

                  <div className="form-group">
                    <label>Preço de Custo:</label>
                    <input
                      type="number"
                      step="0.01"
                      name="cost_price"
                      value={newColor.cost_price}
                      onChange={handleColorInputChange}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Margem de Lucro (%):</label>
                    <input
                      type="number"
                      step="0.01"
                      name="profit_margin"
                      value={newColor.profit_margin}
                      onChange={handleColorInputChange}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="form-group">
                    <label>Preço de Venda:</label>
                    <input
                      type="number"
                      step="0.01"
                      name="sale_price"
                      value={newColor.sale_price}
                      readOnly
                      placeholder="0.00"
                    />
                  </div>

                  <button type="button" onClick={handleAddColor} className="add-color-button">
                    Adicionar Cor
                  </button>
                </div>

                <div className="added-colors">
                  <h4>Cores Adicionadas:</h4>
                  <table className="colors-table">
                    <thead>
                      <tr>
                        <th>Cor</th>
                        <th>Preço Custo</th>
                        <th>Margem</th>
                        <th>Preço Venda</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newAccessory.colors.map((color, index) => (
                        <tr key={index}>
                          <td>{color.color}</td>
                          <td>R$ {parseFloat(color.cost_price).toFixed(2)}</td>
                          <td>{parseFloat(color.profit_margin).toFixed(2)}%</td>
                          <td>R$ {parseFloat(color.sale_price).toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleDeleteColor(index)}
                              className="delete-button"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-button">
                  {editingAccessoryId ? 'Salvar Alterações' : 'Adicionar Acessório'}
                </button>
                <button type="button" onClick={handleCloseModal} className="cancel-button">
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

export default Accessories;
