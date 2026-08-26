import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import './BudgetDetailsPage.css';
import { supabase } from '../supabase/client';
import { buildBudgetItemGroupKey, buildCustomerPdfDescription, buildCustomerHtmlDescription } from '../utils/budgetPresentation';

function BudgetDetailsPage({ companyLogo }) {
  const { budgetId } = useParams();
  const navigate = useNavigate();
  const [budget, setBudget] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessories, setAccessories] = useState([]);
  const [companyData, setCompanyData] = useState(null);
  const contentRef = useRef(null);

  console.log('BudgetDetailsPage rendered with budgetId:', budgetId);

  // O carregamento inicial dos dados do orçamento
  useEffect(() => {
    if (!budgetId) {
      console.error('No budgetId provided');
      setError('Orçamento não encontrado. ID não fornecido.');
      setLoading(false);
      return;
    }

    console.log('Loading budget details for ID:', budgetId);
    const loadBudgetDetails = async () => {
      try {
        console.log('Loading budget details for ID:', budgetId);
        
        // Buscar o orçamento com join para informações do cliente
        const { data: budgetData, error: budgetError } = await supabase
          .from('orcamentos')
          .select(`
            *,
            clientes (
              id,
              name,
              email,
              phone,
              address
            ),
            vendedores (*)
          `)
          .eq('id', budgetId)
          .maybeSingle();

        if (budgetError) throw budgetError;
        
        if (!budgetData) {
          console.error('Orçamento não encontrado ou excluído da base de dados');
          setError('Orçamento não encontrado ou foi excluído da base de dados. Por favor, verifique na lista de orçamentos.');
          setLoading(false);
          return;
        }

        console.log('Budget data loaded:', budgetData);
        
        // Verificar se o cliente do orçamento existe
        if (!budgetData.clientes || !budgetData.clientes.id) {
          console.log('Cliente não encontrado no orçamento ou ID do cliente não informado');
          
          // Se o orçamento tem um cliente_id, mas o join não retornou dados do cliente,
          // buscar o cliente diretamente
          if (budgetData.cliente_id) {
            console.log('Tentando buscar o cliente ID:', budgetData.cliente_id);
            const { data: customerData, error: customerError } = await supabase
              .from('clientes')
              .select('*')
              .eq('id', budgetData.cliente_id)
              .maybeSingle();
              
            if (!customerError && customerData) {
              console.log('Cliente encontrado separadamente:', customerData);
              // Atualizar o orçamento com os dados do cliente
              budgetData.clientes = customerData;
            } else {
              console.error('Erro ao buscar cliente ou cliente não encontrado:', customerError);
            }
          }
        }
        
        // Carregar os acessórios — busca em ambas as tabelas que podem ter sido usadas
        const { data: accessoriesData, error: accessoriesError } = await supabase
          .from('accessories')
          .select('*');

        const { data: produtosAcessoriosData, error: produtosAcessoriosError } = await supabase
          .from('produtos_acessorios')
          .select('*');

        if (accessoriesError && produtosAcessoriosError) throw accessoriesError;
        const allAccessories = [
          ...(accessoriesData || []),
          ...(produtosAcessoriosData || []),
        ];
        console.log('All accessories data:', accessoriesData);

        // Carregar os produtos
        const { data: productsData, error: productsError } = await supabase
          .from('produtos')
          .select('*');

        if (productsError) throw productsError;
        console.log('Products data loaded:', productsData);

        setBudget(budgetData);
        setProducts(productsData);
        setAccessories(allAccessories);
      } catch (error) {
        console.error('Error loading budget details:', error);
        setError(`Erro ao carregar detalhes do orçamento: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    const loadCompanyData = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes')
          .select('*');
        
        if (error) throw error;
        
        // Use the first configuration item if multiple rows are returned
        if (data && data.length > 0) {
          setCompanyData(data[0]);
        } else {
          console.warn('No company configuration found');
        }
      } catch (error) {
        console.error('Error loading company data:', error);
      }
    };

    loadCompanyData();
    loadBudgetDetails();
  }, [budgetId]);

  // Configurar listener para mudanças nos clientes em um useEffect separado
  useEffect(() => {
    if (!budget || !budget.cliente_id) return;
    
    console.log('Configurando listener para cliente ID:', budget.cliente_id);
    
    const customersSubscription = supabase
      .channel('clientes_changes_details')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'clientes' 
        }, 
        (payload) => {
          console.log('Cliente modificado:', payload);
          
          // Verificar se a alteração afeta o cliente deste orçamento
          if (payload.new && payload.new.id === budget.cliente_id) {
            console.log('Atualizando cliente do orçamento atual');
            
            // Se foi uma atualização ou inserção, atualiza o cliente no orçamento
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              setBudget(prev => ({
                ...prev,
                clientes: payload.new
              }));
            } 
            // Se foi uma exclusão, limpa o cliente do orçamento
            else if (payload.eventType === 'DELETE') {
              setBudget(prev => ({
                ...prev,
                clientes: null
              }));
            }
          }
        }
      )
      .subscribe();
      
    return () => {
      customersSubscription.unsubscribe();
    };
  }, [budget?.cliente_id]); // Depende apenas do ID do cliente no orçamento

  const formatCurrency = (value) => {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getProductDetails = (productId) => {
    return products.find(p => p.id === productId) || {};
  };

  const formatProductDisplay = (product, item) => {
    const lines = buildCustomerHtmlDescription(product, item);
    if (lines.length === 0) {
      if (item.produto_id) lines.push(`Produto #${item.produto_id}`);
      else lines.push('Produto sem nome');
    }
    const key = lines.join(' | ');
    const display = (
      <div>
        {lines.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    );
    return { key, display };
  };

  // This function gets the name of an accessory by its ID
  const getAccessoryName = (accessoryId) => {
    if (!accessories || !accessoryId) return 'Acessório não encontrado (ID inválido)';
    
    // Convert IDs to strings for comparison (if they might be different types)
    const accessoryIdStr = String(accessoryId);
    console.log('Looking for accessory ID:', accessoryIdStr);
    console.log('Available accessories:', accessories);
    
    const accessory = accessories.find(a => String(a.id) === accessoryIdStr);
    if (!accessory) {
      console.log('Accessory not found by ID:', accessoryIdStr);
      // Retornar uma mensagem mais informativa incluindo o ID que não foi encontrado
      return `Acessório não encontrado (ID: ${accessoryIdStr}). Verifique se foi excluído.`;
    }
    
    return accessory.name || 'Acessório sem nome';
  };

  const calculateValidadeDate = (createdAt, validadeDias) => {
    return new Date(new Date(createdAt).getTime() + validadeDias * 24 * 60 * 60 * 1000).toLocaleDateString();
  };

  const buildPdfRows = () => {
    const rows = [];
    const groupedProducts = {};
    const items = safeParseArray(budget.produtos_json);
    items.forEach(item => {
      const productDetails = getProductDetails(item.produto_id);
      const description = buildCustomerPdfDescription(productDetails, item);
      const key = buildBudgetItemGroupKey(productDetails, item);
      const quantidade = Number(item.quantidade || item.quantity || 1) || 1;
      const subtotal = Number(item.valor_total || item.subtotal || 0);
      const unitPrice = quantidade > 0 ? subtotal / quantidade : subtotal;
      if (!groupedProducts[key]) {
        groupedProducts[key] = {
          description,
          environment: item.ambiente || '-',
          quantity: quantidade,
          unitPrice,
          totalPrice: subtotal,
        };
      } else {
        groupedProducts[key].quantity += quantidade;
        groupedProducts[key].totalPrice += subtotal;
        groupedProducts[key].unitPrice =
          groupedProducts[key].quantity > 0
            ? groupedProducts[key].totalPrice / groupedProducts[key].quantity
            : groupedProducts[key].totalPrice;
      }
    });

    Object.values(groupedProducts).forEach(group => {
      rows.push([
        group.description,
        group.environment,
        String(group.quantity),
        formatCurrency(group.unitPrice),
        formatCurrency(group.totalPrice)
      ]);
    });

    const acc = safeParseArray(budget.acessorios_json);
    if (acc && acc.length > 0) {
      const groupedAccessories = {};
      acc.forEach(item => {
        // Snapshot do nome (OrcamentoV2 grava 'name'); cai pro lookup no DB se faltar
        const accessoryName = item.name || getAccessoryName(item.accessory_id);
        const colorPart = item.color ? ` — ${item.color}` : '';
        const unitPart = item.unit ? `\n(${item.unit})` : '';
        // unit_price: prioriza o que foi gravado (V2 grava unit_price direto);
        // cai pra subtotal/qtd apenas se unit_price for inválido ou zero e qtd > 0
        let unitPrice = Number(item.unit_price) || 0;
        const qty = Number(item.quantity) || 1;
        const subtotal = Number(item.valor_total || item.subtotal || 0);
        if ((!unitPrice || unitPrice === 0) && qty > 0 && subtotal > 0) {
          unitPrice = subtotal / qty;
        }
        const key = `${item.accessory_id}_${item.color || ''}`;
        if (!groupedAccessories[key]) {
          groupedAccessories[key] = {
            description: `${accessoryName}${colorPart}${unitPart}`,
            quantity: qty,
            unitPrice,
            totalPrice: subtotal,
          };
        } else {
          groupedAccessories[key].quantity += qty;
          groupedAccessories[key].totalPrice += subtotal;
        }
      });
      Object.values(groupedAccessories).forEach(group => {
        rows.push([
          group.description,
          '-',
          String(group.quantity),
          formatCurrency(group.unitPrice),
          formatCurrency(group.totalPrice),
        ]);
      });
    }
    return rows;
  };

  const handlePrintNative = () => {
    window.print();
  };

  const getDataUri = (url) => {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => {
        console.error('Erro ao carregar imagem para PDF');
        resolve(null);
      };
      image.src = url;
    });
  };

  const calculateInstallmentValueFromCondition = (budgetData, pc) => {
    const total = Number(budgetData.valor_negociado) || Number(budgetData.valor_total) || 0;
    const rate = parseFloat(pc.taxRate) || 0;
    const installments = parseInt(pc.installments) || 1;
    const increasedTotal = total * (1 + rate / 100);
    return installments > 0 ? increasedTotal / installments : 0;
  };

  // Wrappers sem "FromCondition" para chamadas sem `pc` específico
  // (usadas em fluxos de pagamento direto sem payment_conditions array).
  const calculateInstallmentValue = (budgetData) => {
    const total = Number(budgetData?.valor_negociado) || Number(budgetData?.valor_total) || 0;
    const rate = parseFloat(budgetData?.payment_tax_rate) || 0;
    const installments = parseInt(budgetData?.payment_installments) || 1;
    const increasedTotal = total * (1 + rate / 100);
    return installments > 0 ? increasedTotal / installments : 0;
  };

  const calculateDiscountValue = (budgetData) => {
    const total = Number(budgetData?.valor_negociado) || Number(budgetData?.valor_total) || 0;
    const discountRate = parseFloat(budgetData?.payment_discount_rate) || 0;
    return total * (1 - discountRate / 100);
  };
  const calculateDiscountValueFromCondition = (budgetData, pc) => {
    const total = Number(budgetData.valor_negociado) || Number(budgetData.valor_total) || 0;
    const discountRate = parseFloat(pc.discountRate) || 0;
    return total * (1 - discountRate / 100);
  };
  // ---------- PDF generation ----------

  // Adiciona logo + dados da empresa no canto superior direito.
  // Retorna a posição Y final pra próximo bloco (async — espera carregar o logo).
  const renderPdfHeader = async (doc) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let yPos = 15;
    let yEnd = yPos;

    if (companyData) {
      const companyInfo = [
        companyData.nome_fantasia,
        companyData.endereco,
        companyData.email,
        `Tel: ${companyData.telefone}`,
      ].filter(Boolean);
      doc.setTextColor(60, 60, 60);
      companyInfo.forEach(line => {
        doc.text(line, 196, yPos, { align: 'right' });
        yPos += 4.5;
      });
      yEnd = Math.max(yEnd, yPos);
    }

    // Logo: try/catch + timeout pra não falhar o PDF inteiro se estiver corrompido.
    if (companyLogo) {
      try {
        const logoData = await Promise.race([
          getDataUri(companyLogo),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);
        if (logoData) doc.addImage(logoData, 'PNG', 14, 10, 50, 25);
      } catch (err) {
        console.warn('[PDF] logo não carregou, segue sem:', err?.message);
      }
    }

    return Math.max(yEnd, 32);
  };

  // Adiciona título + dados do cliente. Retorna Y após o bloco.
  const renderPdfTitleAndCustomer = (doc) => {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 83, 45); // verde escuro (mesmo verde da UI)
    doc.text(`Orçamento #${budget.numero_orcamento || budget.id}`, 14, 45);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${new Date(budget.created_at).toLocaleDateString()}`, 14, 52);
    doc.text(`Válido até: ${calculateValidadeDate(budget.created_at, companyData?.validade_orcamento || 7)}`, 14, 57);

    let yAfterCustomer = 62;
    if (budget.vendedores) {
      doc.text(`Vendedor: ${budget.vendedores.nome}`, 14, 62);
      yAfterCustomer = 67;
    }

    if (budget.clientes) {
      const clienteY = yAfterCustomer;
      doc.setFillColor(239, 246, 255); // azul claro
      doc.rect(14, clienteY, 182, 28, 'F');
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.4);
      doc.rect(14, clienteY, 182, 28);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DADOS DO CLIENTE', 16, clienteY + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Nome: ${budget.clientes.name}`, 16, clienteY + 12);
      doc.text(`Endereço: ${budget.clientes.address || 'Não informado'}`, 16, clienteY + 18);
      const contact = [budget.clientes.phone, budget.clientes.email].filter(Boolean).join(' | ') || '—';
      doc.text(`Contato: ${contact}`, 16, clienteY + 24);
      yAfterCustomer = clienteY + 32;
    }
    return yAfterCustomer;
  };

  // Constrói as linhas do footer (TOTAL, valor negociado, condições de pagamento)
  const buildPdfFooter = () => {
    const rows = [];
    rows.push([
      { content: 'TOTAL:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 253, 244] } },
      { content: formatCurrency(Number(budget.valor_total || 0)), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 253, 244] } },
    ]);

    if (budget.valor_negociado && Number(budget.valor_negociado) !== Number(budget.valor_total)) {
      rows.push([
        { content: 'VALOR NEGOCIADO:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 100, 0] } },
        { content: formatCurrency(budget.valor_negociado), styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 100, 0] } },
      ]);
    }

    const conditions = safeParseArray(budget.payment_conditions);
    const addCondRow = (label, value) => rows.push([
      { content: label, colSpan: 4, styles: { halign: 'right', fontStyle: 'italic', textColor: [80, 80, 80] } },
      { content: value, styles: { halign: 'right', fontStyle: 'italic', textColor: [80, 80, 80] } },
    ]);

    if (Array.isArray(conditions) && conditions.length > 0) {
      conditions.forEach(pc => {
        if (pc.method === 'credit_card') {
          const per = calculateInstallmentValueFromCondition(budget, pc);
          const installments = parseInt(pc.installments) || 1;
          addCondRow(`CONDIÇÃO DE PAGAMENTO (CARTÃO - ${installments}x):`, `${installments}x de ${formatCurrency(per)}`);
          if (parseFloat(pc.taxRate) > 0) {
            addCondRow(`TOTAL COM JUROS (${pc.taxRate}%):`, formatCurrency(per * installments));
          }
        } else if (pc.method === 'pix') {
          addCondRow(`CONDIÇÃO DE PAGAMENTO (PIX - ${pc.discountRate || 0}% DE DESCONTO):`, formatCurrency(calculateDiscountValueFromCondition(budget, pc)));
        }
      });
    } else if (budget.payment_method === 'credit_card') {
      const installmentValue = calculateInstallmentValue(budget);
      const installments = parseInt(budget.payment_installments) || 1;
      addCondRow(`CONDIÇÃO DE PAGAMENTO (CARTÃO - ${installments}x):`, `${installments}x de ${formatCurrency(installmentValue)}`);
      if (parseFloat(budget.payment_tax_rate) > 0) {
        addCondRow(`TOTAL COM JUROS (${budget.payment_tax_rate}%):`, formatCurrency(installmentValue * installments));
      }
    } else if (budget.payment_method === 'pix' && parseFloat(budget.payment_discount_rate) > 0) {
      addCondRow(`CONDIÇÃO DE PAGAMENTO (PIX - ${budget.payment_discount_rate}% DE DESCONTO):`, formatCurrency(calculateDiscountValue(budget)));
    }
    return rows;
  };

  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF();
      const headerEndY = await renderPdfHeader(doc);
      const tableStartY = renderPdfTitleAndCustomer(doc);

      const tableRows = buildPdfRows().map(row => {
        row[0] = row[0].replace(/ \| /g, '\n');
        return row;
      });

      autoTable(doc, {
        startY: Math.max(headerEndY, tableStartY) + 6,
        head: [['DESCRIÇÃO', 'AMBIENTE', 'QTD', 'VALOR UNIT.', 'VALOR TOTAL']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [21, 128, 61], textColor: 255, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 9, cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 32, halign: 'center' },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 27, halign: 'right' },
          4: { cellWidth: 27, halign: 'right' },
        },
        foot: buildPdfFooter(),
        footStyles: { fontSize: 9 },
        margin: { left: 14, right: 14 },
      });

      // Observação do orçamento, se houver (última página).
      const pageCount = doc.internal.getNumberOfPages();
      if (budget?.observacao && String(budget.observacao).trim()) {
        // Posiciona no rodapé da última página.
        const last = pageCount;
        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 240;
        doc.setPage(last);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('OBSERVAÇÕES:', 14, finalY + 10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(doc.splitTextToSize(String(budget.observacao), 180), 14, finalY + 16);
      }

      // Rodapé de paginação
      const finalPageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= finalPageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Emitido em ${new Date().toLocaleString('pt-BR')} · Página ${i} de ${finalPageCount}`,
          105, 290, { align: 'center' },
        );
      }

      doc.save(`orcamento_${budget.numero_orcamento || budget.id}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar PDF. Tente usar a opção de Imprimir.');
    }
  };

  if (loading) return <div className="loading">Carregando detalhes do orçamento...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!budget) return <div className="error">Orçamento não encontrado.</div>;

  const safeParseArray = (raw) => {
    // Pode chegar como: string JSON, objeto/array nativo (PostgREST parseia
    // JSONB automaticamente), null/undefined ou outro tipo. Retorna array
    // sempre que possível, [] em fallback.
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return [];
    if (typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('JSON.parse falhou:', e);
      return [];
    }
  };

  const budgetProducts = safeParseArray(budget.produtos_json);
  const budgetAccessories = safeParseArray(budget.acessorios_json);

  const renderCustomerInfo = () => {
    if (!budget || !budget.clientes) {
      return (
        <div className="customer-info">
          <h3>Cliente</h3>
          <p>Cliente não encontrado ou foi removido</p>
        </div>
      );
    }
    
    return (
      <div className="customer-info">
        <h3>Cliente</h3>
        <p>Nome: {budget.clientes.name}</p>
        <p>Endereço: {budget.clientes.address || 'Não informado'}</p>
        <p>Telefone: {budget.clientes.phone || 'Não informado'}</p>
        <p>Email: {budget.clientes.email || 'Não informado'}</p>
      </div>
    );
  };

  return (
    <div className="budget-details-page">
      <div className="action-buttons-container">
        <button 
          onClick={() => navigate('/budgets')}
          className="back-button"
        >
          &larr; Voltar para Lista de Orçamentos
        </button>
        <button 
          onClick={handlePrintNative}
          className="print-button"
        >
          Imprimir / Salvar PDF
        </button>
      </div>

      <div className="budget-print-layout" ref={contentRef}>
        <div className="company-header">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt="Logo da Empresa" 
              className="budget-logo"
            />
          )}
          {companyData && (
            <div className="company-info">
              <p>{companyData.nome_fantasia}</p>
              <p>{companyData.endereco}</p>
              <p>{companyData.email}</p>
              <p>Tel: {companyData.telefone}</p>
            </div>
          )}
        </div>
        <div className="budget-header">
          <h2>Orçamento #{budget.numero_orcamento || budget.id}</h2>
          <p>Data do Orçamento: {new Date(budget.created_at).toLocaleDateString()}</p>
          <p>Válido até: {calculateValidadeDate(budget.created_at, companyData?.validade_orcamento || 7)}</p>
          {budget.vendedores && (
            <p><strong>Vendedor:</strong> {budget.vendedores.nome}</p>
          )}
        </div>

        {renderCustomerInfo()}

        <div className="budget-items">
          <h3>Itens do Orçamento</h3>
          <table className="budget-table" id="budget-table">
            <colgroup>
              <col className="col-description" />
              <col className="col-environment" />
              <col className="col-quantity" />
              <col className="col-unit-price" />
              <col className="col-total" />
            </colgroup>
            <thead>
              <tr>
                <th className="description">DESCRIÇÃO</th>
                <th className="environment">AMBIENTE</th>
                <th className="quantity">QTD</th>
                <th className="unit-price">VALOR UNIT.</th>
                <th className="total">VALOR TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Group identical products
                const groupedProducts = {};
                
                budgetProducts.forEach(item => {
                  const productDetails = getProductDetails(item.produto_id);
                  const desc = formatProductDisplay(productDetails, item);
                  const key = `${desc.key}|${item.ambiente || ''}`; // Group by description and environment

                  if (!groupedProducts[key]) {
                    groupedProducts[key] = {
                      display: desc.display,
                      quantity: 1,
                      unitPrice: Number(item.valor_total || item.subtotal || 0),
                      totalPrice: Number(item.valor_total || item.subtotal || 0),
                      details: item
                    };
                  } else {
                    groupedProducts[key].quantity += 1;
                    groupedProducts[key].totalPrice += Number(item.valor_total || item.subtotal || 0);
                  }
                });
                
                // Convert back to array for rendering
                return Object.values(groupedProducts).map((group, index) => (
                  <tr key={index}>
                    <td className="description">{group.display}</td>
                    <td className="environment">{group.details.ambiente || '-'}</td>
                    <td className="quantity">{group.quantity}</td>
                    <td className="unit-price">{formatCurrency(group.unitPrice)}</td>
                    <td className="total">{formatCurrency(group.totalPrice)}</td>
                  </tr>
                ));
              })()}
              
              {/* Group identical accessories too */}
              {budgetAccessories && budgetAccessories.length > 0 && (() => {
                const groupedAccessories = {};

                budgetAccessories.forEach(item => {
                  const accessoryName = item.name || getAccessoryName(item.accessory_id);
                  const colorPart = item.color ? ` — ${item.color}` : '';
                  const key = `${item.accessory_id}_${item.color || ''}`;

                  if (!groupedAccessories[key]) {
                    groupedAccessories[key] = {
                      description: `${accessoryName}${colorPart}`,
                      unit: item.unit || '',
                      quantity: item.quantity || 1,
                      unitPrice: item.quantity && item.quantity > 0 ? (Number(item.valor_total || item.subtotal || 0) / item.quantity) : Number(item.valor_total || item.subtotal || 0),
                      totalPrice: Number(item.valor_total || item.subtotal || 0)
                    };
                  } else {
                    groupedAccessories[key].quantity += (item.quantity || 1);
                    groupedAccessories[key].totalPrice += Number(item.valor_total || item.subtotal || 0);
                  }
                });

                return Object.values(groupedAccessories).map((group, index) => (
                  <tr key={`acc-${index}`}>
                    <td className="description">
                      <div>{group.description}</div>
                      {group.unit && <div style={{ fontSize: '0.85em', color: '#6b7280' }}>{group.unit}</div>}
                    </td>
                    <td className="environment">-</td>
                    <td className="quantity">{group.quantity}</td>
                    <td className="unit-price">{formatCurrency(group.unitPrice)}</td>
                    <td className="total">{formatCurrency(group.totalPrice)}</td>
                  </tr>
                ));
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td className="description total-label" colSpan="4">TOTAL:</td>
                <td className="total">{formatCurrency(Number(budget.valor_total || 0))}</td>
              </tr>
              {budget.valor_negociado && Number(budget.valor_negociado) !== Number(budget.valor_total) && (
                <tr>
                  <td className="description total-label" colSpan="4" style={{ color: 'green' }}>VALOR NEGOCIADO:</td>
                  <td className="total" style={{ color: 'green' }}>{formatCurrency(budget.valor_negociado)}</td>
                </tr>
              )}
              {(() => {
                const conditions = safeParseArray(budget.payment_conditions);
                if (Array.isArray(conditions) && conditions.length > 0) {
                  return conditions.map((pc, i) => (
                    <tr key={`pc-${i}`}>
                      <td className="description total-label" colSpan="4" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                        {pc.method === 'credit_card'
                          ? `Condição de Pagamento (Cartão em ${pc.installments}x):`
                          : `Condição de Pagamento (PIX com ${pc.discountRate || 0}% de desconto):`}
                      </td>
                      <td className="total" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                        {pc.method === 'credit_card'
                          ? `${pc.installments}x de ${formatCurrency(calculateInstallmentValueFromCondition(budget, pc))}`
                          : formatCurrency(calculateDiscountValueFromCondition(budget, pc))}
                      </td>
                    </tr>
                  ));
                }
                if (budget.payment_method === 'credit_card') {
                  return (
                    <>
                      <tr>
                        <td className="description total-label" colSpan="4" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                          Condição de Pagamento (Cartão em {budget.payment_installments}x):
                        </td>
                        <td className="total" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                          {budget.payment_installments}x de {formatCurrency(calculateInstallmentValue(budget))}
                        </td>
                      </tr>
                      {parseFloat(budget.payment_tax_rate) > 0 && (
                        <tr>
                          <td className="description total-label" colSpan="4" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                            Total com Juros ({budget.payment_tax_rate}%):
                          </td>
                          <td className="total" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                            {formatCurrency(calculateInstallmentValue(budget) * budget.payment_installments)}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                }
                if (budget.payment_method === 'pix' && parseFloat(budget.payment_discount_rate) > 0) {
                  return (
                    <tr>
                      <td className="description total-label" colSpan="4" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                        Condição de Pagamento (PIX com {budget.payment_discount_rate}% de desconto):
                      </td>
                      <td className="total" style={{ fontStyle: 'italic', fontSize: '0.9em' }}>
                        {formatCurrency(calculateDiscountValue(budget))}
                      </td>
                    </tr>
                  );
                }
                return null;
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      <div className="action-buttons">
        <button className="action-button back-button" onClick={() => navigate('/budgets')}>
           Voltar
        </button>
        <button className="action-button print-button" onClick={handlePrintNative} style={{ marginRight: '10px' }}>
          Imprimir
        </button>
        <button className="action-button print-button" onClick={handleDownloadPDF} style={{ backgroundColor: '#2196F3' }}>
          Baixar PDF
        </button>
      </div>
    </div>
  );
}

export default BudgetDetailsPage;
