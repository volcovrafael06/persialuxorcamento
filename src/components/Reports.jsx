import React, { useState, useEffect } from 'react';
import './Reports.css';
import { supabase } from '../supabase/client';

function Reports({ budgets: initialBudgets }) {
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState([]);
  const [budgets, setBudgets] = useState(initialBudgets || []);
  const [expandedBudgets, setExpandedBudgets] = useState(new Set());
  const [summary, setSummary] = useState({
    totalBudgets: 0,
    finalized: 0,
    pending: 0,
    cancelled: 0,
    averageTicket: 0,
    totalRevenue: 0,
    totalCosts: 0, // Renomeado para totalCOGS (Custo dos Produtos Vendidos)
    totalCOGS: 0, // Custo dos Produtos Vendidos
    grossProfit: 0, // Lucro Bruto
    operatingExpenses: 0, // Despesas Operacionais (inicialmente 0)
    netProfit: 0, // Lucro Líquido
    profitMargin: 0,
    totalInstallation: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchBudgets = async () => {
      try {
        setLoading(true);
        const { data: budgetsData, error } = await supabase
          .from('orcamentos')
          .select(`
            *,
            clientes (
              name
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setBudgets(budgetsData || []);
      } catch (err) {
        console.error('Error fetching budgets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBudgets();
  }, [period, startDate, endDate]); // Dependências mantidas

  useEffect(() => {
    if (budgets.length > 0) {
      processReportData();
    }
  }, [budgets, period, startDate, endDate]);

  const calculateDimensions = (product, width, height) => {
    console.log('Calculando dimensões:', { product, width, height });
    
    const minWidth = parseFloat(product.largura_minima) || 0;
    const minHeight = parseFloat(product.altura_minima) || 0;
    const minArea = parseFloat(product.area_minima) || 0;
    
    let finalWidth = Math.max(parseFloat(width) || 0, minWidth);
    let finalHeight = Math.max(parseFloat(height) || 0, minHeight);
    
    const area = parseFloat(width || 0) * parseFloat(height || 0);
    
    // Calculate the final area
    let finalArea = finalWidth * finalHeight;
    
    // If the calculated area is less than the minimum area, use the exact minimum area value directly
    // This ensures the area matches exactly what's in the database
    if (minArea > 0 && area < minArea) {
      finalArea = minArea;
    }
    
    const usedMinimum = finalWidth > parseFloat(width || 0) || finalHeight > parseFloat(height || 0) || (minArea > 0 && area < minArea);
    
    console.log('Dimensões calculadas:', {
      width: finalWidth,
      height: finalHeight,
      area: finalArea,
      usedMinimum,
      minimos: { minWidth, minHeight, minArea },
      originais: { width, height, area }
    });

    return {
      width: finalWidth,
      height: finalHeight,
      area: finalArea,
      usedMinimum
    };
  };

  const getWavePrice = (height, pricingData) => {
    try {
      const pricing = JSON.parse(pricingData);
      
      // Encontrar a faixa de preço correta baseada na altura
      const priceRange = pricing.find(range => 
        height >= parseFloat(range.min_height) && 
        height <= parseFloat(range.max_height)
      );

      if (!priceRange) {
        console.error('Faixa de preço não encontrada para altura:', height);
        return { cost: 0, value: 0 };
      }

      // Retorna o preço por metro
      return {
        cost: parseFloat(priceRange.price) || 0,
        value: parseFloat(priceRange.sale_price) || 0
      };
    } catch (error) {
      console.error('Erro ao processar wave_pricing_data:', error);
      return { cost: 0, value: 0 };
    }
  };

  const calculateProductCost = async (product) => {
    try {
      console.log('Calculando custo para produto:', product);
      
      // Buscar o produto no banco para obter o preço de custo
      const { data: productData, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('id', product.produto_id)
        .single();

      if (error) {
        console.error('Erro ao buscar produto:', error);
        return {
          productCost: 0,
          productValue: 0,
          bandoCost: 0,
          bandoValue: 0,
          trilhoCost: 0,
          trilhoValue: 0,
          dimensions: { width: 0, height: 0, usedMinimum: false }
        };
      }

      if (!productData) {
        console.error('Produto não encontrado:', product.produto_id);
        return {
          productCost: 0,
          productValue: 0,
          bandoCost: 0,
          bandoValue: 0,
          trilhoCost: 0,
          trilhoValue: 0,
          dimensions: { width: 0, height: 0, usedMinimum: false }
        };
      }

      // Calcular as dimensões considerando os mínimos
      const dimensions = calculateDimensions(
        productData,
        product.largura || product.width,
        product.altura || product.height
      );

      // Calcula o custo baseado no modelo usando as dimensões calculadas
      let productCost = 0;
      let productValue = 0;

      if (productData.modelo?.toUpperCase() === 'WAVE' && productData.wave_pricing_data) {
        // Para WAVE, pegamos o preço da faixa e multiplicamos pela largura
        const { cost, value } = getWavePrice(dimensions.height, productData.wave_pricing_data);
        productCost = cost * dimensions.width;
        productValue = value * dimensions.width;
        
        console.log('Cálculo WAVE:', {
          altura: dimensions.height,
          largura: dimensions.width,
          preco_por_metro: { cost, value },
          custo_final: productCost,
          valor_final: productValue,
          formula: 'preço da faixa * largura'
        });
      } else if (productData.modelo?.toUpperCase() === 'SCREEN') {
        // Para SCREEN, multiplicamos largura x altura
        const costPrice = parseFloat(productData.preco_custo) || 0;
        const salePrice = parseFloat(productData.preco_venda) || 0;
        productCost = dimensions.width * dimensions.height * costPrice;
        productValue = dimensions.width * dimensions.height * salePrice;
        
        console.log('Cálculo SCREEN:', {
          largura: dimensions.width,
          altura: dimensions.height,
          preco_custo: costPrice,
          preco_venda: salePrice,
          custo_final: productCost,
          valor_final: productValue,
          formula: 'largura * altura * preço'
        });
      } else {
        // Para outros modelos, multiplicamos largura x altura
        const costPrice = parseFloat(productData.preco_custo) || 0;
        const salePrice = parseFloat(productData.preco_venda) || 0;
        productCost = dimensions.width * dimensions.height * costPrice;
        productValue = dimensions.width * dimensions.height * salePrice;
        
        console.log('Cálculo Padrão:', {
          largura: dimensions.width,
          altura: dimensions.height,
          preco_custo: costPrice,
          preco_venda: salePrice,
          custo_final: productCost,
          valor_final: productValue,
          formula: 'largura * altura * preço'
        });
      }

      console.log('Custos finais calculados:', {
        produto: { custo: productCost, venda: productValue },
        bando: { custo: 0, venda: 0 },
        trilho: { custo: 0, venda: 0 }
      });

      // Buscar configurações para o preço do bandô e trilho
      const { data: configData } = await supabase
        .from('configuracoes')
        .select('*')
        .single();

      // Buscar preços dos trilhos
      const { data: railPricing } = await supabase
        .from('rail_pricing')
        .select('*');

      let bandoCost = 0;
      let bandoValue = 0;
      let trilhoCost = 0;
      let trilhoValue = 0;

      if (product.bando && configData) {
        bandoCost = dimensions.width * (parseFloat(configData.bando_custo) || 0);
        bandoValue = dimensions.width * (parseFloat(configData.bando_venda) || 0);
      }

      if (product.trilho_tipo && railPricing) {
        // Mapear os tipos de trilho do banco para os tipos do sistema
        const trilhoTypeMap = {
          'trilho_redondo_com_comando': 'trilho_redondo_com_comando',
          'trilho_redondo_sem_comando': 'trilho_redondo_sem_comando',
          'trilho_slim_com_comando': 'trilho_slim_com_comando',
          'trilho_slim_sem_comando': 'trilho_slim_sem_comando',
          'trilho_quadrado_com_rodizio_em_gancho': 'trilho_quadrado_com_rodizio_em_gancho',
          'trilho_motorizado': 'trilho_motorizado'
        };

        const railType = trilhoTypeMap[product.trilho_tipo];
        const railData = railPricing.find(rail => rail.rail_type === railType);

        if (railData) {
          trilhoCost = dimensions.width * (parseFloat(railData.cost_price) || 0);
          trilhoValue = dimensions.width * (parseFloat(railData.sale_price) || 0);
          
          console.log('Cálculo Trilho:', {
            tipo: product.trilho_tipo,
            tipo_banco: railType,
            largura: dimensions.width,
            preco_custo: railData.cost_price,
            preco_venda: railData.sale_price,
            custo_final: trilhoCost,
            valor_final: trilhoValue,
            formula: 'largura * preço'
          });
        } else {
          console.error('Tipo de trilho não encontrado:', product.trilho_tipo);
        }
      }

      console.log('Custos finais calculados:', {
        produto: { custo: productCost, venda: productValue },
        bando: { custo: bandoCost, venda: bandoValue },
        trilho: { custo: trilhoCost, venda: trilhoValue }
      });

      return {
        productCost,
        productValue,
        bandoCost,
        bandoValue,
        trilhoCost,
        trilhoValue,
        dimensions
      };
    } catch (error) {
      console.error('Erro ao calcular custo do produto:', error);
      return {
        productCost: 0,
        productValue: 0,
        bandoCost: 0,
        bandoValue: 0,
        trilhoCost: 0,
        trilhoValue: 0,
        dimensions: { width: 0, height: 0, usedMinimum: false }
      };
    }
  };

  const processReportData = async () => {
    try {
      let filteredBudgets = [...budgets];

      // Aplicar filtros de data se necessário
      if (period === 'custom' && startDate && endDate) {
        filteredBudgets = filteredBudgets.filter(budget => {
          const budgetDate = new Date(budget.created_at);
          return budgetDate >= new Date(startDate) && budgetDate <= new Date(endDate);
        });
      } else if (period === 'monthly') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        filteredBudgets = filteredBudgets.filter(budget => {
          const budgetDate = new Date(budget.created_at);
          return budgetDate >= firstDay;
        });
      }

      // Processar cada orçamento
      const processedBudgets = await Promise.all(
        filteredBudgets.map(async budget => {
          console.log('Processando orçamento:', budget);
          
          // Garantir que produtos_json seja um array
          let produtos = [];
          try {
            produtos = JSON.parse(budget.produtos_json || '[]');
          } catch (error) {
            console.error('Erro ao fazer parse dos produtos:', error);
            produtos = budget.produtos || [];
          }

          // Processar cada produto
          const processedProducts = await Promise.all(
            produtos.map(async (prod) => {
              const productId = prod.product?.id || prod.produto_id;
              console.log('Processando produto:', { prod, productId });

              // Buscar dados do produto
              const { data: productData } = await supabase
                .from('produtos')
                .select('*')
                .eq('id', productId)
                .single();

              console.log('Dados do produto encontrado:', productData);

              // Calcular custos
              const costs = await calculateProductCost({
                ...prod,
                produto_id: productId,
                largura: prod.largura || prod.width,
                altura: prod.altura || prod.height,
                bando: prod.bando,
                trilho_tipo: prod.trilho_tipo,
                instalacao: prod.instalacao,
                valor_instalacao: prod.valor_instalacao
              });

              console.log('Custos calculados:', costs);

              const productTotal = costs.productValue + costs.bandoValue + costs.trilhoValue;
              const productCost = costs.productCost + costs.bandoCost + costs.trilhoCost;
              const installationValue = prod.instalacao ? (parseFloat(prod.valor_instalacao) || 0) : 0;

              return {
                ...prod,
                produto: productData,
                cost: costs,
                total: productTotal + installationValue,
                totalCost: productCost
              };
            })
          );

          // Calcular totais
          let totalCost = 0;
          let totalValue = 0;
          let installationFee = 0;

          processedProducts.forEach(prod => {
            totalCost += prod.totalCost || 0;
            totalValue += prod.total || 0;
            if (prod.instalacao) {
              installationFee += parseFloat(prod.valor_instalacao) || 0;
            }
          });

          const valueWithoutInstallation = totalValue - installationFee;
          const profit = valueWithoutInstallation - totalCost;
          const margin = valueWithoutInstallation > 0 ? (profit / valueWithoutInstallation) * 100 : 0;

          console.log('Totais calculados:', {
            totalCost,
            totalValue,
            installationFee,
            valueWithoutInstallation,
            profit,
            margin
          });

          return {
            ...budget,
            produtos: processedProducts,
            totalCost,
            totalValue,
            installationFee,
            profit,
            margin
          };
        })
      );

      // Calcular estatísticas
      const finalized = processedBudgets.filter(b => b.status === 'finalizado');
      const pending = processedBudgets.filter(b => b.status === 'pendente' || !b.status);
      const canceled = processedBudgets.filter(b => b.status === 'cancelado');

      const totalRevenue = finalized.reduce((sum, b) => sum + (b.totalValue || 0), 0);
      const totalInstallation = finalized.reduce((sum, b) => sum + (b.installationFee || 0), 0);
      const totalCosts = finalized.reduce((sum, b) => sum + (b.totalCost || 0), 0);
      const revenueWithoutInstallation = totalRevenue - totalInstallation;
      const totalProfit = revenueWithoutInstallation - totalCosts;
      const profitMargin = revenueWithoutInstallation > 0 ? (totalProfit / revenueWithoutInstallation) * 100 : 0;

      setSummary({
        total: processedBudgets.length,
        finalized: finalized.length,
        pending: pending.length,
        canceled: canceled.length,
        totalRevenue,
        totalInstallation,
        totalCosts,
        totalProfit,
        profitMargin,
        averageTicket: finalized.length > 0 ? revenueWithoutInstallation / finalized.length : 0
      });

      setReportData(processedBudgets);
    } catch (error) {
      console.error('Erro ao processar dados do relatório:', error);
    }
  };

  const handlePeriodChange = (event) => {
    setPeriod(event.target.value);
    if (event.target.value !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  const toggleProductDetails = (budgetId) => {
    setExpandedBudgets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(budgetId)) {
        newSet.delete(budgetId);
      } else {
        newSet.add(budgetId);
      }
      return newSet;
    });
  };

  return (
    <div className="reports-container">
      <h2>Relatório Gerencial</h2>

      {loading ? (
        <div className="loading-indicator">
          <p>Carregando relatórios...</p>
        </div>
      ) : (
        <>
          <div className="filter-options">
            <label htmlFor="period">Período:</label>
            <select id="period" value={period} onChange={handlePeriodChange}>
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
              <option value="custom">Personalizado</option>
            </select>

            {period === 'custom' && (
              <>
                <label htmlFor="startDate">Data de Início:</label>
                <input 
                  type="date" 
                  id="startDate" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                />

                <label htmlFor="endDate">Data de Término:</label>
                <input 
                  type="date" 
                  id="endDate" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                />
              </>
            )}
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <h3>Visão Geral</h3>
              <p>Total de Orçamentos: {summary.total}</p>
              <p>Finalizados: {summary.finalized}</p>
              <p>Pendentes: {summary.pending}</p>
              <p>Cancelados: {summary.canceled}</p>
            </div>
            
            <div className="summary-card">
              <h3>Desempenho Financeiro</h3>
              <p>Receita Total (com instalação): {(summary.totalRevenue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Receita Total (sem instalação): {((summary.totalRevenue || 0) - (summary.totalInstallation || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Custos Totais: {(summary.totalCosts || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Total Instalação (repasse): {(summary.totalInstallation || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Lucro Total: {(summary.totalProfit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              <p>Margem de Lucro: {(summary.profitMargin || 0).toFixed(2)}%</p>
              <p>Ticket Médio (sem instalação): {(summary.finalized > 0 ? ((summary.totalRevenue || 0) / summary.finalized - (summary.totalInstallation || 0) / summary.finalized) : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
            </div>
          </div>

          <h3>Detalhamento dos Orçamentos Finalizados</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Valor Total</th>
                <th>Valor sem Instalação</th>
                <th>Taxa de Instalação</th>
                <th>Custo Total</th>
                <th>Lucro</th>
                <th>Margem (%)</th>
                <th>Produtos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map(budget => (
                <React.Fragment key={budget.id}>
                  <tr>
                    <td>{new Date(budget.created_at).toLocaleDateString()}</td>
                    <td>{budget.clientes?.name || 'Cliente não encontrado'}</td>
                    <td>{parseFloat(budget.totalValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{parseFloat((budget.totalValue || 0) - (budget.installationFee || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{parseFloat(budget.installationFee || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{parseFloat(budget.totalCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{parseFloat(budget.profit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{budget.margin ? `${budget.margin.toFixed(2)}%` : '0%'}</td>
                    <td>{(budget.produtos || []).length}</td>
                    <td>
                      <button onClick={() => toggleProductDetails(budget.id)}>
                        {expandedBudgets.has(budget.id) ? 'Ocultar' : 'Detalhes'}
                      </button>
                    </td>
                  </tr>
                  {expandedBudgets.has(budget.id) && (
                    <tr className="details-row">
                      <td colSpan="10">
                        <div className="product-details">
                          <h4>Detalhes dos Produtos</h4>
                          <table className="product-details-table">
                            <thead>
                              <tr>
                                <th>Produto</th>
                                <th>Dimensões</th>
                                <th>Custo</th>
                                <th>Valor</th>
                                <th>Lucro</th>
                                <th>Bandô</th>
                                <th>Trilho</th>
                                <th>Instalação</th>
                                <th>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(budget.produtos || []).map((prod, index) => (
                                <tr key={index} className="product-detail-row">
                                  <td>
                                    <strong>{prod.produto?.nome || 'Nome não encontrado'}</strong>
                                    {prod.cost?.dimensions?.usedMinimum && (
                                      <div className="minimum-warning">
                                        Dimensões mínimas aplicadas
                                      </div>
                                    )}
                                  </td>
                                  <td>{prod.largura || prod.width}m x {prod.altura || prod.height}m</td>
                                  <td>{parseFloat(prod.cost?.productCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                  <td>{parseFloat(prod.cost?.productValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                  <td>{parseFloat((prod.cost?.productValue || 0) - (prod.cost?.productCost || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                  <td>
                                    {prod.bando ? (
                                      <div>
                                        <div>Custo: {parseFloat(prod.cost?.bandoCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                        <div>Venda: {parseFloat(prod.cost?.bandoValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                        <div>Lucro: {parseFloat((prod.cost?.bandoValue || 0) - (prod.cost?.bandoCost || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                      </div>
                                    ) : 'Não'}
                                  </td>
                                  <td>
                                    {prod.trilho_tipo ? (
                                      <div>
                                        <div><strong>{prod.trilho_tipo}</strong></div>
                                        <div>Custo: {parseFloat(prod.cost?.trilhoCost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                        <div>Venda: {parseFloat(prod.cost?.trilhoValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                        <div>Lucro: {parseFloat((prod.cost?.trilhoValue || 0) - (prod.cost?.trilhoCost || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                      </div>
                                    ) : 'Não'}
                                  </td>
                                  <td>
                                    {prod.instalacao ? (
                                      <div>
                                        <div>Valor: {parseFloat(prod.valor_instalacao || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                      </div>
                                    ) : 'Não'}
                                  </td>
                                  <td className="product-subtotal">
                                    <strong>{parseFloat(prod.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default Reports;
