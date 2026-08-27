import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductSelectorCascata from '../components/ProductSelectorCascata';
import '../components/ProductSelectorCascata.css';
import { supabase } from '../supabase/client';
import { clienteService } from '../services/clienteService';
import { sendMetaEvent, persistMetaEventResult } from '../services/metaCapiService';
import { taxaCartaoService, BANDEIRAS_CARTAO } from '../services/taxaCartaoService';
import { contasPagarService } from '../services/contasPagarService';
import { contasReceberService } from '../services/contasReceberService';
import ConfirmModal from '../components/ConfirmModal';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcSubtotal(produto, largura, altura, qty) {
  if (!produto || !largura || !altura) return 0;
  const l = parseFloat(largura), a = parseFloat(altura);
  const q = parseInt(qty) || 1;
  const preco = parseFloat(produto.preco_venda) || 0;
  const metodo = (produto.metodo_calculo || 'm2').toLowerCase();
  let base = 0;
  if (metodo === 'ml' || metodo === 'linear') base = l * preco;
  else if (metodo === 'altura') base = a * preco;
  else {
    const area = l * a;
    const areaMin = parseFloat(produto.area_minima) || 0;
    base = Math.max(area, areaMin) * preco;
  }
  return base * q;
}

function OrcamentoV2({ products, customers, setCustomers, accessories }) {
  const navigate = useNavigate();
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const editBudgetId = params.get('budgetId') || null;

  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState(customers || []);
  const [acessoriosDisponiveis, setAcessoriosDisponiveis] = useState(accessories || []);
  const [itens, setItens] = useState([]);
  const [itemAtual, setItemAtual] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [carregandoOrcamento, setCarregandoOrcamento] = useState(!!editBudgetId);

  // ID do orçamento já persistido no banco. Permite "Finalizar orçamento" depois de salvar.
  const [orcamentoId, setOrcamentoId] = useState(editBudgetId);
  const [orcamentoStatus, setOrcamentoStatus] = useState('rascunho');
  const [finalizando, setFinalizando] = useState(false);

  // Modal de pagamento (cartão/PIX/boleto etc)
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('credit_card'); // credit_card | pix | boleto | dinheiro | transferencia
  const [bandeiraCartao, setBandeiraCartao] = useState('visa');
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [taxaAplicada, setTaxaAplicada] = useState(null); // { taxa_percentual, ativa } | null
  const [valorLiquido, setValorLiquido] = useState(0); // valor final após taxa
  const [taxasCartao, setTaxasCartao] = useState([]); // cache pra popular select de parcelas
  const [descontoPixPct, setDescontoPixPct] = useState(5); // padrão 5% se não houver config

  // Cadastro inline de cliente
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ name: '', phone: '', email: '', address: '', cpf: '' });
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [erroCliente, setErroCliente] = useState('');
  const [infoClientes, setInfoClientes] = useState(null);

  // Edição
  const [editandoItemId, setEditandoItemId] = useState(null);

  // Acessório em construção
  const [acessorioAtual, setAcessorioAtual] = useState({
    id: null,
    name: '',
    unit: '',
    color: '',
    quantity: 1
  });
  const [buscaAcessorio, setBuscaAcessorio] = useState('');

  // Sistema de notificação inline (substitui alert/confirm nativos
  // que não funcionam em iframes / Claude browser).
  const [notificacao, setNotificacao] = useState(null); // { tipo, mensagem }
  const showNotif = (mensagem, tipo = 'info', ttl = 4000) => {
    setNotificacao({ mensagem, tipo });
    if (ttl > 0) setTimeout(() => setNotificacao(null), ttl);
  };
  const showErro = (mensagem) => showNotif(mensagem, 'erro', 6000);
  const showSucesso = (mensagem) => showNotif(mensagem, 'sucesso', 3000);

  // Confirm async substituto de window.confirm — retorna Promise<boolean>
  const [confirmState, setConfirmState] = useState(null); // { msg, resolve }
  const pedirConfirmacao = (mensagem, titulo = 'Confirmar') => {
    return new Promise((resolve) => {
      setConfirmState({ mensagem, titulo, resolve });
    });
  };
  const onConfirmResposta = (resposta) => {
    if (confirmState?.resolve) confirmState.resolve(resposta);
    setConfirmState(null);
  };

  useEffect(() => {
    if (customers && customers.length > 0) {
      setClientes(customers);
      setInfoClientes(null);
    }
  }, [customers]);

  useEffect(() => {
    // Sincroniza sempre (mesmo se vazio) — sem essa condição, o useState
    // inicial congela em [] quando accessories chega vazio no primeiro render
    // (cache local não populado, IndexedDB vazio, ou props não chegou ainda).
    if (Array.isArray(accessories)) setAcessoriosDisponiveis(accessories);
  }, [accessories]);

  // Fallback: se ainda assim a lista estiver vazia e o cache local existir,
  // tenta carregar do localDB.produtos_acessorios direto.
  useEffect(() => {
    let cancelado = false;
    if (acessoriosDisponiveis.length > 0) return;
    (async () => {
      try {
        const { localDB } = await import('../services/localDatabase');
        const locais = await localDB.getAll('produtos_acessorios');
        if (!cancelado && Array.isArray(locais) && locais.length > 0) {
          setAcessoriosDisponiveis(locais);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelado = true; };
  }, [acessoriosDisponiveis.length]);

  // Modo edição: carregar orçamento existente via ?budgetId=... na URL.
  useEffect(() => {
    if (!editBudgetId) return;
    let cancelado = false;
    (async () => {
      try {
        const { data: orc, error } = await supabase
          .from('orcamentos')
          .select('*, clientes(*)')
          .eq('id', editBudgetId)
          .maybeSingle();
        if (error) throw error;
        if (!orc || cancelado) return;
        setClienteId(orc.cliente_id || '');
        setObservacao(orc.observacao || '');
        setOrcamentoStatus(orc.status || 'pendente');
        // Montar itens do produto
        let produtosJson = orc.produtos_json;
        if (typeof produtosJson === 'string') {
          try { produtosJson = JSON.parse(produtosJson); } catch { produtosJson = []; }
        }
        let acessoriosJson = orc.acessorios_json;
        if (typeof acessoriosJson === 'string') {
          try { acessoriosJson = JSON.parse(acessoriosJson); } catch { acessoriosJson = []; }
        }
        const itensCarregados = [];
        (produtosJson || []).forEach((item) => {
          const prod = item.produto || products.find((p) => p.id === (item.produto_id || item.id));
          if (!prod) return;
          itensCarregados.push({
            id: `item-${item.produto_id || item.id}`,
            tipo: 'produto',
            produto: prod,
            selection: item.selection || {
              largura: item.input_width || item.largura || '',
              altura: item.input_height || item.altura || '',
              quantidade: item.quantidade || 1,
              ambiente: item.ambiente || '',
              cor: item.cor || '',
              produtoId: item.produto_id,
              modelo: item.modelo || '',
              acionamento: item.acionamento || '',
            },
            customizacao: item.customizacao || {},
            subtotal: Number(item.subtotal || item.valor_total || 0),
          });
        });
        (acessoriosJson || []).forEach((a) => {
          itensCarregados.push({
            id: `acc-${a.accessory_id || a.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tipo: 'acessorio',
            produto: { id: a.accessory_id || a.id, nome: a.name || a.accessory?.name || 'Acessório', codigo: a.accessory_id || a.id },
            unit: a.unit || '',
            color: a.color || '',
            quantity: Number(a.quantity) || 1,
            unit_price: Number(a.unit_price) || 0,
            subtotal: Number(a.subtotal || a.valor_total || 0),
          });
        });
        if (!cancelado) setItens(itensCarregados);
      } catch (err) {
        console.warn('[OrcamentoV2] falha ao carregar orçamento:', err.message);
        alert('Falha ao carregar orçamento para edição: ' + err.message);
      } finally {
        if (!cancelado) setCarregandoOrcamento(false);
      }
    })();
    return () => { cancelado = true; };
  }, [editBudgetId, products]);

  // Carrega clientes do Supabase se a prop vier vazia (caso o cache local esteja
  // vazio na primeira renderização ou o usuário tenha acabado de logar).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (clientes && clientes.length > 0) return;
      try {
        const lista = await clienteService.getAll();
        if (!cancelado && Array.isArray(lista)) {
          setClientes(lista);
          if (setCustomers) setCustomers(lista);
        }
      } catch (err) {
        console.warn('[OrcamentoV2] falha ao carregar clientes:', err.message);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computado em cada render — fresh em qualquer closure async
  const clienteSelecionado = clientes.find(c => String(c.id) === String(clienteId));

  const acessoriosFiltrados = useMemo(() => {
    const termo = buscaAcessorio.toLowerCase().trim();
    if (!termo) return acessoriosDisponiveis;
    return acessoriosDisponiveis.filter(a =>
      (a.name || '').toLowerCase().includes(termo)
    );
  }, [acessoriosDisponiveis, buscaAcessorio]);

  const selecionarAcessorio = (acc) => {
    // Escolhe a primeira cor com sale_price definido (pode ser 0 = a consultar).
    // Se acc.colors é array de objetos {color, sale_price}, filtra válida.
    // Se acc.colors é array de strings puro (legado), usa direto.
    const colors = acc.colors || [];
    const primeiraComPreco =
      colors.find((c) => {
        const cVal = typeof c === 'object' ? (c.color || c.nome) : c;
        const sPrice = typeof c === 'object' ? Number(c.sale_price) : null;
        return cVal && sPrice != null && !Number.isNaN(sPrice);
      });
    const corInicial =
      (typeof primeiraComPreco === 'object' ? primeiraComPreco.color : primeiraComPreco)
      || (typeof colors[0] === 'object' ? colors[0].color : colors[0])
      || '';
    setAcessorioAtual({
      id: acc.id,
      name: acc.name,
      unit: acc.unit || '',
      color: corInicial || '',
      quantity: 1,
      fornecedor: acc.fornecedor || acc.supplier || '',
      codigo: acc.codigo || acc.sku || acc.id,
    });
  };

  // Quantidade segura: aceita fracionário (ex: 0.5 metro) e trata NaN/vazio.
  const qtyAcessorio = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n;
  };

  const salvarNovoCliente = async () => {
    const nome = novoCliente.name.trim();
    if (!nome) {
      setErroCliente('Nome é obrigatório.');
      return;
    }
    setErroCliente('');
    setSalvandoCliente(true);
    try {
      const payload = {
        name: nome.toUpperCase(),
        phone: novoCliente.phone.trim() || null,
        email: novoCliente.email.trim() || null,
        address: novoCliente.address.trim() ? novoCliente.address.trim().toUpperCase() : null,
        cpf: novoCliente.cpf.trim() || null
      };
      const criado = await clienteService.create(payload);
      if (!criado || !criado.id) throw new Error('Cliente criado sem id');
      const listaAtualizada = [...clientes, criado];
      setClientes(listaAtualizada);
      if (setCustomers) setCustomers(listaAtualizada);
      setClienteId(criado.id);
      setNovoCliente({ name: '', phone: '', email: '', address: '', cpf: '' });
      setMostrarFormCliente(false);
      setInfoClientes(`Cliente "${criado.name}" cadastrado e selecionado.`);
    } catch (err) {
      console.error('[OrcamentoV2] erro ao salvar cliente:', err);
      setErroCliente(`Falha ao salvar: ${err.message || 'erro desconhecido'}`);
    } finally {
      setSalvandoCliente(false);
    }
  };

  // Preço do acessório selecionado para exibição e validação
  const accSelecionadoInfo = useMemo(() => {
    if (!acessorioAtual.id) return null;
    const acc = acessoriosDisponiveis.find(a => a.id === acessorioAtual.id);
    if (!acc) return null;
    const corObj = (acc.colors || []).find(c => c.color === acessorioAtual.color)
      || (acc.colors || []).find(c => c.sale_price != null);
    const precoUnit = parseFloat(corObj?.sale_price) || 0;
    return { acc, precoUnit, corObj };
  }, [acessorioAtual.id, acessorioAtual.color, acessoriosDisponiveis]);

  const adicionarAcessorio = () => {
    if (!acessorioAtual.id || !accSelecionadoInfo) return;
    const { acc, precoUnit } = accSelecionadoInfo;
    if (precoUnit === 0) {
      alert(`O acessório "${acc.name}" não tem preço de venda cadastrado.\nCadastre o preço em Acessórios antes de adicionar ao orçamento.`);
      return;
    }
    const qty = qtyAcessorio(acessorioAtual.quantity);
    if (qty <= 0) {
      alert('Quantidade deve ser maior que zero.');
      return;
    }
    // Confirmação visual: se cor não foi selecionada explicitamente e o acessório
    // tem cores disponíveis, alerta o usuário (mas permite adicionar).
    if (!acessorioAtual.color && (acc.colors || []).length > 0) {
      const confirma = window.confirm(`Esse acessório tem cores disponíveis mas nenhuma foi selecionada.\nDeseja adicionar mesmo assim?`);
      if (!confirma) return;
    }
    const subtotal = precoUnit * qty;
    setItens(prev => [...prev, {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tipo: 'acessorio',
      produto: { id: acc.id, nome: acc.name, codigo: acc.id },
      unit: acc.unit,
      color: acessorioAtual.color,
      quantity: qty,
      unit_price: precoUnit,
      subtotal
    }]);
    setAcessorioAtual({ id: null, name: '', unit: '', color: '', quantity: 1 });
  };

  const removerItem = (id) => {
    setItens(prev => prev.filter(i => i.id !== id));
    if (editandoItemId === id) setEditandoItemId(null);
  };

  const editarItem = (id) => {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    if (item.tipo === 'produto') {
      setItemAtual(item);
      setEditandoItemId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item.tipo === 'acessorio') {
      // Carrega o acessório no formulário de construção para edição rápida
      setAcessorioAtual({
        id: item.produto.id,
        name: item.produto.nome,
        unit: item.unit,
        color: item.color || '',
        quantity: item.quantity,
      });
      setEditandoItemId(id);
    }
  };

  const atualizarItemAcessorio = () => {
    if (!editandoItemId || !accSelecionadoInfo) return;
    const { precoUnit } = accSelecionadoInfo;
    const qty = qtyAcessorio(acessorioAtual.quantity);
    if (qty <= 0) {
      alert('Quantidade deve ser maior que zero.');
      return;
    }
    const subtotal = precoUnit * qty;
    setItens(prev => prev.map(i => {
      if (i.id !== editandoItemId) return i;
      return {
        ...i,
        unit: acessorioAtual.unit || i.unit || '',
        color: acessorioAtual.color || i.color || '',
        quantity: qty,
        unit_price: precoUnit,
        semPreco: precoUnit === 0,
        subtotal,
      };
    }));
    setEditandoItemId(null);
    setAcessorioAtual({ id: null, name: '', unit: '', color: '', quantity: 1, fornecedor: '', codigo: '' });
  };

  const atualizarItemProduto = () => {
    if (!editandoItemId || !itemAtual) return;
    const novoSubtotal = calcSubtotal(itemAtual.produto, itemAtual.selection.largura, itemAtual.selection.altura, itemAtual.selection.quantidade);
    setItens(prev => prev.map(i => i.id === editandoItemId
      ? { ...i, produto: itemAtual.produto, selection: { ...itemAtual.selection }, customizacao: { ...itemAtual.customizacao }, subtotal: novoSubtotal }
      : i));
    setItemAtual(null);
    setEditandoItemId(null);
  };

  const totalProdutos = useMemo(
    () => itens.filter(i => i.tipo !== 'acessorio').reduce((s, i) => s + i.subtotal, 0),
    [itens]
  );
  const totalAcessorios = useMemo(
    () => itens.filter(i => i.tipo === 'acessorio').reduce((s, i) => s + i.subtotal, 0),
    [itens]
  );
  const total = totalProdutos + totalAcessorios;

  const handleCascataSelect = (payload) => {
    const { selection, customizacao, produto } = payload;
    const subtotal = calcSubtotal(
      produto,
      selection.largura,
      selection.altura,
      selection.quantidade
    );
    const novoItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      produto,
      selection: { ...selection },
      customizacao: { ...customizacao },
      subtotal,
    };
    if (editandoItemId) {
      // Substitui o item que está sendo editado
      setItens(prev => prev.map(i => i.id === editandoItemId
        ? { ...novoItem, id: editandoItemId, tipo: 'produto' }
        : i));
      setEditandoItemId(null);
      setItemAtual(null);
    } else {
      setItemAtual(novoItem);
    }
  };

  const handleAdicionar = () => {
    if (!itemAtual) return;
    setItens(prev => [...prev, { ...itemAtual, tipo: 'produto' }]);
    setItemAtual(null);
  };

  const handleSalvar = async (options = {}) => {
    const showAlerts = options.showAlerts !== false;
    const afterSave = options.afterSave;
    if (!clienteId) {
      alert('Selecione um cliente antes de salvar.');
      return;
    }
    if (itens.length === 0) {
      alert('Adicione pelo menos um item ao orçamento.');
      return;
    }
    setSalvando(true);
    try {
      const fmtCustomizacaoLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const customizacaoTexto = (cust) => {
        if (!cust || typeof cust !== 'object') return '';
        return Object.entries(cust)
          .filter(([, v]) => v)
          .map(([k, v]) => `${fmtCustomizacaoLabel(k)}: ${v}`)
          .join(' | ');
      };
      const cleanProducts = itens
        .filter(i => i.tipo !== 'acessorio')
        .map(i => ({
          produto_id: i.produto.id,
          produto: {
            id: i.produto.id,
            nome: i.produto.nome,
            modelo: i.produto.modelo,
            tecido: i.produto.tecido,
            codigo: i.produto.codigo,
            metodo_calculo: i.produto.metodo_calculo
          },
          largura: parseFloat(i.selection.largura),
          altura: parseFloat(i.selection.altura),
          input_width: parseFloat(i.selection.largura),
          input_height: parseFloat(i.selection.altura),
          ambiente: i.selection.ambiente || '',
          bando: false,
          instalacao: false,
          trilho_tipo: '',
          painel: false,
          num_folhas: 1,
          modelo: i.selection.modelo || '',
          acionamento: i.selection.acionamento || '',
          cor: i.selection.cor || '',
          customizacao: i.customizacao,
          customizacao_texto: customizacaoTexto(i.customizacao),
          origem: 'cascata',
          selection: i.selection,
          subtotal: i.subtotal
        }));

      const { data: { user } } = await supabase.auth.getUser();
      // acessório: produto.id = UUID do produtos_acessorios.
      // Persistimos 'valor_total' (= subtotal) para casar com a leitura que o
      // BudgetDetailsPage faz ('valor_total || subtotal'). Adicionamos também
      // 'unit' explicitamente, e mantemos 'color' mesmo quando vazio (string),
      // evitando que o PDF renderize 'undefined'.
      const cleanAccessories = itens
        .filter(i => i.tipo === 'acessorio')
        .map(i => ({
          accessory_id: i.produto.codigo || i.produto.id,
          accessory: { id: i.produto.id, name: i.produto.nome, unit: i.unit, colors: [] },
          name: i.produto.nome,
          unit: i.unit || '',
          color: typeof i.color === 'string' ? i.color : '',
          unit_price: Number(i.unit_price) || 0,
          quantity: Number(i.quantity) || 1,
          subtotal: Number(i.subtotal) || 0,
          valor_total: Number(i.subtotal) || 0,
          sem_preco: !!i.semPreco,
          fornecedor: i.produto.fornecedor || '',
        }));

      const { data, error } = await supabase
        .from('orcamentos')
        .upsert([{
          ...(orcamentoId ? { id: orcamentoId } : {}),
          cliente_id: clienteId,
          vendedor_id: user?.id || null,
          valor_total: total,
          produtos_json: JSON.stringify(cleanProducts),
          acessorios_json: JSON.stringify(cleanAccessories),
          ambientes: JSON.stringify([]),
          observacao: observacao,
          status: orcamentoId ? orcamentoStatus || 'pendente' : 'pendente',
        }], { onConflict: 'id' })
        .select()
        .single();
      if (error) throw error;
      // Marca o orçamento como já persistido + status atual.
      setOrcamentoId(data.id);
      setOrcamentoStatus(data.status || 'pendente');
      if (showAlerts) alert(orcamentoId ? 'Orçamento atualizado com sucesso!' : 'Orçamento criado com sucesso!');
      // Dispara Lead pra Meta CAPI (status=pendente). Best-effort — não bloqueia navegação.
      try {
        const eventId = crypto.randomUUID();
        const metaResult = await sendMetaEvent({
          eventName: 'Lead',
          eventId,
          cliente: clienteSelecionado,
          orcamento: data,
        });
        await persistMetaEventResult(data.id, {
          eventId,
          eventName: 'Lead',
          response: metaResult,
        });
      } catch (e) {
        console.warn('[meta-capi] erro ao enviar Lead (não crítico):', e?.message || e);
      }

      // Callback opcional após save (usado por handleFinalizar para abrir modal).
      if (typeof afterSave === 'function') {
        try {
          await afterSave(data);
        } catch (err) {
          console.warn('[OrcamentoV2] afterSave callback falhou:', err?.message);
        }
      }
      navigate(`/budgets/${data.id}/view`);
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  // Abre modal de pagamento antes de finalizar — calcula taxa/valor líquido.


  // Comportamento:
  // - Se !orcamentoId: pede confirmação, salva primeiro, abre modal
  // - Se orcamentoId: validações rápidas e abre modal direto
  // Botão "Finalizar agora" simplificado: apenas SALVA o orçamento como pendente
  // (o fluxo de pagamento é opcional e fica num botão separado "Registrar venda").
  // Validações inline (banner) — nunca bloqueia com alert/confirm nativos.
  const handleFinalizar = async () => {
    if (!clienteId) {
      showErro('Selecione um cliente antes de salvar.');
      return;
    }
    if (itens.length === 0) {
      showErro('Adicione pelo menos um item antes de salvar.');
      return;
    }
    if (orcamentoStatus === 'finalizado') {
      showErro('Este orçamento já está finalizado. Use "Reabrir como pendente" se precisar.');
      return;
    }
    try {
      await handleSalvar({ showAlerts: false });
      showSucesso('Orçamento salvo como pendente!');
    } catch (err) {
      showErro('Não foi possível salvar: ' + (err.message || ''));
    }
  };

  // Botão "Registrar venda" (ex-Pagamento modal) — fluxo opcional de pagamento.
  // Quando o usuário clica, abre o modal de pagamento para gerar Purchase + contas.
  const abrirModalPagamento = async () => {
    if (!clienteId || itens.length === 0) {
      // Se precisar salvar antes, chama handleFinalizar primeiro
      if (!orcamentoId) {
        await handleSalvar({ showAlerts: false });
      }
      if (!clienteId || itens.length === 0) {
        showErro('Cliente e itens são obrigatórios para registrar venda.');
        return;
      }
    }
    try {
      const lista = await taxaCartaoService.getAll();
      setTaxasCartao(lista);
    } catch (err) {
      console.warn('[OrcamentoV2] falha ao carregar taxas:', err.message);
      setTaxasCartao([]);
    }
    setShowPagamentoModal(true);
  };

  // Confirma o pagamento: salva forma + taxa no orcamento, finaliza, dispara Meta.
  // =========================================================================
  // Geração automática de Contas a Pagar / Receber ao finalizar orçamento.
  // Conta a Pagar (custo): CMV dos produtos + custo dos acessórios.
  // Conta a Receber (venda): valor negociado (com juros/desconto aplicados).
  // =========================================================================
  const gerarContasAoFinalizar = async (orc, valorNegociado) => {
    // Carrega custo dos produtos e acessórios.
    const { data: prods } = await supabase
      .from('produtos')
      .select('id,preco_custo');
    const { data: accs } = await supabase
      .from('produtos_acessorios')
      .select('id,cost_price,sale_price,name,colors');
    const mapaCustoProd = {};
    (prods || []).forEach((p) => { mapaCustoProd[p.id] = Number(p.preco_custo) || 0; });
    const mapaAcc = {};
    (accs || []).forEach((a) => { mapaAcc[a.id] = a; });

    let cmvProdutos = 0;
    let itensProd = [];
    try { itensProd = JSON.parse(orc.produtos_json || '[]'); } catch {}
    itensProd.forEach((item) => {
      const pid = item.produto_id || item.product?.id || item.id;
      const l = Number(item.input_width || item.largura || 0);
      const a = Number(item.input_height || item.altura || 0);
      const q = Number(item.quantidade || item.quantity || 1) || 1;
      const metodo = String(item.metodo_calculo || 'm2').toLowerCase();
      const areaMin = Number(item.area_minima) || 0;
      let unidades = 0;
      if (metodo === 'ml' || metodo === 'linear') unidades = l * q;
      else if (metodo === 'altura') unidades = a * q;
      else {
        const area = l * a;
        unidades = Math.max(area, areaMin) * q;
      }
      cmvProdutos += (mapaCustoProd[pid] || 0) * unidades;
    });

    let cmvAcessorios = 0;
    let itensAcc = [];
    try { itensAcc = JSON.parse(orc.acessorios_json || '[]'); } catch {}
    itensAcc.forEach((a) => {
      const aid = a.accessory_id || a.id;
      const acc = mapaAcc[aid];
      const qty = Number(a.quantity) || 1;
      let custoUnit = Number(acc?.cost_price) || 0;
      if (custoUnit <= 0) custoUnit = (Number(a.unit_price) || 0) * 0.6;
      cmvAcessorios += custoUnit * qty;
    });

    const custoTotal = cmvProdutos + cmvAcessorios;
    const hoje = new Date().toISOString().slice(0, 10);
    const vencimentoPagar = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const numeroParcelas = orc.payment_installments && orc.payment_installments > 0
      ? orc.payment_installments : 1;
    const vencimentoReceber = new Date(Date.now() + numeroParcelas * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      // 1) Conta a PAGAR (fornecedor padrão "Mercadoria PersiFix")
      if (custoTotal > 0) {
        await contasPagarService.create({
          descricao: `Compra do orçamento #${orc.numero_orcamento || orc.id?.slice(0, 8)}`,
          fornecedor_nome: 'Mercadoria PersiFix (compra de produto/acessório)',
          categoria: 'compra',
          valor_total: custoTotal,
          numero_parcelas: 1,
          parcela_atual: 1,
          data_emissao: hoje,
          data_vencimento: vencimentoPagar,
          status: 'pendente',
          forma_pagamento: 'boleto',
          orcamento_id: orc.id,
        });
      }
      // 2) Conta a RECEBER (cliente)
      if (valorNegociado > 0) {
        await contasReceberService.create({
          descricao: `Recebimento orçamento #${orc.numero_orcamento || orc.id?.slice(0, 8)}`,
          orcamento_id: orc.id,
          cliente_id: orc.cliente_id,
          valor_total: valorNegociado,
          numero_parcelas: numeroParcelas,
          parcela_atual: 1,
          data_emissao: hoje,
          data_vencimento: vencimentoReceber,
          forma_recebimento: orc.payment_method || 'pix',
          status: 'pendente',
        });
      }
    } catch (err) {
      console.warn('[OrcamentoV2] falha ao gerar contas a pagar/receber:', err?.message);
    }
  };

  const handleConfirmarPagamento = async () => {
    setFinalizando(true);
    setShowPagamentoModal(false);
    try {
      // Recupera o orcamento atual do DB pra pegar valor_total
      const { data: orcDb, error: orcErr } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('id', orcamentoId)
        .single();
      if (orcErr) throw orcErr;
      const valorTotal = Number(orcDb.valor_total || orcDb.valor_negociado || 0);

      let valorNegociado = valorTotal;
      let payment_method = formaPagamento;
      let payment_installments = null;
      let payment_tax_rate = 0;
      let payment_discount_rate = 0;

      if (formaPagamento === 'credit_card') {
        // Consulta a taxa da bandeira × parcelas
        const taxa = await taxaCartaoService.getTaxa(bandeiraCartao, parcelasCartao);
        const taxaPct = Number(taxa?.taxa_percentual) || 0;
        payment_tax_rate = taxaPct;
        payment_installments = parcelasCartao;
        valorNegociado = valorTotal * (1 + taxaPct / 100); // com juros (se taxa > 0)
      } else if (formaPagamento === 'pix') {
        payment_discount_rate = descontoPixPct;
        valorNegociado = valorTotal * (1 - descontoPixPct / 100);
      }

      // 1) UPDATE do orcamento com pagamento + finalizar
      const { data: updated, error } = await supabase
        .from('orcamentos')
        .update({
          status: 'finalizado',
          payment_method,
          payment_installments: payment_installments || 1,
          payment_tax_rate,
          payment_discount_rate,
          valor_negociado: valorNegociado,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orcamentoId)
        .select()
        .single();
      if (error) throw error;
      setOrcamentoStatus('finalizado');

      // 2) Dispara Purchase pra Meta CAPI com o valor LÍQUIDO
      try {
        const eventId = crypto.randomUUID();
        const metaResult = await sendMetaEvent({
          eventName: 'Purchase',
          eventId,
          cliente: clienteSelecionado,
          orcamento: updated,
        });
        await persistMetaEventResult(orcamentoId, {
          eventId,
          eventName: 'Purchase',
          response: metaResult,
        });
      } catch (e) {
        console.warn('[meta-capi] erro ao enviar Purchase (não crítico):', e?.message || e);
      }
      // 3) Gera Contas a Pagar (CMV) e Receber (valor negociado) automaticamente
      await gerarContasAoFinalizar(updated, valorNegociado);
      alert(`Orçamento finalizado!\nForma: ${formaPagamento === 'credit_card' ? `Cartão ${parcelasCartao}x ${bandeiraCartao}` : formaPagamento.toUpperCase()}\nValor final: R$ ${valorNegociado.toFixed(2)}\nContas a pagar e receber geradas.`);
      navigate(`/budgets/${orcamentoId}/view`);
    } catch (err) {
      alert('Erro ao finalizar: ' + (err.message || 'desconhecido'));
    } finally {
      setFinalizando(false);
    }
  };

  // Recalcula valor líquido sempre que forma de pgto / bandeira / parcelas mudam
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (formaPagamento === 'credit_card') {
        const taxa = await taxaCartaoService.getTaxa(bandeiraCartao, parcelasCartao);
        if (!cancelled) {
          setTaxaAplicada(taxa);
          const taxaPct = Number(taxa?.taxa_percentual) || 0;
          setValorLiquido(total * (1 + taxaPct / 100));
        }
      } else if (formaPagamento === 'pix') {
        if (!cancelled) {
          setTaxaAplicada(null);
          setValorLiquido(total * (1 - descontoPixPct / 100));
        }
      } else {
        if (!cancelled) {
          setTaxaAplicada(null);
          setValorLiquido(total);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [formaPagamento, bandeiraCartao, parcelasCartao, descontoPixPct, total]);

  // Parcelas disponíveis baseadas nas taxas cadastradas
  const parcelasDisponiveis = useMemo(() => {
    const set = new Set();
    taxasCartao.forEach((t) => { if (t.bandeira === bandeiraCartao && t.ativa) set.add(t.parcelas); });
    if (set.size === 0) return [1, 2, 3, 6, 10, 12];
    return Array.from(set).sort((a, b) => a - b);
  }, [taxasCartao, bandeiraCartao]);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {showPagamentoModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520,
            boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
          }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Finalizar orçamento</h2>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
              Escolha a forma de pagamento — a taxa de cartão é descontada/aplicada conforme configurado em Taxas de Cartão.
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Forma de pagamento</label>
            <select value={formaPagamento}
              onChange={(e) => { setFormaPagamento(e.target.value); if (e.target.value === 'credit_card') setParcelasCartao(1); }}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
              <option value="credit_card">Cartão de crédito</option>
              <option value="pix">PIX (com desconto)</option>
              <option value="boleto">Boleto</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
            </select>

            {formaPagamento === 'credit_card' && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Bandeira</label>
                <select value={bandeiraCartao} onChange={(e) => setBandeiraCartao(e.target.value)}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
                  {BANDEIRAS_CARTAO.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>

                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Parcelas</label>
                <select value={parcelasCartao} onChange={(e) => setParcelasCartao(Number(e.target.value))}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
                  {parcelasDisponiveis.map((p) => <option key={p} value={p}>{p}x</option>)}
                </select>

                {taxaAplicada && Number(taxaAplicada.taxa_percentual) > 0 && (
                  <div style={{ background: '#fef3c7', padding: 8, borderRadius: 6, fontSize: 12, color: '#854d0e', marginBottom: 12 }}>
                    Taxa cadastrada: <strong>{Number(taxaAplicada.taxa_percentual).toFixed(2)}%</strong> de juros sobre o valor total.
                  </div>
                )}
                {!taxaAplicada && (
                  <div style={{ background: '#fee2e2', padding: 8, borderRadius: 6, fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>
                    Nenhuma taxa cadastrada para {bandeiraCartao} {parcelasCartao}x. Cadastre em Taxas de Cartão antes de finalizar.
                  </div>
                )}
              </>
            )}

            {formaPagamento === 'pix' && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Desconto PIX (%)</label>
                <input type="number" step="0.01" min="0" max="100"
                  value={descontoPixPct} onChange={(e) => setDescontoPixPct(Number(e.target.value))}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
              </>
            )}

            <div style={{ background: '#f0fdf4', border: '1px solid #15803d', padding: 12, borderRadius: 6, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1f2937' }}>
                <span>Valor total:</span><strong>R$ {fmt(total)}</strong>
              </div>
              {formaPagamento === 'credit_card' && taxaAplicada && Number(taxaAplicada.taxa_percentual) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#854d0e', marginTop: 4 }}>
                  <span>Juros ({Number(taxaAplicada.taxa_percentual).toFixed(2)}%):</span>
                  <span>+ R$ {fmt(total * (Number(taxaAplicada.taxa_percentual) / 100))}</span>
                </div>
              )}
              {formaPagamento === 'pix' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#15803d', marginTop: 4 }}>
                  <span>Desconto PIX ({descontoPixPct}%):</span>
                  <span>− R$ {fmt(total * (descontoPixPct / 100))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#15803d', marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0' }}>
                <span>Valor final:</span><span>R$ {fmt(valorLiquido)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPagamentoModal(false)} disabled={finalizando}
                style={{ padding: '10px 16px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleConfirmarPagamento}
                disabled={finalizando}
                style={{
                  padding: '10px 20px',
                  background: finalizando ? '#e5e7eb' : '#15803d',
                  color: finalizando ? '#9ca3af' : 'white',
                  border: 'none', borderRadius: 6,
                  cursor: finalizando ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                }}>{finalizando ? 'Finalizando…' : 'Confirmar e Finalizar'}</button>
            </div>
          </div>
        </div>
      )}
      <header style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{orcamentoId && orcamentoStatus !== 'rascunho' ? `Editar Orçamento #${orcamentoStatus === 'finalizado' ? '✓' : ''}` : 'Novo Orçamento — v2'}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
              Fluxo redesenhado com seletor em cascata{editBudgetId && ' · Modo edição'}
            </p>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            <span>{itens.filter(i => i.tipo !== 'acessorio').length} produto(s) · {itens.filter(i => i.tipo === 'acessorio').length} acessório(s) · Total: <strong style={{ color: '#15803d' }}>R$ {fmt(total)}</strong></span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
        <section>
          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                Cliente
              </label>
              <button
                type="button"
                onClick={() => setMostrarFormCliente(s => !s)}
                style={{ fontSize: 12, color: mostrarFormCliente ? '#dc2626' : '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {mostrarFormCliente ? '× Cancelar' : '+ Cadastrar novo cliente'}
              </button>
            </div>
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', background: 'white' }}
            >
              <option value="">Selecione um cliente…</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clientes.length === 0 && !infoClientes && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                Nenhum cliente cadastrado. Clique em <strong>+ Cadastrar novo cliente</strong> acima.
              </p>
            )}
            {infoClientes && (
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {infoClientes}
              </p>
            )}

            {mostrarFormCliente && (
              <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>
                      Nome <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={novoCliente.name}
                      onChange={e => setNovoCliente(s => ({ ...s, name: e.target.value }))}
                      placeholder="Nome completo"
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>Telefone</label>
                    <input
                      type="tel"
                      value={novoCliente.phone}
                      onChange={e => setNovoCliente(s => ({ ...s, phone: e.target.value }))}
                      placeholder="(11) 99999-9999"
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>CPF</label>
                    <input
                      type="text"
                      value={novoCliente.cpf}
                      onChange={e => setNovoCliente(s => ({ ...s, cpf: e.target.value }))}
                      placeholder="000.000.000-00"
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>E-mail</label>
                    <input
                      type="email"
                      value={novoCliente.email}
                      onChange={e => setNovoCliente(s => ({ ...s, email: e.target.value }))}
                      placeholder="email@exemplo.com"
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>Endereço</label>
                    <input
                      type="text"
                      value={novoCliente.address}
                      onChange={e => setNovoCliente(s => ({ ...s, address: e.target.value }))}
                      placeholder="Rua, número, bairro, cidade"
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {erroCliente && (
                  <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{erroCliente}</p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={salvarNovoCliente}
                    disabled={salvandoCliente || !novoCliente.name.trim()}
                    style={{
                      padding: '8px 16px',
                      background: (!novoCliente.name.trim() || salvandoCliente) ? '#e5e7eb' : '#16a34a',
                      color: (!novoCliente.name.trim() || salvandoCliente) ? '#9ca3af' : 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: (!novoCliente.name.trim() || salvandoCliente) ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: 13
                    }}
                  >
                    {salvandoCliente ? 'Salvando…' : 'Salvar cliente'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMostrarFormCliente(false); setErroCliente(''); }}
                    style={{ padding: '8px 16px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <ProductSelectorCascata
            initialProducts={products}
            onSelect={handleCascataSelect}
            initialSelection={editandoItemId && editandoItemId.startsWith('item-') ? (itemAtual?.selection || null) : null}
            initialCustomizacao={editandoItemId && editandoItemId.startsWith('item-') ? (itemAtual?.customizacao || null) : null}
          />

          {itemAtual && (
            <div style={{ marginTop: 16, padding: 20, background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8 }}>
              <h3 style={{ margin: '0 0 12px', color: '#14532d' }}>Pronto para adicionar</h3>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>{itemAtual.produto.nome}</strong> · <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>{itemAtual.produto.codigo}</code>
              </div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
                {itemAtual.selection.largura}m × {itemAtual.selection.altura}m · Qtd: {itemAtual.selection.quantidade}
                {Object.values(itemAtual.customizacao).filter(Boolean).length > 0 && (
                  <span> · {Object.values(itemAtual.customizacao).filter(Boolean).length} customização(ões)</span>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d', marginBottom: 12 }}>
                R$ {fmt(itemAtual.subtotal)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => editandoItemId && editandoItemId.startsWith('item-') ? atualizarItemProduto() : handleAdicionar()}
                  style={{ padding: '10px 24px', background: editandoItemId && editandoItemId.startsWith('item-') ? '#ca8a04' : '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                >
                  {editandoItemId && editandoItemId.startsWith('item-') ? '✓ Atualizar produto' : 'Adicionar ao orçamento'}
                </button>
                {editandoItemId && editandoItemId.startsWith('item-') && (
                  <button
                    onClick={() => { setItemAtual(null); setEditandoItemId(null); }}
                    style={{ padding: '10px 24px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>
              Adicionar Acessório
            </h3>
            <input
              type="text"
              placeholder="Pesquisar acessório..."
              value={buscaAcessorio}
              onChange={e => setBuscaAcessorio(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', marginBottom: 8 }}
            />
            <select
              value={acessorioAtual.id || ''}
              onChange={e => {
                const acc = acessoriosDisponiveis.find(a => String(a.id) === e.target.value);
                if (acc) selecionarAcessorio(acc);
              }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            >
              <option value="">Selecione um acessório…</option>
              {acessoriosFiltrados.slice(0, 100).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>

            {acessorioAtual.id && (
              <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>{acessorioAtual.name}</strong> · <span style={{ color: '#6b7280' }}>{acessorioAtual.unit}</span>
                  {accSelecionadoInfo && accSelecionadoInfo.precoUnit > 0 && (
                    <span style={{ marginLeft: 8, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      R$ {fmt(accSelecionadoInfo.precoUnit)}/{acessorioAtual.unit}
                    </span>
                  )}
                  {accSelecionadoInfo && accSelecionadoInfo.precoUnit === 0 && (
                    <span style={{ marginLeft: 8, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      ⚠ Sem preço
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Cor</label>
                    <select
                      value={acessorioAtual.color}
                      onChange={e => setAcessorioAtual(s => ({ ...s, color: e.target.value }))}
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                    >
                      <option value="">—</option>
                      {(acessoriosDisponiveis.find(a => a.id === acessorioAtual.id)?.colors || []).map(c => (
                        <option key={c.color} value={c.color}>{c.color}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={acessorioAtual.quantity}
                      onChange={e => setAcessorioAtual(s => ({ ...s, quantity: e.target.value }))}
                      style={{ width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => editandoItemId && editandoItemId.startsWith('acc-') ? atualizarItemAcessorio() : adicionarAcessorio()}
                  disabled={!accSelecionadoInfo || accSelecionadoInfo.precoUnit === 0}
                  style={{
                    marginTop: 12, padding: '8px 16px',
                    background: !accSelecionadoInfo || accSelecionadoInfo.precoUnit === 0 ? '#e5e7eb' : (editandoItemId && editandoItemId.startsWith('acc-') ? '#ca8a04' : '#0ea5e9'),
                    color: !accSelecionadoInfo || accSelecionadoInfo.precoUnit === 0 ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6, cursor: (!accSelecionadoInfo || accSelecionadoInfo.precoUnit === 0) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
                  }}
                >
                  {editandoItemId && editandoItemId.startsWith('acc-') ? '✓ Atualizar acessório' : '+ Adicionar acessório'}
                </button>
                {editandoItemId && editandoItemId.startsWith('acc-') && (
                  <button
                    onClick={() => { setEditandoItemId(null); setAcessorioAtual({ id: null, name: '', unit: '', color: '', quantity: 1 }); }}
                    style={{ marginTop: 12, marginLeft: 8, padding: '8px 16px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ background: 'white', padding: 16, borderRadius: 8, marginTop: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              placeholder="Notas internas sobre o orçamento (opcional)"
            />
          </div>
        </section>

        <aside>
          <div style={{ background: 'white', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'sticky', top: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>
              Itens ({itens.length})
            </h3>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
              Produtos: {fmt(totalProdutos)} · Acessórios: {fmt(totalAcessorios)}
            </div>

            {clienteSelecionado && (
              <div style={{ padding: 8, background: '#eff6ff', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                <strong>Cliente:</strong> {clienteSelecionado.name}
              </div>
            )}

            {itens.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '24px 0' }}>
                Nenhum item adicionado ainda
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 400, overflowY: 'auto' }}>
                {itens.map(i => {
                  const customCount = Object.values(i.customizacao || {}).filter(Boolean).length;
                  const isAcc = i.tipo === 'acessorio';
                  const isEditing = editandoItemId === i.id;
                  return (
                    <li key={i.id} style={{
                      padding: 12, borderBottom: '1px solid #f3f4f6',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
                      background: isEditing ? '#fef9c3' : 'transparent',
                      borderLeft: isEditing ? '3px solid #ca8a04' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isAcc && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>ACC</span>}
                          {i.produto.nome}
                          {isEditing && <span style={{ fontSize: 10, background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>EDITANDO</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {isAcc ? (
                            <>
                              <div>
                                {i.color && <span><strong>Cor:</strong> {i.color} · </span>}
                                <span><strong>Qtd:</strong> {i.quantity}{i.unit ? ` ${i.unit}` : ''}</span>
                                {i.unit && (
                                  <span> · <strong>Unit:</strong> {i.semPreco ? 'A consultar' : `R$ ${fmt(i.unit_price)}/${i.unit}`}</span>
                                )}
                              </div>
                              {i.produto.fornecedor && (
                                <div style={{ marginTop: 2, fontSize: 10, color: '#6b7280' }}>
                                  Fornecedor: {i.produto.fornecedor}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                                <div>{i.selection.largura}m × {i.selection.altura}m · Qtd {i.selection.quantidade}</div>
                                {(i.selection.modelo || i.selection.acionamento) && (
                                  <div style={{ marginTop: 2, color: '#4b5563' }}>
                                    {i.selection.modelo && <span>Modelo: <strong>{i.selection.modelo}</strong></span>}
                                    {i.selection.modelo && i.selection.acionamento && <span> · </span>}
                                    {i.selection.acionamento && <span>Acion: <strong>{i.selection.acionamento}</strong></span>}
                                  </div>
                                )}
                                {i.selection.cor && (
                                  <div style={{ marginTop: 2 }}>Cor: <strong>{i.selection.cor}</strong></div>
                                )}
                                {customCount > 0 && (
                                  <div style={{ marginTop: 2, color: '#6b7280', fontSize: 10 }}>
                                    {Object.entries(i.customizacao || {})
                                      .filter(([, v]) => v)
                                      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
                                      .join(' | ')}
                                  </div>
                                )}
                              </>
                            )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>
                          R$ {fmt(i.subtotal)}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => editarItem(i.id)}
                            style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => removerItem(i.id)}
                            style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '2px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: '#15803d' }}>R$ {fmt(total)}</span>
              </div>
              <button
                onClick={handleSalvar}
                disabled={itens.length === 0 || !clienteId || salvando}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '12px 20px',
                  background: (itens.length === 0 || !clienteId || salvando) ? '#e5e7eb' : '#2563eb',
                  color: (itens.length === 0 || !clienteId || salvando) ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: (itens.length === 0 || !clienteId || salvando) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                {salvando ? 'Salvando…' : (orcamentoId ? 'Salvar alterações' : 'Salvar orçamento')}
              </button>
              <button
                onClick={handleFinalizar}
                disabled={orcamentoStatus === 'finalizado' || finalizando || salvando}
                title="Salva o orçamento como PENDENTE — pronto para enviar ao cliente"
                style={{
                  marginTop: 8, width: '100%', padding: '12px 20px',
                  background: (orcamentoStatus === 'finalizado' || finalizando || salvando) ? '#e5e7eb' : '#16a34a',
                  color: (orcamentoStatus === 'finalizado' || finalizando || salvando) ? '#9ca3af' : 'white',
                  border: 'none', borderRadius: 6,
                  cursor: (orcamentoStatus === 'finalizado' || finalizando || salvando) ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: 14
                }}
              >
                {salvando ? 'Salvando…' : (orcamentoStatus === 'finalizado' ? '✓ Vendido' : '✓ Finalizar (Pendente)')}
              </button>

              {/* Após finalizar (pendente), expõe botão "Marcar como vendido" */}
              {orcamentoId && orcamentoStatus !== 'finalizado' && (
                <button
                  onClick={abrirModalPagamento}
                  style={{
                    marginTop: 6, width: '100%', padding: '8px 14px',
                    background: '#15803d', color: 'white', border: 'none', borderRadius: 6,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}
                  title="Abre o modal de pagamento (cartão/PIX/boleto), gera contas a pagar/receber e dispara Purchase na Meta"
                >
                  💳 Marcar como Vendido (com pagamento)
                </button>
              )}

              {!orcamentoId && (
                <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
                  💾 Será salvo como PENDENTE. Após salvar, marque como vendido quando o cliente pagar.
                </p>
              )}
            </div>
          </div>
        </aside>
      </main>
      {/* Banner de notificação (substitui alert nativo que falha em iframe) */}
      {notificacao && (
        <div
          role="alert"
          style={{
            position: 'fixed', bottom: 16, right: 16, zIndex: 300,
            background: notificacao.tipo === 'erro' ? '#fee2e2' : notificacao.tipo === 'sucesso' ? '#dcfce7' : '#dbeafe',
            color: notificacao.tipo === 'erro' ? '#991b1b' : notificacao.tipo === 'sucesso' ? '#15803d' : '#1e40af',
            border: '1px solid currentColor',
            borderRadius: 8, padding: '12px 16px',
            maxWidth: 480, fontSize: 14, fontWeight: 500,
            boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
          }}
        >
          <button
            onClick={() => setNotificacao(null)}
            style={{
              float: 'right', background: 'transparent', border: 'none',
              color: 'inherit', cursor: 'pointer', marginLeft: 8, fontSize: 16, fontWeight: 700,
            }}
          >×</button>
          {notificacao.mensagem}
        </div>
      )}

      {/* Modal de confirmação custom (substitui window.confirm) */}
      {confirmState && (
        <ConfirmModal
          open={!!confirmState}
          titulo={confirmState.titulo || 'Confirmar'}
          mensagem={confirmState.mensagem}
          onConfirmar={() => onConfirmResposta(true)}
          onCancelar={() => onConfirmResposta(false)}
          textoConfirmar="Salvar e continuar"
          textoCancelar="Cancelar"
          cor="#16a34a"
        />
      )}
    </div>
  );
}

export default OrcamentoV2;
