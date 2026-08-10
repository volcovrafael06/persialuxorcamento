import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductSelectorCascata from '../components/ProductSelectorCascata';
import '../components/ProductSelectorCascata.css';
import { supabase } from '../supabase/client';
import { clienteService } from '../services/clienteService';

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
  const [clienteId, setClienteId] = useState('');
  const [clientes, setClientes] = useState(customers || []);
  const [acessoriosDisponiveis, setAcessoriosDisponiveis] = useState(accessories || []);
  const [itens, setItens] = useState([]);
  const [itemAtual, setItemAtual] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [observacao, setObservacao] = useState('');

  // Cadastro inline de cliente
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ name: '', phone: '', email: '', address: '', cpf: '' });
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [erroCliente, setErroCliente] = useState('');
  const [infoClientes, setInfoClientes] = useState(null);

  // Acessório em construção
  const [acessorioAtual, setAcessorioAtual] = useState({
    id: null,
    name: '',
    unit: '',
    color: '',
    quantity: 1
  });
  const [buscaAcessorio, setBuscaAcessorio] = useState('');

  useEffect(() => {
    if (customers && customers.length > 0) {
      setClientes(customers);
      setInfoClientes(null);
    }
  }, [customers]);

  useEffect(() => {
    if (accessories && accessories.length > 0) setAcessoriosDisponiveis(accessories);
  }, [accessories]);

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

  const acessoriosFiltrados = useMemo(() => {
    const termo = buscaAcessorio.toLowerCase().trim();
    if (!termo) return acessoriosDisponiveis;
    return acessoriosDisponiveis.filter(a =>
      (a.name || '').toLowerCase().includes(termo)
    );
  }, [acessoriosDisponiveis, buscaAcessorio]);

  const selecionarAcessorio = (acc) => {
    setAcessorioAtual({
      id: acc.id,
      name: acc.name,
      unit: acc.unit,
      color: (acc.colors && acc.colors[0]?.color) || '',
      quantity: 1
    });
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

  const adicionarAcessorio = () => {
    if (!acessorioAtual.id) return;
    const acc = acessoriosDisponiveis.find(a => a.id === acessorioAtual.id);
    if (!acc) return;
    const corObj = (acc.colors || []).find(c => c.color === acessorioAtual.color);
    const precoUnit = parseFloat(corObj?.sale_price) || parseFloat(corObj?.cost_price) || 0;
    const subtotal = precoUnit * (parseInt(acessorioAtual.quantity) || 1);
    setItens(prev => [...prev, {
      id: `acc-${Date.now()}`,
      tipo: 'acessorio',
      produto: { nome: acc.name, codigo: acc.id },
      unit: acc.unit,
      color: acessorioAtual.color,
      quantity: parseInt(acessorioAtual.quantity) || 1,
      unit_price: precoUnit,
      subtotal
    }]);
    setAcessorioAtual({ id: null, name: '', unit: '', color: '', quantity: 1 });
  };

  const removerItem = (id) => {
    setItens(prev => prev.filter(i => i.id !== id));
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
    setItemAtual({
      id: `item-${Date.now()}`,
      produto,
      selection: { ...selection },
      customizacao: { ...customizacao },
      subtotal
    });
  };

  const handleAdicionar = () => {
    if (!itemAtual) return;
    setItens(prev => [...prev, itemAtual]);
    setItemAtual(null);
  };

  const handleSalvar = async () => {
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
          customizacao: i.customizacao,
          origem: 'cascata',
          selection: i.selection,
          subtotal: i.subtotal
        }));

      const { data: { user } } = await supabase.auth.getUser();
      const cleanAccessories = itens
        .filter(i => i.tipo === 'acessorio')
        .map(i => ({
          accessory_id: i.id.replace('acc-', ''),
          accessory: { id: i.id.replace('acc-', ''), name: i.produto.nome, unit: i.unit, colors: [] },
          color: i.color,
          unit_price: i.unit_price,
          quantity: i.quantity,
          subtotal: i.subtotal
        }));

      const { data, error } = await supabase
        .from('orcamentos')
        .insert([{
          cliente_id: clienteId,
          vendedor_id: user?.id || null,
          valor_total: total,
          produtos_json: JSON.stringify(cleanProducts),
          acessorios_json: JSON.stringify(cleanAccessories),
          ambientes: JSON.stringify([]),
          observacao: observacao,
          status: 'pendente'
        }])
        .select()
        .single();
      if (error) throw error;
      alert('Orçamento criado com sucesso!');
      navigate(`/budgets/${data.id}/view`);
    } catch (err) {
      alert('Erro ao salvar: ' + (err.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  const clienteSelecionado = clientes.find(c => String(c.id) === String(clienteId));

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Novo Orçamento — v2</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
              Fluxo redesenhado com seletor em cascata
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

          <ProductSelectorCascata initialProducts={products} onSelect={handleCascataSelect} />

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
              <button
                onClick={handleAdicionar}
                style={{ padding: '10px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
              >
                Adicionar ao orçamento
              </button>
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
                  onClick={adicionarAcessorio}
                  style={{ marginTop: 12, padding: '8px 16px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  + Adicionar acessório
                </button>
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
                  return (
                    <li key={i.id} style={{ padding: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isAcc && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>ACC</span>}
                          {i.produto.nome}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {isAcc
                            ? `${i.color || '—'} · ${i.unit} · Qtd ${i.quantity}`
                            : `${i.selection.largura}m × ${i.selection.altura}m · Qtd ${i.selection.quantidade}${customCount > 0 ? ` · ${customCount} custom.` : ''}`
                          }
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>
                          R$ {fmt(i.subtotal)}
                        </div>
                        <button
                          onClick={() => removerItem(i.id)}
                          style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Remover
                        </button>
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
                {salvando ? 'Salvando…' : 'Salvar orçamento'}
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default OrcamentoV2;
