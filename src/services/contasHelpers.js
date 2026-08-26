// src/services/contasHelpers.js
// Constantes compartilhadas entre ContasPagar e ContasReceber.

export const FORMAS_PAGAMENTO_FIN = [
  { value: 'dinheiro',      label: 'Dinheiro' },
  { value: 'pix',           label: 'PIX' },
  { value: 'debito',        label: 'Débito' },
  { value: 'credito',       label: 'Crédito' },
  { value: 'boleto',        label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outros',        label: 'Outros' },
];
