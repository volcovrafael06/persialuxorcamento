/**
 * OrcamentoChat.jsx
 *
 * Componente de chat para criação de orçamentos com assistencia de IA.
 * Segue um fluxo conversacional onde o usuario interage com o bot para:
 * - Colher informacoes do cliente (nome, telefone, email, endereco)
 * - Adicionar produtos e acessorios ao orçamento
 * - Finalizar e salvar o orçamento
 *
 * Integracao com API:
 * - POST /api/chat - Chat principal com streaming de resposta
 * - POST /api/rag-search - Busca de produtos via RAG
 * - POST /api/save-orcamento - Salvamento final do orçamento
 *
 * Padroes herdados de OrcamentoV2.jsx
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/client';
import { clienteService } from '../services/clienteService';

// =============================================================================
// CONFIGURACOES E CONSTANTES
// =============================================================================

// URL base da API (definida como constante para facil manutencao)
const API_BASE_URL = 'https://saas-ads-rafa.comercial.ws/api';

/**
 * Mensagem inicial do bot quando o chat comeca
 * Guia o usuario sobre como usar o sistema
 */
const MENSAGEM_BOAS_VINDAS = `Olá! Sou seu assistente para criar orçamentos 😊

Posso te ajudar a:
• Coletar informações do cliente
• Buscar e adicionar produtos ao orçamento
• Finalizar e salvar o orçamento

Digite "iniciar orçamento" para começar ou me descreva o que precisa!`;

/**
 * Tool calls suportados pelo bot
 * Define as acoes que o bot pode executar durante a conversa
 */
const TOOL_DEFINITIONS = [
  {
    name: 'buscar_produto',
    description: 'Busca produtos no catalogo usando pesquisa semantica RAG',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de busca do produto (nome, categoria, tecido, etc)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'adicionar_produto',
    description: 'Adiciona um produto ao orçamento com suas dimensoes e quantidade',
    input_schema: {
      type: 'object',
      properties: {
        produto_id: { type: 'string', description: 'ID do produto' },
        nome: { type: 'string', description: 'Nome do produto' },
        largura: { type: 'number', description: 'Largura em metros' },
        altura: { type: 'number', description: 'Altura em metros' },
        quantidade: { type: 'number', description: 'Quantidade de peças' },
        preco_unitario: { type: 'number', description: 'Preço unitário' },
        metodo_calculo: { type: 'string', description: 'm2, ml, ou altura' }
      },
      required: ['produto_id', 'nome', 'largura', 'altura', 'quantidade']
    }
  },
  {
    name: 'adicionar_acessorio',
    description: 'Adiciona um acessório ao orçamento',
    input_schema: {
      type: 'object',
      properties: {
        acessorio_id: { type: 'string', description: 'ID do acessório' },
        nome: { type: 'string', description: 'Nome do acessório' },
        quantidade: { type: 'number', description: 'Quantidade' },
        preco_unitario: { type: 'number', description: 'Preço unitário' },
        unidade: { type: 'string', description: 'Unidade de medida (m, un, etc)' }
      },
      required: ['acessorio_id', 'nome', 'quantidade']
    }
  },
  {
    name: 'atualizar_cliente',
    description: 'Atualiza ou define as informações do cliente do orçamento',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo do cliente' },
        telefone: { type: 'string', description: 'Telefone com DDD' },
        email: { type: 'string', description: 'E-mail do cliente' },
        endereco: { type: 'string', description: 'Endereço completo' }
      },
      required: ['nome']
    }
  },
  {
    name: 'remover_item',
    description: 'Remove um item do orçamento pelo ID',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID do item a remover' }
      },
      required: ['item_id']
    }
  },
  {
    name: 'listar_itens',
    description: 'Lista todos os itens atuais do orçamento com totais',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'finalizar_orcamento',
    description: 'Finaliza o orçamento e salva no banco de dados',
    input_schema: { type: 'object', properties: {} }
  }
];

// =============================================================================
// UTILIDADES DE FORMATACAO
// =============================================================================

/**
 * Formata um valor monetario para exibicao em Real Brasileiro
 * @param {number} value - Valor a ser formatado
 * @returns {string} Valor formatado (ex: "1.234,56")
 */
function fmt(value) {
  return (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Calcula o subtotal de um produto baseado em suas dimensoes
 * Suporta metodos de calculo: m2 (area), ml (metro linear), altura
 *
 * @param {Object} produto - Produto com preco_venda e metodo_calculo
 * @param {number} largura - Largura em metros
 * @param {number} altura - Altura em metros
 * @param {number} quantidade - Quantidade de pecas
 * @returns {number} Subtotal calculado
 */
function calcSubtotal(produto, largura, altura, quantidade) {
  if (!produto || !largura || !altura) return 0;

  const l = parseFloat(largura);
  const a = parseFloat(altura);
  const q = parseInt(quantidade) || 1;
  const preco = parseFloat(produto.preco_venda) || 0;
  const metodo = (produto.metodo_calculo || 'm2').toLowerCase();
  const areaMinima = parseFloat(produto.area_minima) || 0;

  let base = 0;

  if (metodo === 'ml' || metodo === 'linear') {
    // Metro linear: largura x preco
    base = l * preco;
  } else if (metodo === 'altura') {
    // Por altura: altura x preco
    base = a * preco;
  } else {
    // Metro quadrado padrao: area com minimo
    const area = l * a;
    base = Math.max(area, areaMinima) * preco;
  }

  return base * q;
}

// =============================================================================
// COMPONENTE: MessageBubble
// Exibe uma bolha de mensagem no chat (usuario ou bot)
// =============================================================================

/**
 * Componente inline para renderizar bolhas de mensagem
 * Diferencia visualmente mensagens de usuario, bot e erros
 * Tambem renderiza cards de produtos encontrados
 *
 * @param {Object} props
 * @param {Object} props.message - Objeto da mensagem {role, content, items, timestamp, isError, toolResult}
 * @param {Function} props.onEditItem - Callback para editar item
 * @param {Function} props.onDeleteItem - Callback para remover item
 */
function MessageBubble({ message, onEditItem, onDeleteItem }) {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const isToolResult = !!message.toolResult;

  // Estilos base para bolhas
  const bubbleStyle = {
    maxWidth: '75%',
    padding: '12px 16px',
    borderRadius: '16px',
    wordBreak: 'break-word',
    lineHeight: 1.5,
    fontSize: 14,
    whiteSpace: 'pre-wrap',
  };

  // Estilos especificos por tipo de mensagem
  const userBubbleStyle = {
    ...bubbleStyle,
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: 'white',
    borderBottomRightRadius: '4px',
    marginLeft: 'auto',
  };

  const botBubbleStyle = {
    ...bubbleStyle,
    background: isError
      ? 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'
      : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
    color: isError ? '#991b1b' : '#1f2937',
    borderBottomLeftRadius: '4px',
    marginRight: 'auto',
  };

  // Container do card de produto encontrado
  const productCardStyle = {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  // Renderiza o conteudo da mensagem
  const renderContent = () => {
    if (isToolResult && message.toolResult) {
      // Resultado de tool call - exibe em formato estruturado
      return (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#374151' }}>
            {message.toolResult.title || 'Resultado'}
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>

          {/* Renderiza cards de produtos se houver */}
          {message.toolResult.products && message.toolResult.products.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                Produtos encontrados:
              </div>
              {message.toolResult.products.map((prod, idx) => (
                <div key={prod.id || idx} style={productCardStyle}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{prod.nome}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Código: {prod.codigo || prod.id}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#059669', marginTop: 4 }}>
                    R$ {fmt(prod.preco_venda)}/{prod.metodo_calculo === 'ml' ? 'm' : 'm²'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return message.content;
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div style={isUser ? userBubbleStyle : botBubbleStyle}>
        {renderContent()}

        {/* Timestamp opcional */}
        {message.timestamp && (
          <div style={{
            fontSize: 10,
            opacity: 0.7,
            marginTop: 4,
            textAlign: isUser ? 'right' : 'left',
          }}>
            {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTE: ProductItemCard
// Card editavel para itens do orçamento exibidos no chat
// =============================================================================

/**
 * Card compacto para exibir e editar/remover itens do orçamento
 * Exibido inline no chat quando o bot adiciona um produto
 *
 * @param {Object} props
 * @param {Object} props.item - Item do orçamento
 * @param {Function} props.onEdit - Callback para editar
 * @param {Function} props.onDelete - Callback para remover
 */
function ProductItemCard({ item, onEdit, onDelete }) {
  const isAccessory = item.tipo === 'acessorio';

  const cardStyle = {
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };

  const badgeStyle = {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    textTransform: 'uppercase',
  };

  return (
    <div style={cardStyle}>
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
          <span style={{ fontWeight: 600, color: '#111827' }}>
            {item.produto?.nome || item.nome}
          </span>
        </div>

        {/* Detalhes do item */}
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {isAccessorio ? (
            <>
              <span>Qtd: {item.quantidade} {item.unit || 'un'}</span>
              {item.color && <span> · Cor: {item.color}</span>}
            </>
          ) : (
            <>
              <span>{item.selection?.largura || item.largura}m × {item.selection?.altura || item.altura}m</span>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onEdit?.(item)}
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
            onClick={() => onDelete?.(item.id)}
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
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL: OrcamentoChat
// =============================================================================

/**
 * OrcamentoChat - Chat conversacional para criacao de orçamentos
 *
 * Fluxo principal:
 * 1. Boas-vindas inicial
 * 2. Usuario inicia orçamento -> coleta info do cliente
 * 3. Buscas e adicao de produtos via chat
 * 4. Revisao dos itens
 * 5. Finalizacao e salvamento
 *
 * Integra com API de chat (Gemma) e RAG para busca de produtos
 */
function OrcamentoChat() {
  const navigate = useNavigate();

  // ===========================================================================
  // ESTADO DO COMPONENTE
  // ===========================================================================

  /**
   * Estado principal de mensagens do chat
   * Cada mensagem: {role, content, timestamp, isError, toolResult}
   */
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      content: MENSAGEM_BOAS_VINDAS,
      timestamp: Date.now()
    }
  ]);

  /**
   * Rascunho do orçamento em construcao
   * Contem info do cliente e lista de itens
   */
  const [draft, setDraft] = useState({
    cliente: {
      nome: '',
      telefone: '',
      email: '',
      endereco: ''
    },
    itens: [] // Array de itens: {id, tipo, produto, selection, quantity, subtotal, ...}
  });

  /**
   * Passo atual no fluxo do chat
   * Controla qual acao o bot espera do usuario
   */
  const [step, setStep] = useState('inicio'); // inicio | cliente | produto | finalizado

  /**
   * Flag de loading durante chamadas de API
   */
  const [loading, setLoading] = useState(false);

  /**
   * Input do usuario
   */
  const [inputValue, setInputValue] = useState('');

  /**
   * Historico de mensagens para enviar a API (inclui apenas role e content)
   */
  const [chatHistory, setChatHistory] = useState([
    { role: 'system', content: `Você é um assistente de vendas especializado em cortinas e persianas.
Seu nome é Assistente Persialux.

Você ajuda clientes a criar orçamentos de produtos para cortinas e persianas.
Siga sempre este fluxo:

1. **Início**: Apresente-se e pergunte como pode ajudar
2. **Cliente**: Se não tiver info do cliente, colete: nome (obrigatório), telefone, email, endereço
3. **Produtos**: Ajude a encontrar e adicionar produtos ao orçamento usando a ferramenta buscar_produto
4. **Revisão**: Use listar_itens para mostrar o resumo quando solicitado
5. **Finalizar**: Use finalizar_orcamento quando o cliente confirmar

Sempre seja simpático, profissional e objetivo.
Use as ferramentas disponíveis para buscar produtos, adicionar ao orçamento e finalizar.
Quando buscar produtos, descreva brevemente cada um encontrado.
Sempre confirme ações antes de executar (ex: "Confirma a adição do produto X?").

Produtos disponíveis: cortinas, persianas, rolos, roman, blackout, screens, vertical.` }
  ]);

  /**
   * Referencia para scroll automatico
   */
  const messagesEndRef = useRef(null);

  /**
   * Referencia para o input de texto
   */
  const inputRef = useRef(null);

  /**
   * Flag para indicador de digitacao
   */
  const [isTyping, setIsTyping] = useState(false);

  /**
   * Clientes carregados do banco (para sugestao de cliente existente)
   */
  const [clientes, setClientes] = useState([]);

  /**
   * Toggle do painel de rascunho
   */
  const [showDraftPanel, setShowDraftPanel] = useState(true);

  // ===========================================================================
  // EFEITOS COLATERAIS (useEffect)
  // ===========================================================================

  /**
   * Carrega lista de clientes ao iniciar
   * Usado para sugestao de clientes existentes
   */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await clienteService.getAll();
        if (!cancelado && Array.isArray(lista)) {
          setClientes(lista);
        }
      } catch (err) {
        console.warn('[OrcamentoChat] falha ao carregar clientes:', err.message);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  /**
   * Scroll automatico para a ultima mensagem
   * Executa quando novas mensagens sao adicionadas
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ===========================================================================
  // CALCULOS DERIVADOS (useMemo)
  // ===========================================================================

  /**
   * Total dos itens do rascunho
   * Calculado em tempo real a cada mudanca nos itens
   */
  const totalDraft = useMemo(() => {
    return draft.itens.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [draft.itens]);

  /**
   * Contagem de produtos e acessorios
   */
  const itemCounts = useMemo(() => {
    const produtos = draft.itens.filter(i => i.tipo !== 'acessorio').length;
    const acessorios = draft.itens.filter(i => i.tipo === 'acessorio').length;
    return { produtos, acessorios };
  }, [draft.itens]);

  // ===========================================================================
  // HANDLERS DE ACAO
  // ===========================================================================

  /**
   * Adiciona uma mensagem ao chat
   * Atualiza tanto o estado visual quanto o historico para API
   *
   * @param {Object} params
   * @param {string} params.role - 'user' | 'bot'
   * @param {string} params.content - Texto da mensagem
   * @param {boolean} params.isError - Se e uma mensagem de erro
   * @param {Object} params.toolResult - Resultado de tool call (opcional)
   */
  const addMessage = useCallback(({ role, content, isError = false, toolResult = null }) => {
    const newMessage = {
      role,
      content,
      timestamp: Date.now(),
      isError,
      toolResult,
    };

    setMessages(prev => [...prev, newMessage]);

    // Atualiza historico para API (apenas role e content)
    if (role !== 'system') {
      setChatHistory(prev => [...prev, { role, content }]);
    }

    return newMessage;
  }, []);

  /**
   * Atualiza um item especifico no rascunho
   * Usado quando o bot modifica dimensoes ou quantidade
   *
   * @param {string} itemId - ID do item a atualizar
   * @param {Object} updates - Campos a atualizar
   */
  const updateItemInDraft = useCallback((itemId, updates) => {
    setDraft(prev => ({
      ...prev,
      itens: prev.itens.map(item => {
        if (item.id !== itemId) return item;
        return { ...item, ...updates };
      })
    }));
  }, []);

  /**
   * Remove um item do rascunho
   *
   * @param {string} itemId - ID do item a remover
   */
  const removeItemFromDraft = useCallback((itemId) => {
    setDraft(prev => ({
      ...prev,
      itens: prev.itens.filter(item => item.id !== itemId)
    }));
    addMessage({
      role: 'bot',
      content: 'Item removido do orçamento.'
    });
  }, [addMessage]);

  /**
   * Executa um tool call recebido do bot
   * Gerencia as acoes: buscar_produto, adicionar_produto, finalizar, etc
   *
   * @param {Object} toolCall - Tool call da API {name, arguments}
   * @returns {Promise<Object>} Resultado do tool call
   */
  const executeToolCall = useCallback(async (toolCall) => {
    const { name, arguments: args } = toolCall;
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

    switch (name) {
      case 'buscar_produto': {
        // Busca produtos via RAG
        const { query } = parsedArgs;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          const response = await fetch(`${API_BASE_URL}/rag-search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              query,
              limit: 5,
              table: 'produtos'
            })
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();

          return {
            title: 'Busca de Produtos',
            content: data.produtos?.length > 0
              ? `Encontrei ${data.produtos.length} produto(s) para "${query}"`
              : `Nenhum produto encontrado para "${query}". Tente outro termo.`,
            products: data.produtos || []
          };
        } catch (err) {
          console.error('[OrcamentoChat] erro na busca RAG:', err);
          return {
            title: 'Erro na Busca',
            content: 'Não foi possível buscar produtos. Tente novamente.',
            products: []
          };
        }
      }

      case 'adicionar_produto': {
        // Adiciona produto ao rascunho
        const { produto_id, nome, largura, altura, quantidade, preco_unitario, metodo_calculo } = parsedArgs;

        const novoItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tipo: 'produto',
          produto: {
            id: produto_id,
            nome,
            preco_venda: preco_unitario,
            metodo_calculo: metodo_calculo || 'm2'
          },
          selection: {
            largura: parseFloat(largura),
            altura: parseFloat(altura),
            quantidade: parseInt(quantidade) || 1
          },
          subtotal: parseFloat(preco_unitario || 0) * parseFloat(largura) * parseFloat(altura) * (parseInt(quantidade) || 1)
        };

        setDraft(prev => ({
          ...prev,
          itens: [...prev.itens, novoItem]
        }));

        setStep('produto');

        return {
          title: 'Produto Adicionado',
          content: `${nome} adicionado ao orçamento!\nDimensões: ${largura}m × ${altura}m\nQuantidade: ${quantidade}\nSubtotal: R$ ${fmt(novoItem.subtotal)}`
        };
      }

      case 'adicionar_acessorio': {
        // Adiciona acessorio ao rascunho
        const { acessorio_id, nome, quantidade, preco_unitario, unidade } = parsedArgs;

        const novoItem = {
          id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tipo: 'acessorio',
          produto: {
            id: acessorio_id,
            nome
          },
          quantity: parseInt(quantidade) || 1,
          unit_price: parseFloat(preco_unitario) || 0,
          unit: unidade || 'un',
          subtotal: (parseFloat(preco_unitario) || 0) * (parseInt(quantidade) || 1)
        };

        setDraft(prev => ({
          ...prev,
          itens: [...prev.itens, novoItem]
        }));

        return {
          title: 'Acessório Adicionado',
          content: `${nome} adicionado!\nQuantidade: ${quantidade}\nSubtotal: R$ ${fmt(novoItem.subtotal)}`
        };
      }

      case 'atualizar_cliente': {
        // Atualiza info do cliente no rascunho
        const { nome, telefone, email, endereco } = parsedArgs;

        setDraft(prev => ({
          ...prev,
          cliente: {
            ...prev.cliente,
            nome: nome || prev.cliente.nome,
            telefone: telefone || prev.cliente.telefone,
            email: email || prev.cliente.email,
            endereco: endereco || prev.cliente.endereco
          }
        }));

        setStep('cliente');

        return {
          title: 'Cliente Atualizado',
          content: nome ? `Dados do cliente "${nome}" salvos!` : 'Dados do cliente atualizados.'
        };
      }

      case 'remover_item': {
        // Remove item pelo ID
        const { item_id } = parsedArgs;
        const item = draft.itens.find(i => i.id === item_id);

        if (item) {
          removeItemFromDraft(item_id);
          return {
            title: 'Item Removido',
            content: `"${item.produto?.nome || item.nome}" removido do orçamento.`
          };
        }

        return {
          title: 'Aviso',
          content: 'Item não encontrado no orçamento.'
        };
      }

      case 'listar_itens': {
        // Lista todos os itens atuais
        if (draft.itens.length === 0) {
          return {
            title: 'Orçamento Vazio',
            content: 'Nenhum item adicionado ainda ao orçamento.'
          };
        }

        const listaTexto = draft.itens.map((item, idx) => {
          const nome = item.produto?.nome || item.nome || 'Item';
          const tipo = item.tipo === 'acessorio' ? '[Acessório]' : '';
          return `${idx + 1}. ${tipo} ${nome}\n   Qtd: ${item.tipo === 'acessorio' ? item.quantity : item.selection?.quantidade}\n   Subtotal: R$ ${fmt(item.subtotal)}`;
        }).join('\n\n');

        return {
          title: 'Resumo do Orçamento',
          content: `Itens (${draft.itens.length}):\n\n${listaTexto}\n\nTotal: R$ ${fmt(totalDraft)}`
        };
      }

      case 'finalizar_orcamento': {
        // Inicia o processo de salvamento
        return await handleSalvarOrcamento();
      }

      default:
        return {
          title: 'Ação Desconhecida',
          content: `Não sei como executar: ${name}`
        };
    }
  }, [draft.itens, removeItemFromDraft, totalDraft]);

  /**
   * Salva o orçamento no banco de dados
   * Chamado quando o bot executa finalizar_orcamento
   *
   * Fluxo:
   * 1. Valida cliente e itens
   * 2. Busca ou cria cliente no banco
   * 3. Insere orçamento na tabela orcamentos
   * 4. Atualiza cache local
   * 5. Navega para visualizacao
   */
  const handleSalvarOrcamento = useCallback(async () => {
    // Validacoes basicas
    if (!draft.cliente.nome) {
      return {
        title: 'Atenção',
        content: 'Preciso do nome do cliente para finalizar. Qual o nome do cliente?'
      };
    }

    if (draft.itens.length === 0) {
      return {
        title: 'Atenção',
        content: 'Adicione pelo menos um produto ao orçamento antes de finalizar.'
      };
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Encontrar ou criar cliente
      let clienteId = null;

      // Procura cliente existente pelo nome
      const clienteExistente = clientes.find(
        c => c.name?.toLowerCase().trim() === draft.cliente.nome.toLowerCase().trim()
      );

      if (clienteExistente) {
        clienteId = clienteExistente.id;
      } else {
        // Cria novo cliente
        const novoCliente = await clienteService.create({
          name: draft.cliente.nome.toUpperCase(),
          phone: draft.cliente.telefone || null,
          email: draft.cliente.email || null,
          address: draft.cliente.endereco?.toUpperCase() || null,
        });

        if (!novoCliente?.id) {
          throw new Error('Falha ao criar cliente');
        }

        clienteId = novoCliente.id;
        setClientes(prev => [...prev, novoCliente]);
      }

      // 2) Preparar dados dos produtos
      const cleanProducts = draft.itens
        .filter(i => i.tipo !== 'acessorio')
        .map(i => ({
          produto_id: i.produto.id,
          produto: {
            id: i.produto.id,
            nome: i.produto.nome,
            codigo: i.produto.codigo,
            metodo_calculo: i.produto.metodo_calculo
          },
          largura: parseFloat(i.selection.largura),
          altura: parseFloat(i.selection.altura),
          input_width: parseFloat(i.selection.largura),
          input_height: parseFloat(i.selection.altura),
          quantidade: parseInt(i.selection.quantidade) || 1,
          ambiente: i.selection.ambiente || '',
          modelo: i.selection.modelo || '',
          acionamento: i.selection.acionamento || '',
          cor: i.selection.cor || '',
          customizacao: i.customizacao || {},
          subtotal: i.subtotal
        }));

      // 3) Preparar dados dos acessorios
      const cleanAccessories = draft.itens
        .filter(i => i.tipo === 'acessorio')
        .map(i => ({
          accessory_id: i.produto.id,
          name: i.produto.nome,
          unit: i.unit || '',
          color: i.color || '',
          unit_price: Number(i.unit_price) || 0,
          quantity: Number(i.quantity) || 1,
          subtotal: Number(i.subtotal) || 0,
          valor_total: Number(i.subtotal) || 0
        }));

      // 4) Inserir orçamento
      const { data: orcamento, error } = await supabase
        .from('orcamentos')
        .insert([{
          cliente_id: clienteId,
          vendedor_id: user?.id || null,
          valor_total: totalDraft,
          produtos_json: JSON.stringify(cleanProducts),
          acessorios_json: JSON.stringify(cleanAccessories),
          ambientes: JSON.stringify([]),
          observacao: '',
          status: 'pendente'
        }])
        .select()
        .single();

      if (error) throw error;

      // 5) Atualizar cache local
      try {
        const { localDB } = await import('../services/localDatabase');
        await localDB.put('orcamentos', orcamento);
      } catch (e) {
        console.warn('[OrcamentoChat] falha ao salvar no cache local:', e?.message);
      }

      setStep('finalizado');

      return {
        title: 'Orçamento Salvo!',
        content: `Orçamento #${orcamento.id?.slice(0, 8)} criado com sucesso!\n\nCliente: ${draft.cliente.nome}\nItens: ${draft.itens.length}\nTotal: R$ ${fmt(totalDraft)}\n\nRedirecionando para visualização...`,
        savedOrcamentoId: orcamento.id
      };

    } catch (err) {
      console.error('[OrcamentoChat] erro ao salvar:', err);
      return {
        title: 'Erro',
        content: `Não foi possível salvar o orçamento: ${err.message}`
      };
    } finally {
      setLoading(false);
    }
  }, [draft, clientes, totalDraft]);

  /**
   * Envia mensagem para a API de chat
   * Gerencia streaming de resposta e tool calls
   *
   * @param {string} userMessage - Mensagem do usuario
   */
  const sendToChatAPI = useCallback(async (userMessage) => {
    setLoading(true);
    setIsTyping(true);

    try {
      // Adiciona mensagem do usuario ao chat
      addMessage({ role: 'user', content: userMessage });

      // Prepara payload para API
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const payload = {
        messages: [
          ...chatHistory,
          { role: 'user', content: userMessage }
        ],
        tools: TOOL_DEFINITIONS,
        draft: {
          cliente: draft.cliente,
          itens: draft.itens.map(i => ({
            id: i.id,
            tipo: i.tipo,
            nome: i.produto?.nome || i.nome,
            quantidade: i.tipo === 'acessorio' ? i.quantity : i.selection?.quantidade,
            largura: i.selection?.largura,
            altura: i.selection?.altura,
            subtotal: i.subtotal
          })),
          total: totalDraft
        }
      };

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      // Processa resposta
      const data = await response.json();

      // Se ha tool calls, executa cada um
      if (data.tool_calls && data.tool_calls.length > 0) {
        for (const toolCall of data.tool_calls) {
          const result = await executeToolCall(toolCall);

          // Adiciona resultado como mensagem do bot
          addMessage({
            role: 'bot',
            content: result.content,
            toolResult: result
          });

          // Se o orçamento foi salvo, redireciona
          if (result.savedOrcamentoId) {
            setTimeout(() => {
              navigate(`/budgets/${result.savedOrcamentoId}/view`);
            }, 2000);
          }
        }
      }

      // Adiciona resposta de texto do bot
      if (data.content) {
        addMessage({ role: 'bot', content: data.content });
      }

    } catch (err) {
      console.error('[OrcamentoChat] erro na API:', err);
      addMessage({
        role: 'bot',
        content: 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente.',
        isError: true
      });
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }, [addMessage, chatHistory, draft, totalDraft, executeToolCall, navigate]);

  /**
   * Handler para envio de mensagem
   * Intercepta Enter (envia) e Shift+Enter (nova linha)
   *
   * @param {Object} e - Evento do textarea
   */
  const handleInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const message = inputValue.trim();
      if (message) {
        sendToChatAPI(message);
        setInputValue('');
      }
    }
  }, [inputValue, sendToChatAPI]);

  /**
   * Handler para botoes de acao rapida
   *
   * @param {string} action - Acao pre-definida
   */
  const handleQuickAction = useCallback((action) => {
    const actions = {
      'iniciar': 'Quero iniciar um novo orçamento.',
      'cancelar': 'Cancelar este orçamento e começar um novo.',
      'listar': 'Liste os itens do meu orçamento atual.'
    };

    if (actions[action]) {
      sendToChatAPI(actions[action]);
    }
  }, [sendToChatAPI]);

  /**
   * Reseta o chat para comecar um novo orçamento
   */
  const handleNovoOrcamento = useCallback(() => {
    setDraft({
      cliente: { nome: '', telefone: '', email: '', endereco: '' },
      itens: []
    });
    setStep('inicio');
    setMessages([
      {
        role: 'bot',
        content: MENSAGEM_BOAS_VINDAS,
        timestamp: Date.now()
      }
    ]);
    setChatHistory([chatHistory[0]]); // Mantem system prompt
  }, [chatHistory]);

  // ===========================================================================
  // RENDERIZACAO
  // ===========================================================================

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#f3f4f6',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* ===================================================================== */}
      {/* AREA PRINCIPAL DO CHAT */}
      {/* ===================================================================== */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        maxWidth: showDraftPanel ? 'calc(100% - 380px)' : '100%',
        transition: 'max-width 0.3s ease',
        minWidth: 0
      }}>
        {/* Header */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
              Chat de Orçamento
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
              Crie orçamentos com ajuda da IA
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowDraftPanel(prev => !prev)}
              style={{
                padding: '8px 12px',
                background: showDraftPanel ? '#e5e7eb' : '#2563eb',
                color: showDraftPanel ? '#374151' : 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              {showDraftPanel ? 'Ocultar Resumo' : 'Ver Resumo'}
            </button>

            <button
              onClick={handleNovoOrcamento}
              style={{
                padding: '8px 12px',
                background: '#fef3c7',
                color: '#92400e',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              Novo Orçamento
            </button>
          </div>
        </header>

        {/* Area de mensagens */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              onEditItem={(item) => {/* TODO: implementar edicao inline */}}
              onDeleteItem={(itemId) => removeItemFromDraft(itemId)}
            />
          ))}

          {/* Indicador de digitacao */}
          {isTyping && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0'
            }}>
              <div style={{
                display: 'flex',
                gap: 4,
                padding: '12px 16px',
                background: '#f3f4f6',
                borderRadius: 16,
                borderBottomLeftRadius: 4
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  background: '#6b7280',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out',
                  animationDelay: '0s'
                }} />
                <span style={{
                  width: 8,
                  height: 8,
                  background: '#6b7280',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out',
                  animationDelay: '0.2s'
                }} />
                <span style={{
                  width: 8,
                  height: 8,
                  background: '#6b7280',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out',
                  animationDelay: '0.4s'
                }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Botoes de acao rapida */}
        {step === 'inicio' && (
          <div style={{
            padding: '0 20px 12px',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => handleQuickAction('iniciar')}
              style={{
                padding: '10px 16px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              Iniciar Orçamento
            </button>
            <button
              onClick={() => handleQuickAction('listar')}
              style={{
                padding: '10px 16px',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500
              }}
            >
              Ver Itens Atuais
            </button>
          </div>
        )}

        {/* Input de mensagem */}
        <div style={{
          padding: '12px 20px',
          background: 'white',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end'
          }}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              disabled={loading}
              rows={2}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 12,
                fontSize: 14,
                resize: 'none',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'border-color 0.2s',
                ':focus': {
                  borderColor: '#2563eb'
                }
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />

            <button
              onClick={() => {
                const msg = inputValue.trim();
                if (msg) {
                  sendToChatAPI(msg);
                  setInputValue('');
                }
              }}
              disabled={loading || !inputValue.trim()}
              style={{
                padding: '10px 20px',
                background: inputValue.trim() ? '#2563eb' : '#e5e7eb',
                color: inputValue.trim() ? 'white' : '#9ca3af',
                border: 'none',
                borderRadius: 10,
                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              Enviar
            </button>
          </div>

          <p style={{
            margin: '8px 0 0',
            fontSize: 11,
            color: '#9ca3af',
            textAlign: 'center'
          }}>
            Pressione Enter para enviar, Shift+Enter para nova linha
          </p>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PAINEL DE RESUMO DO ORCAMENTO */}
      {/* ===================================================================== */}
      {showDraftPanel && (
        <aside style={{
          width: 360,
          background: 'white',
          borderLeft: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header do painel */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
              Resumo do Orçamento
            </h2>
          </div>

          {/* Info do Cliente */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase'
            }}>
              Cliente
            </h3>

            {draft.cliente.nome ? (
              <div>
                <div style={{ fontWeight: 600, color: '#111827' }}>
                  {draft.cliente.nome}
                </div>
                {draft.cliente.telefone && (
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {draft.cliente.telefone}
                  </div>
                )}
                {draft.cliente.email && (
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                    {draft.cliente.email}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                fontSize: 13,
                color: '#9ca3af',
                fontStyle: 'italic'
              }}>
                Cliente não informado ainda
              </div>
            )}
          </div>

          {/* Lista de Itens */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            <h3 style={{
              margin: '0 0 8px',
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280',
              textTransform: 'uppercase'
            }}>
              Itens ({draft.itens.length})
            </h3>

            {draft.itens.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '24px 0',
                color: '#9ca3af',
                fontSize: 13
              }}>
                Nenhum item adicionado
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.itens.map(item => (
                  <ProductItemCard
                    key={item.id}
                    item={item}
                    onEdit={(item) => {/* TODO */}}
                    onDelete={(itemId) => removeItemFromDraft(itemId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer com Total e Acoes */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb'
          }}>
            {/* Totais */}
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#6b7280',
                marginBottom: 4
              }}>
                <span>Produtos:</span>
                <span>{itemCounts.produtos}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#6b7280',
                marginBottom: 8
              }}>
                <span>Acessórios:</span>
                <span>{itemCounts.acessorios}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 18,
                fontWeight: 700,
                color: '#059669'
              }}>
                <span>Total:</span>
                <span>R$ {fmt(totalDraft)}</span>
              </div>
            </div>

            {/* Botoes de acao */}
            <button
              onClick={() => handleQuickAction('listar')}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8
              }}
            >
              Revisar com Assistente
            </button>

            <button
              onClick={() => handleQuickAction('iniciar')}
              disabled={step === 'finalizado'}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: step === 'finalizado' ? '#e5e7eb' : '#059669',
                color: step === 'finalizado' ? '#9ca3af' : 'white',
                border: 'none',
                borderRadius: 8,
                cursor: step === 'finalizado' ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 700
              }}
            >
              {step === 'finalizado' ? 'Orçamento Salvo!' : 'Finalizar Orçamento'}
            </button>
          </div>
        </aside>
      )}

      {/* ===================================================================== */}
      {/* ESTILOS CSS INLINE (ANIMACOES) */}
      {/* ===================================================================== */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* Scrollbar personalizada */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #f3f4f6;
        }
        ::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  );
}

export default OrcamentoChat;
