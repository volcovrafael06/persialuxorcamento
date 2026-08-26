// src/components/Despesas.jsx
//
// Cadastro e listagem de despesas operacionais.
// Admin only — RLS já restringe a leitura/escrita.

import React, { useEffect, useMemo, useState } from 'react';
import { despesaService, CATEGORIAS_DESPESA, FORMAS_PAGAMENTO, STATUS_DESPESA } from '../services/despesaService';

const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function inicioDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function Despesas() {
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    inicio: inicioDoMes(),
    fim: hoje(),
    categoria: '',
    status: '',
  });
  const [editando, setEditando] = useState(null); // null | { id?: }
  const [mostrarForm, setMostrarForm] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const lista = await despesaService.getAll();
      setDespesas(lista);
    } catch (err) {
      console.error('[Despesas] falha ao carregar:', err);
      alert('Falha ao carregar despesas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const despesasFiltradas = useMemo(() => {
    return despesas.filter((d) => {
      if (filtros.inicio && d.data_despesa < filtros.inicio) return false;
      if (filtros.fim && d.data_despesa > filtros.fim) return false;
      if (filtros.categoria && d.categoria !== filtros.categoria) return false;
      if (filtros.status && d.status !== filtros.status) return false;
      return true;
    });
  }, [despesas, filtros]);

  const totais = useMemo(() => {
    const t = { total: 0, pago: 0, pendente: 0, cancelado: 0, por_categoria: {} };
    despesasFiltradas.forEach((d) => {
      const v = Number(d.valor) || 0;
      t.total += v;
      if (t.por_categoria[d.categoria] == null) t.por_categoria[d.categoria] = 0;
      t.por_categoria[d.categoria] += v;
      if (d.status === 'pago') t.pago += v;
      else if (d.status === 'pendente') t.pendente += v;
      else if (d.status === 'cancelado') t.cancelado += v;
    });
    return t;
  }, [despesasFiltradas]);

  const handleSalvar = async (form) => {
    try {
      if (editando?.id) await despesaService.update(editando.id, form);
      else await despesaService.create(form);
      setEditando(null);
      setMostrarForm(false);
      await carregar();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  const handleExcluir = async (id) => {
    if (!window.confirm('Excluir essa despesa?')) return;
    try {
      await despesaService.remove(id);
      await carregar();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  if (loading) return <div className="loading">Carregando despesas...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Despesas Operacionais</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Cadastro e controle de despesas para DRE (aluguel, folha, marketing, etc.)
          </p>
        </div>
        <button
          onClick={() => { setEditando({}); setMostrarForm(true); }}
          style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
        >
          + Nova despesa
        </button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <CardResumo titulo="Total" valor={fmtBRL(totais.total)} cor="#1f2937" />
        <CardResumo titulo="Pago" valor={fmtBRL(totais.pago)} cor="#15803d" />
        <CardResumo titulo="Pendente" valor={fmtBRL(totais.pendente)} cor="#ca8a04" />
        <CardResumo titulo="Cancelado" valor={fmtBRL(totais.cancelado)} cor="#dc2626" />
        <CardResumo titulo="Qtd" valor={String(despesasFiltradas.length)} cor="#2563eb" />
      </div>

      {/* Filtros */}
      <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #e5e7eb' }}>
        <label style={{ fontSize: 12 }}>De:&nbsp;
          <input type="date" value={filtros.inicio} onChange={(e) => setFiltros((f) => ({ ...f, inicio: e.target.value }))} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12 }}>Até:&nbsp;
          <input type="date" value={filtros.fim} onChange={(e) => setFiltros((f) => ({ ...f, fim: e.target.value }))} style={inputStyle} />
        </label>
        <label style={{ fontSize: 12 }}>Categoria:&nbsp;
          <select value={filtros.categoria} onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value }))} style={inputStyle}>
            <option value="">Todas</option>
            {CATEGORIAS_DESPESA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Status:&nbsp;
          <select value={filtros.status} onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))} style={inputStyle}>
            <option value="">Todos</option>
            {STATUS_DESPESA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={() => setFiltros({ inicio: inicioDoMes(), fim: hoje(), categoria: '', status: '' })} style={{ ...btnSec, marginLeft: 'auto' }}>Limpar</button>
      </div>

      {/* Formulário */}
      {mostrarForm && (
        <FormDespesa
          inicial={editando}
          onSalvar={handleSalvar}
          onCancelar={() => { setEditando(null); setMostrarForm(false); }}
        />
      )}

      {/* Tabela */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th}>Data</th>
              <th style={th}>Descrição</th>
              <th style={th}>Categoria</th>
              <th style={th}>Forma Pgto</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Valor</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {despesasFiltradas.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Nenhuma despesa no período selecionado.</td></tr>
            ) : despesasFiltradas.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={td}>{d.data_despesa.split('-').reverse().join('/')}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{d.descricao}</div>
                  {d.fornecedor && <div style={{ fontSize: 11, color: '#6b7280' }}>{d.fornecedor}</div>}
                </td>
                <td style={td}>
                  {(CATEGORIAS_DESPESA.find((c) => c.value === d.categoria) || {}).label || d.categoria}
                </td>
                <td style={td}>{(FORMAS_PAGAMENTO.find((f) => f.value === d.forma_pagamento) || {}).label || '-'}</td>
                <td style={td}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: d.status === 'pago' ? '#dcfce7' : d.status === 'pendente' ? '#fef9c3' : '#fee2e2',
                    color:      d.status === 'pago' ? '#15803d' : d.status === 'pendente' ? '#854d0e' : '#b91c1c',
                  }}>
                    {(STATUS_DESPESA.find((s) => s.value === d.status) || {}).label || d.status}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtBRL(d.valor)}</td>
                <td style={td}>
                  <button onClick={() => { setEditando(d); setMostrarForm(true); }} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Editar</button>
                  <button onClick={() => handleExcluir(d.id)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumo por categoria */}
      {Object.keys(totais.por_categoria).length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>Por categoria</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {Object.entries(totais.por_categoria)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, v]) => (
                <div key={cat} style={{ padding: 8, background: '#f9fafb', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{(CATEGORIAS_DESPESA.find((c) => c.value === cat) || {}).label || cat}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{fmtBRL(v)}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, marginLeft: 4 };
const btnSec = { padding: '6px 12px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' };
const td = { padding: '10px 12px', fontSize: 13, color: '#1f2937' };

function CardResumo({ titulo, valor, cor }) {
  return (
    <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

function FormDespesa({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(() => ({
    descricao: '',
    categoria: 'outros',
    valor: '',
    data_despesa: hoje(),
    forma_pagamento: 'pix',
    status: 'pago',
    fornecedor: '',
    nota_fiscal: '',
    observacao: '',
    ...(inicial || {}),
  }));
  const [salvando, setSalvando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.descricao.trim()) { alert('Informe a descrição'); return; }
    if (!form.valor || Number(form.valor) <= 0) { alert('Informe um valor válido'); return; }
    setSalvando(true);
    try {
      await onSalvar({ ...form, valor: Number(form.valor) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{inicial?.id ? 'Editar despesa' : 'Nova despesa'}</h3>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Field label="Descrição *" colSpan={2}>
          <input value={form.descricao} onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))} style={inp} />
        </Field>
        <Field label="Categoria">
          <select value={form.categoria} onChange={(e) => setForm((s) => ({ ...s, categoria: e.target.value }))} style={inp}>
            {CATEGORIAS_DESPESA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Valor (R$) *">
          <input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm((s) => ({ ...s, valor: e.target.value }))} style={inp} />
        </Field>
        <Field label="Data">
          <input type="date" value={form.data_despesa} onChange={(e) => setForm((s) => ({ ...s, data_despesa: e.target.value }))} style={inp} />
        </Field>
        <Field label="Forma Pgto">
          <select value={form.forma_pagamento} onChange={(e) => setForm((s) => ({ ...s, forma_pagamento: e.target.value }))} style={inp}>
            {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))} style={inp}>
            {STATUS_DESPESA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Fornecedor">
          <input value={form.fornecedor} onChange={(e) => setForm((s) => ({ ...s, fornecedor: e.target.value }))} style={inp} />
        </Field>
        <Field label="Nota Fiscal">
          <input value={form.nota_fiscal} onChange={(e) => setForm((s) => ({ ...s, nota_fiscal: e.target.value }))} style={inp} />
        </Field>
        <Field label="Observação" colSpan={3}>
          <textarea rows={2} value={form.observacao} onChange={(e) => setForm((s) => ({ ...s, observacao: e.target.value }))} style={{ ...inp, resize: 'vertical' }} />
        </Field>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancelar} style={btnSec}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, colSpan = 1 }) {
  return (
    <label style={{ gridColumn: `span ${colSpan}`, display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const inp = { width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
