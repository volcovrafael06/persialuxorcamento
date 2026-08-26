// src/components/Reports.jsx
//
// Relatórios gerenciais — DRE, lucro por trabalho, performance.
//
// Visão DRE (Demonstração de Resultado):
//   (+) Receita Bruta (orçamentos FINALIZADOS)
//   (-) CMV           (custo dos produtos vendidos)
//   (=) Lucro Bruto
//   (-) Despesas Operacionais (por categoria, do cadastro de despesas)
//   (=) Lucro Líquido
//
// Lucro por trabalho: tabela detalhada por orçamento finalizado.

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';
import { despesaService, CATEGORIAS_DESPESA } from '../services/despesaService';

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${(Number(v) || 0).toFixed(2)}%`;

function inicioDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function fimDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function Reports({ budgets: initialBudgets }) {
  const [periodo, setPeriodo] = useState('mes_atual'); // mes_atual, mes_anterior, custom, ano
  const [inicio, setInicio] = useState(inicioDoMes());
  const [fim, setFim] = useState(fimDoMes());

  const [budgets, setBudgets] = useState(initialBudgets || []);
  const [despesas, setDespesas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    try {
      // Orçamentos finalizados no período
      let q = supabase
        .from('orcamentos')
        .select('*, clientes(name)')
        .order('created_at', { ascending: false });
      if (inicio) q = q.gte('created_at', inicio + 'T00:00:00');
      if (fim) q = q.lte('created_at', fim + 'T23:59:59');
      const { data: bd } = await q;
      setBudgets(bd || []);

      // Despesas
      const ds = await despesaService.getByPeriod({ startDate: inicio, endDate: fim });
      setDespesas(ds);

      // Produtos (para cálculo de CMV)
      const { data: pds } = await supabase.from('produtos').select('id,nome,preco_custo,preco_venda');
      setProdutos(pds || []);
    } catch (err) {
      console.error('[Reports] falha:', err);
      alert('Falha ao carregar relatórios: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function aplicarPeriodo(p) {
    setPeriodo(p);
    const hoje = new Date();
    if (p === 'mes_atual') {
      setInicio(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
      setFim(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else if (p === 'mes_anterior') {
      setInicio(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().slice(0, 10));
      setFim(new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().slice(0, 10));
    } else if (p === 'ano') {
      setInicio(new Date(hoje.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setFim(new Date(hoje.getFullYear(), 11, 31).toISOString().slice(0, 10));
    }
  }

  useEffect(() => {
    if (periodo === 'mes_atual' || periodo === 'mes_anterior' || periodo === 'ano') carregarTudo();
    // eslint-disable-next-line
  }, [periodo, inicio, fim]);

  // ===========================================================================
  // DRE — Calcula CMV a partir dos produtos_json de cada orçamento finalizado.
  // ===========================================================================
  const dre = useMemo(() => {
    const finalizados = budgets.filter((b) => b.status === 'finalizado');
    const Receita = finalizados.reduce((s, b) => s + Number(b.valor_negociado || b.valor_total || 0), 0);

    // CMV: para cada produto em produtos_json, encontrar produto da tabela e usar preco_custo * area/quantidade.
    // Como produtos_json tem valor de venda, mas nem sempre custo, recomputamos aqui.
    let CMV = 0;
    const mapaCustos = {};
    produtos.forEach((p) => { mapaCustos[p.id] = Number(p.preco_custo) || 0; });
    const mapaVenda = {};
    produtos.forEach((p) => { mapaVenda[p.id] = Number(p.preco_venda) || 0; });

    finalizados.forEach((b) => {
      let itens = [];
      try { itens = JSON.parse(b.produtos_json || '[]'); } catch { /* ignore */ }
      itens.forEach((item) => {
        const pid = item.produto_id || item.product?.id || item.id;
        const custoUnit = mapaCustos[pid] || 0;
        const l = Number(item.largura || item.width || 0);
        const a = Number(item.altura || item.height || 0);
        const q = Number(item.quantidade || item.quantity || 1);
        const venda = mapaVenda[pid] || Number(item.subtotal) || 0;
        // Heurística: se venda > 0 e custo > 0, razão = custo/venda; CMV item = venda * razão
        // Senão, fallback: usar venda como CMV (não ideal mas evita quebrar)
        const vendaItem = Number(item.subtotal) || venda;
        const custoItem = vendaItem > 0 && custoUnit > 0 ? vendaItem * (custoUnit / (mapaVenda[pid] || 1)) : 0;
        CMV += custoItem;
      });
    });

    const LucroBruto = Receita - CMV;
    const margemBruta = Receita > 0 ? (LucroBruto / Receita) * 100 : 0;

    // Despesas operacionais
    const despOperacional = despesas
      .filter((d) => d.status === 'pago')
      .reduce((s, d) => s + Number(d.valor || 0), 0);
    const despPendente = despesas
      .filter((d) => d.status === 'pendente')
      .reduce((s, d) => s + Number(d.valor || 0), 0);

    // Por categoria (somente status pago)
    const desp_por_categoria = {};
    despesas
      .filter((d) => d.status === 'pago')
      .forEach((d) => {
        if (desp_por_categoria[d.categoria] == null) desp_por_categoria[d.categoria] = 0;
        desp_por_categoria[d.categoria] += Number(d.valor || 0);
      });

    const LucroLiquido = LucroBruto - despOperacional;
    const margemLiquida = Receita > 0 ? (LucroLiquido / Receita) * 100 : 0;

    return {
      receita_bruta: Receita,
      cmv: CMV,
      lucro_bruto: LucroBruto,
      margem_bruta: margemBruta,
      desp_operacional: despOperacional,
      desp_pendente: despPendente,
      desp_por_categoria,
      lucro_liquido: LucroLiquido,
      margem_liquida: margemLiquida,
      qtd_finalizados: finalizados.length,
      ticket_medio: finalizados.length > 0 ? Receita / finalizados.length : 0,
    };
  }, [budgets, despesas, produtos]);

  const lucroPorTrabalho = useMemo(() => {
    return budgets
      .filter((b) => b.status === 'finalizado')
      .map((b) => {
        const valor = Number(b.valor_negociado || b.valor_total || 0);

        // Acessórios: estão em acessorios_json (unit_price * quantity)
        let receitaAcess = 0;
        try {
          const acess = JSON.parse(b.acessorios_json || '[]');
          acess.forEach((a) => {
            receitaAcess += Number(a.unit_price || 0) * Number(a.quantity || 1);
          });
        } catch { /* ignore */ }

        // CMV: precisa de cada produto no DB
        const mapaCustos = {};
        const mapaVenda = {};
        produtos.forEach((p) => {
          mapaCustos[p.id] = Number(p.preco_custo) || 0;
          mapaVenda[p.id] = Number(p.preco_venda) || 0;
        });
        let custoProdutos = 0;
        let receitaProdutos = 0;
        try {
          const itens = JSON.parse(b.produtos_json || '[]');
          itens.forEach((item) => {
            const pid = item.produto_id || item.product?.id;
            const subtotal = Number(item.subtotal || 0);
            receitaProdutos += subtotal;
            const custo = mapaCustos[pid] || 0;
            const vendaRef = mapaVenda[pid] || 1;
            custoProdutos += subtotal > 0 && custo > 0 ? subtotal * (custo / vendaRef) : subtotal * 0.5; // fallback 50%
          });
        } catch { /* ignore */ }

        const receita = valor > 0 ? valor : receitaProdutos + receitaAcess;
        const lucro = receita - custoProdutos;
        return {
          id: b.id,
          numero: b.numero_orcamento,
          data: b.created_at,
          cliente: b.clientes?.name || 'Sem cliente',
          receita,
          cmv: custoProdutos,
          lucro,
          margem: receita > 0 ? (lucro / receita) * 100 : 0,
        };
      });
  }, [budgets, produtos]);

  // Lucro por mês (visão anual)
  const lucroPorMes = useMemo(() => {
    const m = {};
    budgets
      .filter((b) => b.status === 'finalizado')
      .forEach((b) => {
        const key = (b.created_at || '').slice(0, 7); // YYYY-MM
        if (!key) return;
        m[key] ||= { receita: 0, cmv: 0, lucro: 0, qtd: 0 };
        const valor = Number(b.valor_negociado || b.valor_total || 0);
        m[key].receita += valor;
        m[key].qtd += 1;
      });
    // CMV aproximado (custo = 50% do valor — fallback)
    Object.keys(m).forEach((k) => { m[k].cmv = m[k].receita * 0.5; m[k].lucro = m[k].receita - m[k].cmv; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [budgets]);

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Relatórios & DRE</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            Demonstrativo de Resultados (DRE), lucro por trabalho e tendência mensal.
          </p>
        </div>
        <button onClick={carregarTudo} style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Período:</span>
        <button onClick={() => aplicarPeriodo('mes_atual')} style={btn(periodo === 'mes_atual')}>Mês atual</button>
        <button onClick={() => aplicarPeriodo('mes_anterior')} style={btn(periodo === 'mes_anterior')}>Mês anterior</button>
        <button onClick={() => aplicarPeriodo('ano')} style={btn(periodo === 'ano')}>Ano</button>
        <label style={{ fontSize: 12 }}>Personalizado:&nbsp;
          <input type="date" value={inicio} onChange={(e) => { setPeriodo('custom'); setInicio(e.target.value); }} style={inp} />
          <span style={{ margin: '0 6px' }}>até</span>
          <input type="date" value={fim} onChange={(e) => { setPeriodo('custom'); setFim(e.target.value); }} style={inp} />
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Carregando dados...</div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* DRE                                                        */}
          {/* ============================================================ */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ background: '#1f2937', color: 'white', padding: '12px 16px' }}>
              <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>DRE — Demonstração de Resultado do Exercício</h3>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{inicio} a {fim}</div>
            </div>
            <div style={{ padding: 16 }}>
              <DRELinha label="(+) Receita Bruta (orçamentos finalizados)" valor={dre.receita_bruta} tipo="+info" />
              <DRELinha label="(–) CMV — Custo dos Produtos Vendidos" valor={-dre.cmv} tipo="-info" />
              <DRESubtotal label="(=) Lucro Bruto" valor={dre.lucro_bruto} margem={dre.margem_bruta} />

              <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />

              <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 }}>Despesas Operacionais</div>
              {Object.entries(dre.desp_por_categoria)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, v]) => {
                  const label = (CATEGORIAS_DESPESA.find((c) => c.value === cat) || { label: cat }).label;
                  return <DRELinha key={cat} label={`(–) ${label}`} valor={-v} tipo="-info" />;
                })}
              {dre.desp_pendente > 0 && (
                <DRELinha label={`(–) Despesas a pagar (pendente)`} valor={-dre.desp_pendente} tipo="-alerta" />
              )}
              <DRELinha label={`(=) Total de Despesas Operacionais`} valor={-dre.desp_operacional} tipo="subtotal" />

              <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />

              <DRESubtotal label="(=) Lucro Líquido" valor={dre.lucro_liquido} margem={dre.margem_liquida} destaque />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                <CardSimples titulo="Orçamentos Finalizados" valor={String(dre.qtd_finalizados)} cor="#1f2937" />
                <CardSimples titulo="Ticket Médio" valor={fmtBRL(dre.ticket_medio)} cor="#2563eb" />
                <CardSimples titulo="Margem Líquida" valor={pct(dre.margem_liquida)} cor={dre.lucro_liquido >= 0 ? '#15803d' : '#dc2626'} />
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* LUCRO POR TRABALHO                                          */}
          {/* ============================================================ */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ background: '#f9fafb', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>Lucro por Trabalho (Orçamento)</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={th}>Orç.</th>
                    <th style={th}>Data</th>
                    <th style={th}>Cliente</th>
                    <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                    <th style={{ ...th, textAlign: 'right' }}>CMV</th>
                    <th style={{ ...th, textAlign: 'right' }}>Lucro</th>
                    <th style={{ ...th, textAlign: 'right' }}>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {lucroPorTrabalho.length === 0 ? (
                    <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Nenhum orçamento finalizado no período.</td></tr>
                  ) : lucroPorTrabalho.map((t) => (
                    <tr key={t.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={td}>#{t.numero}</td>
                      <td style={td}>{new Date(t.data).toLocaleDateString('pt-BR')}</td>
                      <td style={td}>{t.cliente}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(t.receita)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#b91c1c' }}>{fmtBRL(t.cmv)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: t.lucro >= 0 ? '#15803d' : '#dc2626' }}>{fmtBRL(t.lucro)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{pct(t.margem)}</td>
                    </tr>
                  ))}
                  {lucroPorTrabalho.length > 0 && (() => {
                    const totReceita = lucroPorTrabalho.reduce((s, t) => s + t.receita, 0);
                    const totCMV = lucroPorTrabalho.reduce((s, t) => s + t.cmv, 0);
                    const totLucro = totReceita - totCMV;
                    return (
                      <tr style={{ background: '#f9fafb', fontWeight: 700, borderTop: '2px solid #1f2937' }}>
                        <td style={td} colSpan={3}>TOTAL ({lucroPorTrabalho.length} orçamentos)</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(totReceita)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#b91c1c' }}>{fmtBRL(totCMV)}</td>
                        <td style={{ ...td, textAlign: 'right', color: totLucro >= 0 ? '#15803d' : '#dc2626' }}>{fmtBRL(totLucro)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{pct(totReceita > 0 ? (totLucro / totReceita) * 100 : 0)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* LUCRO POR MÊS                                                */}
          {/* ============================================================ */}
          {lucroPorMes.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f9fafb', padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', color: '#374151' }}>Receita × Lucro por Mês</h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={th}>Mês</th>
                      <th style={{ ...th, textAlign: 'right' }}>Orçamentos</th>
                      <th style={{ ...th, textAlign: 'right' }}>Receita</th>
                      <th style={{ ...th, textAlign: 'right' }}>Lucro</th>
                      <th style={{ ...th, textAlign: 'right' }}>Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lucroPorMes.map(([mes, d]) => (
                      <tr key={mes} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={td}>{formatarMes(mes)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{d.qtd}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(d.receita)}</td>
                        <td style={{ ...td, textAlign: 'right', color: d.lucro >= 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>{fmtBRL(d.lucro)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{pct(d.receita > 0 ? (d.lucro / d.receita) * 100 : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DRELinha({ label, valor, tipo }) {
  const cor = tipo === 'subtotal' ? '#374151' : tipo === '-alerta' ? '#ca8a04' : '#1f2937';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: cor }}>{label}</span>
      <span style={{ fontSize: 13, color: cor }}>{fmtBRL(valor)}</span>
    </div>
  );
}
function DRESubtotal({ label, valor, margem, destaque }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px',
      background: destaque ? '#ecfdf5' : '#f9fafb', borderRadius: 6, marginTop: 4,
      border: destaque ? '1px solid #15803d' : 'none',
    }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: valor >= 0 ? '#15803d' : '#dc2626' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: valor >= 0 ? '#15803d' : '#dc2626' }}>{fmtBRL(valor)}</span>
        {margem != null && <span style={{ fontSize: 12, color: '#6b7280' }}>({pct(margem)})</span>}
      </div>
    </div>
  );
}
function CardSimples({ titulo, valor, cor }) {
  return (
    <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor, marginTop: 4 }}>{valor}</div>
    </div>
  );
}
function formatarMes(s) {
  if (!s) return '-';
  const [ano, mes] = s.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}
const btn = (active) => ({
  padding: '6px 12px',
  background: active ? '#1f2937' : 'white',
  color: active ? 'white' : '#374151',
  border: '1px solid ' + (active ? '#1f2937' : '#d1d5db'),
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: active ? 600 : 400,
});
const th = { padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid #e5e7eb' };
const td = { padding: '10px 12px', fontSize: 13 };
const inp = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, marginLeft: 4 };
