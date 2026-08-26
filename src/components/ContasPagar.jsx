// src/components/ContasPagar.jsx
// Lista + formulário de contas a pagar. Admin-only.

import React, { useEffect, useMemo, useState } from 'react';
import { contasPagarService, STATUS_CP, CATEGORIAS_CP } from '../services/contasPagarService';
import { FORMAS_PAGAMENTO_FIN } from '../services/contasHelpers';

function fmtBRL(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function ContasPagar() {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtros, setFiltros] = useState({
    inicio: new Date().toISOString().slice(0, 8) + '01',
    fim: new Date().toISOString().slice(0, 10),
    status: '',
  });

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    try { setContas(await contasPagarService.getAll()); }
    catch (err) { console.error('Falha:', err); alert(err.message); }
    finally { setLoading(false); }
  };

  const contasFiltradas = useMemo(() => contas.filter((c) => {
    if (filtros.inicio && c.data_vencimento < filtros.inicio) return false;
    if (filtros.fim && c.data_vencimento > filtros.fim) return false;
    if (filtros.status && c.status !== filtros.status) return false;
    return true;
  }), [contas, filtros]);

  const totais = useMemo(() => {
    const t = { total: 0, pendente: 0, pago: 0, atrasado: 0, qtd: 0 };
    contasFiltradas.forEach((c) => {
      t.total += Number(c.valor_total) || 0;
      t.qtd++;
      if (c.status === 'pendente') t.pendente += Number(c.valor_total) || 0;
      else if (c.status === 'pago') t.pago += Number(c.valor_total) || 0;
      else if (c.status === 'atrasado') t.atrasado += Number(c.valor_total) || 0;
    });
    return t;
  }, [contasFiltradas]);

  const handleSalvar = async (form) => {
    try {
      if (editando?.id) await contasPagarService.update(editando.id, form);
      else await contasPagarService.create(form);
      setEditando(null); setMostrarForm(false); await carregar();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleMarcarPago = async (c) => {
    if (!window.confirm('Marcar esta conta como paga hoje?')) return;
    try { await contasPagarService.marcarPago(c.id); await carregar(); }
    catch (err) { alert('Erro: ' + err.message); }
  };

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Contas a Pagar</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Compras, fornecedores, impostos. Estão associadas a produtos.</p>
        </div>
        <button onClick={() => { setEditando({ status: 'pendente', data_emissao: new Date().toISOString().slice(0,10), data_vencimento: new Date().toISOString().slice(0,10) }); setMostrarForm(true); }}
          style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>+ Nova conta a pagar</button>
      </div>

      {/* Totalizadores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Card titulo="Total" valor={fmtBRL(totais.total)} cor="#1f2937" />
        <Card titulo="Pendente" valor={fmtBRL(totais.pendente)} cor="#ca8a04" />
        <Card titulo="Pago" valor={fmtBRL(totais.pago)} cor="#15803d" />
        <Card titulo="Atrasado" valor={fmtBRL(totais.atrasado)} cor="#dc2626" />
      </div>

      {/* Filtros */}
      <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', border: '1px solid #e5e7eb' }}>
        <label style={{ fontSize: 12 }}>Vencidos de:&nbsp;
          <input type="date" value={filtros.inicio} onChange={(e) => setFiltros((f) => ({ ...f, inicio: e.target.value }))} style={inp} />
        </label>
        <label style={{ fontSize: 12 }}>até:&nbsp;
          <input type="date" value={filtros.fim} onChange={(e) => setFiltros((f) => ({ ...f, fim: e.target.value }))} style={inp} />
        </label>
        <label style={{ fontSize: 12 }}>Status:&nbsp;
          <select value={filtros.status} onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))} style={inp}>
            <option value="">Todos</option>
            {STATUS_CP.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={() => setFiltros({ inicio: new Date().toISOString().slice(0,8) + '01', fim: new Date().toISOString().slice(0, 10), status: '' })}
          style={{ ...btnSec, marginLeft: 'auto' }}>Limpar</button>
      </div>

      {mostrarForm && (
        <FormCP inicial={editando} onSalvar={handleSalvar} onCancelar={() => { setEditando(null); setMostrarForm(false); }} />
      )}

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th}>Vencimento</th>
              <th style={th}>Descrição</th>
              <th style={th}>Fornecedor</th>
              <th style={th}>Categoria</th>
              <th style={th}>Parcela</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Valor</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {contasFiltradas.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Nenhuma conta encontrada.</td></tr>
            ) : contasFiltradas.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={td}>{new Date(c.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td style={td}><strong>{c.descricao}</strong></td>
                <td style={td}>{c.fornecedor_nome || '—'}</td>
                <td style={td}>{(CATEGORIAS_CP.find((x) => x.value === c.categoria) || {}).label || c.categoria}</td>
                <td style={td}>{c.numero_parcelas ? `${c.parcela_atual || '?'}/${c.numero_parcelas}` : '—'}</td>
                <td style={td}>
                  <Badge status={c.status} />
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtBRL(c.valor_total)}</td>
                <td style={td}>
                  {c.status !== 'pago' && c.status !== 'cancelado' && (
                    <button onClick={() => handleMarcarPago(c)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 4 }}>Marcar Pago</button>
                  )}
                  <button onClick={() => { setEditando(c); setMostrarForm(true); }} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', marginRight: 4 }}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ status }) {
  const map = {
    pendente: { bg: '#fef9c3', color: '#854d0e' },
    pago:     { bg: '#dcfce7', color: '#15803d' },
    atrasado: { bg: '#fee2e2', color: '#b91c1c' },
    cancelado: { bg: '#e5e7eb', color: '#374151' },
  };
  const s = map[status] || { bg: '#e5e7eb', color: '#374151' };
  const label = (STATUS_CP.find((x) => x.value === status) || {}).label || status;
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>{label}</span>;
}

function Card({ titulo, valor, cor }) {
  return (
    <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

function FormCP({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(() => ({
    descricao: '', categoria: 'compra', valor_total: '',
    fornecedor_nome: '', produto_id: null,
    numero_parcelas: 1, parcela_atual: 1,
    data_emissao: new Date().toISOString().slice(0,10),
    data_vencimento: new Date().toISOString().slice(0,10),
    data_pagamento: null,
    forma_pagamento: 'pix',
    status: 'pendente',
    nota_fiscal: '', observacao: '',
    ...(inicial || {}),
  }));
  const [salvando, setSalvando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try { await onSalvar(form); }
    finally { setSalvando(false); }
  };

  return (
    <form onSubmit={submit} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{form.id ? 'Editar conta a pagar' : 'Nova conta a pagar'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Field label="Descrição *" colSpan={2}>
          <input value={form.descricao} onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))} required style={inpStyle} />
        </Field>
        <Field label="Fornecedor">
          <input value={form.fornecedor_nome || ''} onChange={(e) => setForm((s) => ({ ...s, fornecedor_nome: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Categoria">
          <select value={form.categoria} onChange={(e) => setForm((s) => ({ ...s, categoria: e.target.value }))} style={inpStyle}>
            {CATEGORIAS_CP.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Valor total (R$) *">
          <input type="number" step="0.01" min="0" value={form.valor_total} onChange={(e) => setForm((s) => ({ ...s, valor_total: e.target.value }))} required style={inpStyle} />
        </Field>
        <Field label="Parcelas">
          <input type="number" min="1" max="60" value={form.numero_parcelas} onChange={(e) => setForm((s) => ({ ...s, numero_parcelas: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Parcela atual" >
          <input type="number" min="1" max={form.numero_parcelas || 60} value={form.parcela_atual} onChange={(e) => setForm((s) => ({ ...s, parcela_atual: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} style={inpStyle}>
            {STATUS_CP.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Vencimento">
          <input type="date" value={form.data_vencimento} onChange={(e) => setForm((s) => ({ ...s, data_vencimento: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Emissão">
          <input type="date" value={form.data_emissao} onChange={(e) => setForm((s) => ({ ...s, data_emissao: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Forma Pgto">
          <select value={form.forma_pagamento || 'pix'} onChange={(e) => setForm((s) => ({ ...s, forma_pagamento: e.target.value }))} style={inpStyle}>
            {FORMAS_PAGAMENTO_FIN.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Data Pgto" >
          <input type="date" value={form.data_pagamento || ''} onChange={(e) => setForm((s) => ({ ...s, data_pagamento: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Nota fiscal">
          <input value={form.nota_fiscal || ''} onChange={(e) => setForm((s) => ({ ...s, nota_fiscal: e.target.value }))} style={inpStyle} />
        </Field>
        <Field label="Observação" colSpan={2}>
          <input value={form.observacao || ''} onChange={(e) => setForm((s) => ({ ...s, observacao: e.target.value }))} style={inpStyle} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={btnSec}>Cancelar</button>
        <button type="submit" disabled={salvando} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  );
}

function Field({ label, children, colSpan = 1 }) {
  return <label style={{ gridColumn: `span ${colSpan}`, display: 'block' }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
    {children}
  </label>;
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid #e5e7eb' };
const td = { padding: '10px 12px', fontSize: 13, color: '#1f2937' };
const inp = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, marginLeft: 4 };
const inpStyle = { width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
const btnSec = { padding: '6px 12px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
