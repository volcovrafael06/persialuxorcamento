import React, { useState, useEffect } from 'react';
import './SelectOrCreate.css';

function SelectOrCreate({ options, value, labelKey, valueKey, onChange, onCreate, id, name, showCreate = true }) {
  const [selectedValue, setSelectedValue] = useState('');
  const [newOption, setNewOption] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    if (value) {
      setSelectedValue(value[valueKey] || '');
    } else {
      setSelectedValue('');
    }
  }, [value, valueKey]);

  const handleChange = (e) => {
    const val = e.target.value;
    setSelectedValue(val);
    const selectedOption = options.find(option => option[valueKey] === val);
    onChange(selectedOption || null);
  };

  const handleCreateToggle = () => {
    setCreatingNew(!creatingNew);
    setSelectedValue('');
    setNewOption('');
  };

  const handleCreate = async () => {
    if (newOption.trim() === '') return;
    const createdOption = await onCreate(newOption);
    if (createdOption) {
      setSelectedValue(createdOption[valueKey]);
      onChange(createdOption);
      setCreatingNew(false);
    }
  };

  const formatOptionLabel = (option) => {
    if (option.modelo) { // If it's a product
      const preco = parseFloat(option.preco_venda) || 0;
      return `${option.nome} - ${option.modelo} - ${option.tecido} - ${option.codigo} - R$ ${preco.toFixed(2)}`;
    }
    return option[labelKey];
  };

  return (
    <div className="select-or-create">
      {!creatingNew ? (
        <>
          <select 
            id={id} 
            name={name} 
            value={selectedValue} 
            onChange={handleChange}
            className="select-input"
          >
            <option value="">Selecione</option>
            {options.map((option) => (
              <option key={option[valueKey]} value={option[valueKey]}>
                {formatOptionLabel(option)}
              </option>
            ))}
          </select>
          {showCreate && (
            <button type="button" onClick={handleCreateToggle} className="create-button">
              Criar Novo
            </button>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            placeholder="Digite o nome..."
            className="create-input"
          />
          <div className="button-group">
            <button type="button" onClick={handleCreate} className="save-button">
              Salvar
            </button>
            <button type="button" onClick={handleCreateToggle} className="cancel-button">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default SelectOrCreate;
