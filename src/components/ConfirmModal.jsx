// src/components/ConfirmModal.jsx
// Modal de confirmação genérico (substitui window.confirm que não funciona bem
// em alguns browsers / iframes).

import React from 'react';

export default function ConfirmModal({
  open,
  titulo = 'Confirmar',
  mensagem,
  onConfirmar,
  onCancelar,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  cor = '#2563eb',
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 440,
          boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{titulo}</h3>
        <p style={{ margin: '0 0 16px', color: '#374151', fontSize: 14, whiteSpace: 'pre-line' }}>
          {mensagem}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancelar}
            style={{
              padding: '8px 16px',
              background: 'white', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 6,
              cursor: 'pointer', fontSize: 14,
            }}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            autoFocus
            style={{
              padding: '8px 16px',
              background: cor, color: 'white',
              border: 'none', borderRadius: 6,
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
