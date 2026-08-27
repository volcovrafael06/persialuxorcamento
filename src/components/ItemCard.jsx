/**
 * ItemCard.jsx
 *
 * Card compacto para exibir e editar/remover itens do orçamento no chat.
 * Exibido inline na conversa quando o bot adiciona um produto.
 * Suporta modo de edicao inline com campos para largura, altura e quantidade.
 *
 * @param {Object} props
 * @param {Object} props.item - Item do orçamento {id, tipo, produto, selection, quantity, subtotal, ...}
 * @param {Function} props.onEdit - Callback para salvar edicao: (itemId, updates) => void
 * @param {Function} props.onDelete - Callback para remover: (itemId) => void
 * @param {boolean} props.isEditing - Se o card esta em modo de edicao
 */

import React, { useState, useEffect, useRef } from 'react';

function fmt(value) {
  return (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function ItemCard({ item, onEdit, onDelete, isEditing = false }) {
  const isAccessory = item.tipo === 'acessorio';

  // Estado local para campos de edicao
  const [editValues, setEditValues] = useState({
    largura: 0,
    altura: 0,
    quantidade: 1
  });

  // Estado para confirmacao de exclusao
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Inicializa valores de edicao quando entra em modo de edicao
  useEffect(() => {
    if (isEditing) {
      if (isAccessory) {
        setEditValues({
          largura: 0,
          altura: 0,
          quantidade: item.quantity || 1
        });
      } else {
        setEditValues({
          largura: item.selection?.largura || 0,
          altura: item.selection?.altura || 0,
          quantidade: item.selection?.quantidade || 1
        });
      }
    }
    setShowDeleteConfirm(false);
  }, [isEditing, isAccessory, item]);

  // Atualiza valores de edicao
  const handleFieldChange = (field, value) => {
    const numValue = parseFloat(value) || 0;
    setEditValues(prev => ({ ...prev, [field]: numValue }));
  };

  // Salva as alteracoes
  const handleSave = () => {
    if (onEdit) {
      const updates = isAccessory
        ? { quantity: editValues.quantidade }
        : {
            largura: editValues.largura,
            altura: editValues.altura,
            quantidade: editValues.quantidade
          };
      onEdit(item.id, updates);
    }
  };

  // Cancela a edicao
  const handleCancel = () => {
    setShowDeleteConfirm(false);
    // Chama onEdit com null ou undefined para cancelar
    if (onEdit) {
      onEdit(item.id, null);
    }
  };

  // Confirma exclusao
  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete(item.id);
    }
    setShowDeleteConfirm(false);
  };

  // Estilos do card
  const cardStyle = {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    transition: 'all 0.2s ease',
  };

  const badgeStyle = {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  };

  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: 2,
    textTransform: 'uppercase',
  };

  // Modo de edicao
  if (isEditing) {
    return (
      <div style={{
        ...cardStyle,
        background: '#fef9c3',
        borderColor: '#ca8a04',
      }}>
        {/* Badge e nome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            ...badgeStyle,
            background: isAccessory ? '#dbeafe' : '#dcfce7',
            color: isAccessory ? '#1e40af' : '#15803d',
          }}>
            {isAccessory ? 'ACC' : 'PROD'}
          </span>
          <span style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
            {item.produto?.nome || item.nome}
          </span>
          <span style={{
            fontSize: 10,
            background: '#fef9c3',
            color: '#854d0e',
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 600,
          }}>
            EDITANDO
          </span>
        </div>

        {/* Campos de edicao inline */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isAccessory ? '1fr' : 'repeat(3, 1fr)',
          gap: 8,
          marginBottom: 12,
        }}>
          {!isAccessory && (
            <>
              <div>
                <label style={labelStyle}>Largura (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editValues.largura}
                  onChange={(e) => handleFieldChange('largura', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Altura (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editValues.altura}
                  onChange={(e) => handleFieldChange('altura', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </>
          )}
          <div>
            <label style={labelStyle}>{isAccessory ? 'Quantidade' : 'Qtd'}</label>
            <input
              type="number"
              step="1"
              min="1"
              value={editValues.quantidade}
              onChange={(e) => handleFieldChange('quantidade', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Botoes de acao */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '6px 12px',
              background: 'white',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 12px',
              background: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    );
  }

  // Modo de exibicao normal
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {/* Badge de tipo e nome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              ...badgeStyle,
              background: isAccessory ? '#dbeafe' : '#dcfce7',
              color: isAccessory ? '#1e40af' : '#15803d',
            }}>
              {isAccessory ? 'ACC' : 'PROD'}
            </span>
            <span style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>
              {item.produto?.nome || item.nome}
            </span>
          </div>

          {/* Detalhes do item */}
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {isAccessory ? (
              <>
                <span>Qtd: {item.quantity || item.quantidade} {item.unit || 'un'}</span>
                {item.color && <span> · Cor: {item.color}</span>}
              </>
            ) : (
              <>
                <span>{item.selection?.largura || item.largura}m x {item.selection?.altura || item.altura}m</span>
                <span> · Qtd: {item.selection?.quantidade || item.quantidade}</span>
              </>
            )}
          </div>
        </div>

        {/* Preco e acoes */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>
            R$ {fmt(item.subtotal)}
          </div>

          {/* Confirmacao de exclusao */}
          {showDeleteConfirm ? (
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#6b7280', marginRight: 8 }}>
                Remover?
              </span>
              <button
                onClick={handleConfirmDelete}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Sim
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                  marginLeft: 4,
                }}
              >
                Nao
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => onEdit?.(item.id)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#fef3c7',
                  color: '#92400e',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Editar
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  background: '#fee2e2',
                  color: '#991b1b',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Remover
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ItemCard;
