// src/components/TaxasCartao.jsx
//
// Cadastro de taxas por bandeira × parcela.
// Migration já popula com seed padrão Brasil.

import React, { useEffect, useMemo, useState } from 'react';
import { taxaCartaoService, BANDEIRAS_CARTAO as BANDEIRAS } from '../services/taxaCartaoService';

export default function TaxasCartao() {
  const [taxas, setTaxas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [nova, setNova] = useState({ bandeira: 'visa', parcelas: 1, taxa_percentual: '', ativa: true });
  const [mostrarNova, setMostrarNova] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const lista = await taxaCartaoService.getAll();
      setTaxas(lista);
    } catch (err) {
      console.error('[TaxasCartao] falha:', err);
      alert('Falha ao carregar taxas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const por_bandeira = useMemo(() => {
    const m = {};
    taxas.forEach((t) => {
      if (m[t.bandeira] == null) m[t.bandeira] = [];
      m[t.bandeira].push(t);
    });
    return m;
  }, [taxas]);

  const handleSalvar = async (item) => {
    try {
      if (item.id) await taxaCartaoService.update(item.id, item);
      else await taxaCartaoService.create(item);
      setEditando(null);
      setMostrarNova(false);
      await carregar();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  const handleExcluir = async (id) => {
    if (!window.confirm('Excluir essa taxa?')) return;
    try {
      await taxaCartaoService.remove(id);
      await carregar();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const handleToggle = async (id, ativa) => {
    try {
      await taxaCartaoService.setAtiva(id, ativa);
      await carregar();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  };

  if (loading) return <div className="loading">Carregando taxas...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Taxas de Cartão</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Configure a taxa por bandeira × número de parcelas. Usada no cálculo de receita líquida (venda com cartão).
          </p>
        </div>
        <button
          onClick={() => { setNova({ bandeira: 'visa', parcelas: 1, taxa_percentual: '', ativa: true }); setMostrarNova(true); }}
          style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
        >
          + Nova taxa
        </button>
      </div>

      {mostrarNova && (
        <FormTaxa
          inicial={nova}
          onSalvar={handleSalvar}
          onCancelar={() => setMostrarNova(false)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {Object.keys(por_bandeira).map((bandeira) => {
          const label = (BANDEIRAS.find((b) => b.value === bandeira) || { label: bandeira }).label;
          const taxasBandeira = por_bandeira[bandeira].sort((a, b) => a.parcelas - b.parcelas);
          return (
            <div key={bandeira} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f9fafb', padding: 10, fontWeight: 600, fontSize: 14, borderBottom: '1px solid #e5e7eb' }}>{label}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={th}>Parc.</th>
                    <th style={{ ...th, textAlign: 'right' }}>Taxa</th>
                    <th style={th}>Ativa</th>
                    <th style={th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {taxasBandeira.map((t) => (
                    <tr key={t.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={td}>{t.parcelas}x</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                        {Number(t.taxa_percentual).toFixed(2)}%
                      </td>
                      <td style={td}>
                        <input type="checkbox" checked={t.ativa} onChange={(e) => handleToggle(t.id, e.target.checked)} />
                      </td>
                      <td style={td}>
                        <button onClick={() => setEditando(t)} style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}>Editar</button>
                        <button onClick={() => handleExcluir(t.id)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {editando && (
        <FormTaxa
          inicial={editando}
          onSalvar={handleSalvar}
          onCancelar={() => setEditando(null)}
        />
      )}

      {taxas.length === 0 && (
        <div style={{ background: 'white', padding: 32, textAlign: 'center', borderRadius: 8, color: '#9ca3af', fontStyle: 'italic', border: '1px dashed #d1d5db' }}>
          Nenhuma taxa configurada. Comece adicionando uma.
        </div>
      )}
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 };
const td = { padding: '8px 10px', fontSize: 13 };

function FormTaxa({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(() => ({
    bandeira: 'visa',
    parcelas: 1,
    taxa_percentual: '',
    ativa: true,
    observacao: '',
    ...(inicial || {}),
  }));
  const [salvando, setSalvando] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (Number(form.taxa_percentual) < 0 || Number(form.taxa_percentual) > 100) {
      alert('Taxa deve estar entre 0% e 100%'); return;
    }
    setSalvando(true);
    try {
      await onSalvar({ ...form, parcelas: Number(form.parcelas), taxa_percentual: Number(form.taxa_percentual) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{form.id ? 'Editar taxa' : 'Nova taxa'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Field label="Bandeira">
          <select value={form.bandeira} onChange={(e) => setForm((s) => ({ ...s, bandeira: e.target.value }))} style={inp} disabled={!!form.id}>
            {BANDEIRAS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Parcelas">
          <input type="number" min="1" max="36" value={form.parcelas} onChange={(e) => setForm((s) => ({ ...s, parcelas: e.target.value }))} style={inp} disabled={!!form.id} />
        </Field>
        <Field label="Taxa (%)">
          <input type="number" step="0.01" min="0" max="100" value={form.taxa_percentual} onChange={(e) => setForm((s) => ({ ...s, taxa_percentual: e.target.value }))} style={inp} />
        </Field>
        <Field label="Ativa">
          <input type="checkbox" checked={form.ativa} onChange={(e) => setForm((s) => ({ ...s, ativa: e.target.checked }))} style={{ width: 18, height: 18 }} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={{ padding: '8px 16px', background: 'white', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
        <button type="submit" disabled={salvando} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const inp = { width: '100%', padding: 6, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' };
