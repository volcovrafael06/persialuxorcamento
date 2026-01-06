import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import './BudgetDetailsPage.css';
import { supabase } from '../supabase/client';

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
            )
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
        
        // Carregar os acessórios
        const { data: accessoriesData, error: accessoriesError } = await supabase
          .from('accessories')
          .select('*');

        if (accessoriesError) throw accessoriesError;
        console.log('All accessories data:', accessoriesData);

        // Carregar os produtos
        const { data: productsData, error: productsError } = await supabase
          .from('produtos')
          .select('*');

        if (productsError) throw productsError;
        console.log('Products data loaded:', productsData);

        setBudget(budgetData);
        setProducts(productsData);
        setAccessories(accessoriesData);
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
    const inputWidth = item.input_width || item.inputWidth || item.largura;
    const inputHeight = item.input_height || item.inputHeight || item.altura;
    const dimensions = inputWidth && inputHeight ? `${parseFloat(inputWidth).toFixed(2)}m x ${parseFloat(inputHeight).toFixed(2)}m` : '';

    const baseParts = [];
    // Tenta encontrar o nome em vários lugares, incluindo item.product (que pode conter o objeto completo)
    const nome = product.nome || product.name || item.produto?.nome || item.produto?.name || item.product?.nome || item.product?.name || item.nome || item.name || '';
    
    if (nome) baseParts.push(nome);
    
    if (item.painel && item.num_folhas) {
      baseParts.push('PAINEL');
    } else {
      // Tenta encontrar o modelo em vários lugares
      const modelo = product.modelo || item.produto?.modelo || item.product?.modelo || '';
      if (modelo) baseParts.push(modelo);
    }
    
    // Tenta encontrar o tecido e código
    const tecido = product.tecido || item.produto?.tecido || item.product?.tecido || '';
    if (tecido) baseParts.push(tecido);
    
    const codigo = product.codigo || item.produto?.codigo || item.product?.codigo || '';
    if (codigo) baseParts.push(codigo);

    // Se ainda assim não tiver nada, tenta usar uma descrição genérica se possível
    if (baseParts.length === 0) {
        if (item.produto_id) baseParts.push(`Produto #${item.produto_id}`);
        else baseParts.push('Produto sem nome');
    }

    const line1 = baseParts.join(' - ');

    const line2Parts = [];
    if (dimensions) line2Parts.push(dimensions);
    if (item.bando) line2Parts.push('COM BANDO');
    line2Parts.push(item.instalacao ? 'INSTALADO' : 'SEM INSTALAÇÃO');

    // For panels with multiple sheets, add an extra line
    let extraLine = null;
    if (item.painel && item.num_folhas > 1 && inputWidth && inputHeight) {
      const sheetWidth = (parseFloat(inputWidth) * 1.1 / item.num_folhas).toFixed(2);
      const sheetHeight = parseFloat(inputHeight).toFixed(2);
      extraLine = `Cada folha: ${sheetWidth}m x ${sheetHeight}m (${item.num_folhas} folhas)`;
    }

    const key = [line1, line2Parts.join(' - '), extraLine].filter(Boolean).join(' | ');

    const display = (
      <div>
        <div>{line1}</div>
        <div>{line2Parts.join(' - ')}</div>
        {extraLine && <div>{extraLine}</div>}
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
    const items = JSON.parse(budget.produtos_json || '[]');
    items.forEach(item => {
      const productDetails = getProductDetails(item.produto_id);
      const desc = formatProductDisplay(productDetails, item);
      const key = `${desc.key}|${item.ambiente || ''}`;
      if (!groupedProducts[key]) {
        groupedProducts[key] = {
          description: desc.key,
          environment: item.ambiente || '-',
          quantity: 1,
          unitPrice: Number(item.valor_total || item.subtotal || 0),
          totalPrice: Number(item.valor_total || item.subtotal || 0)
        };
      } else {
        groupedProducts[key].quantity += 1;
        groupedProducts[key].totalPrice += Number(item.valor_total || item.subtotal || 0);
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

    const acc = JSON.parse(budget.acessorios_json || '[]');
    if (acc && acc.length > 0) {
      const groupedAccessories = {};
      acc.forEach(item => {
        const accessoryName = getAccessoryName(item.accessory_id);
        const key = `${item.accessory_id}_${item.color}`;
        const unit = item.quantity && item.quantity > 0
          ? (Number(item.valor_total || item.subtotal || 0) / item.quantity)
          : Number(item.valor_total || item.subtotal || 0);
        if (!groupedAccessories[key]) {
          groupedAccessories[key] = {
            description: accessoryName,
            quantity: item.quantity || 1,
            unitPrice: unit,
            totalPrice: Number(item.valor_total || item.subtotal || 0)
          };
        } else {
          groupedAccessories[key].quantity += (item.quantity || 1);
          groupedAccessories[key].totalPrice += Number(item.valor_total || item.subtotal || 0);
        }
      });
      Object.values(groupedAccessories).forEach(group => {
        rows.push([
          group.description,
          '-',
          String(group.quantity),
          formatCurrency(group.unitPrice),
          formatCurrency(group.totalPrice)
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

  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF();
      
      // Adicionar Logo
      if (companyLogo) {
        const logoData = await getDataUri(companyLogo);
        if (logoData) {
          doc.addImage(logoData, 'PNG', 14, 10, 50, 25);
        }
      }

      // Dados da Empresa (Lado Direito)
      doc.setFontSize(10);
      let yPos = 15;
      if (companyData) {
        const companyInfo = [
          companyData.nome_fantasia,
          companyData.endereco,
          companyData.email,
          `Tel: ${companyData.telefone}`
        ].filter(Boolean);

        companyInfo.forEach(line => {
          doc.text(line, 196, yPos, { align: 'right' });
          yPos += 5;
        });
      }

      // Título do Orçamento
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Orçamento #${budget.numero_orcamento || budget.id}`, 14, 45);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${new Date(budget.created_at).toLocaleDateString()}`, 14, 52);
      doc.text(`Válido até: ${calculateValidadeDate(budget.created_at, companyData?.validade_orcamento || 7)}`, 14, 57);

      // Dados do Cliente
      if (budget.clientes) {
        doc.rect(14, 62, 182, 25);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('DADOS DO CLIENTE', 16, 68);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nome: ${budget.clientes.name}`, 16, 74);
        doc.text(`Endereço: ${budget.clientes.address || 'Não informado'}`, 16, 79);
        doc.text(`Contato: ${budget.clientes.phone || ''} | ${budget.clientes.email || ''}`, 16, 84);
      }

      // Tabela de Itens
      const tableRows = buildPdfRows().map(row => {
        // Formatar descrição para quebrar linhas corretamente no PDF
        row[0] = row[0].replace(/ \| /g, '\n');
        return row;
      });

      autoTable(doc, {
        startY: 95,
        head: [['DESCRIÇÃO', 'AMBIENTE', 'QTD', 'VALOR UNIT.', 'VALOR TOTAL']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 80 }, // Descrição
          1: { cellWidth: 35 }, // Ambiente
          2: { cellWidth: 15, halign: 'center' }, // Qtd
          3: { cellWidth: 25, halign: 'right' }, // Unit
          4: { cellWidth: 25, halign: 'right' }  // Total
        },
        foot: [[
          { content: 'TOTAL:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(Number(budget.valor_total || 0)), styles: { halign: 'right', fontStyle: 'bold' } }
        ]]
      });

      doc.save(`orcamento_${budget.numero_orcamento || budget.id}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar PDF. Tente usar a opção de Imprimir.');
    }
  };

  if (loading) return <div className="loading">Carregando detalhes do orçamento...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!budget) return <div className="error">Orçamento não encontrado.</div>;

  const budgetProducts = JSON.parse(budget.produtos_json || '[]');
  const budgetAccessories = JSON.parse(budget.acessorios_json || '[]');

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
                  const accessoryName = getAccessoryName(item.accessory_id);
                  const key = `${item.accessory_id}_${item.color}`;
                  
                  if (!groupedAccessories[key]) {
                    groupedAccessories[key] = {
                      description: accessoryName,
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
                    <td className="description">{group.description}</td>
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
