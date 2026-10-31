import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SelectOrCreate from './SelectOrCreate';
import { supabase } from '../supabase/client';
import { localDB } from '../services/localDatabase';
import './Budgets.css';

function Budgets({ budgets, setBudgets, customers: initialCustomers, products: initialProducts, accessories: initialAccessories, setCustomers: updateParentCustomers }) {
  const navigate = useNavigate();
  const { budgetId } = useParams();
  const isEditing = budgetId !== undefined;

  const [newBudget, setNewBudget] = useState({
    customer: null,
    seller: null,
    products: [],
    accessories: [],
    observation: '',
    totalValue: 0,
    negotiatedValue: null,
    paymentMethod: 'standard',
    paymentInstallments: 0,
    paymentTaxRate: 0,
    paymentDiscountRate: 0,
    paymentConditions: []
  });

  const [currentProduct, setCurrentProduct] = useState({
    product: null,
    width: '',
    height: '',
    ambiente: '',
    quantity: 1,
    bando: false,
    bandoValue: 0,
    bandoCusto: 0,
    installation: false,
    installationValue: 0,
    trilho_tipo: '',
    valor_trilho: 0,
    painel: false,
    numFolhas: 1,
    subtotal: 0
  });

  const [currentAccessory, setCurrentAccessory] = useState({
    accessory: null,
    color: '',
    quantity: 1,
    subtotal: 0
  });

  const [localCustomers, setLocalCustomers] = useState([]);
  const [products, setProducts] = useState(initialProducts || []);
  const [accessoriesList, setAccessoriesList] = useState(initialAccessories || []);

  // Sincroniza com o estado global (App.jsx) sempre que ele mudar.
  // Sem isso, um cadastro novo em /products só aparece em /budgets/new após reload.
  useEffect(() => {
    if (initialProducts && initialProducts !== products) {
      setProducts(initialProducts);
    }
  }, [initialProducts]);

  useEffect(() => {
    if (initialAccessories && initialAccessories !== accessoriesList) {
      setAccessoriesList(initialAccessories);
    }
  }, [initialAccessories]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState({ customer: '', product: '', accessory: '' });
  const [bandoConfig, setBandoConfig] = useState({
    custo: 80,
    venda: 120
  });

  // Adicionar novo state para preços dos trilhos
  const [trilhosConfig, setTrilhosConfig] = useState({
    trilho_redondo_comando: { sale_price: 0 },
    trilho_redondo_sem_comando: { sale_price: 0 },
    trilho_slim_comando: { sale_price: 0 },
    trilho_slim_sem_comando: { sale_price: 0 },
    trilho_quadrado_gancho: { sale_price: 0 },
    trilho_motorizado: { sale_price: 0 }
  });
  const [currentPayment, setCurrentPayment] = useState({
    method: 'credit_card',
    installments: 0,
    taxRate: 0,
    discountRate: 0
  });

  const [sellers, setSellers] = useState([]);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('*')
          .order('name');

        if (error) throw error;
        setLocalCustomers(data || []);
        updateParentCustomers?.(data || []); // Update parent state if callback exists
      } catch (error) {
        console.error('Error fetching customers:', error);
        setError('Erro ao carregar clientes');
      }
    };

    const fetchSellers = async () => {
      try {
        const { data, error } = await supabase
          .from('vendedores')
          .select('*')
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setSellers(data || []);
      } catch (error) {
        console.error('Error fetching sellers:', error);
      }
    };

    fetchCustomers();
    fetchSellers();
  }, [updateParentCustomers]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);

        // Clientes: usa prop se vier, senão lê do cache local (nunca SELECT direto
        // pois RLS retorna 42501 sem JWT ativo no momento do mount).
        if (initialCustomers && initialCustomers.length > 0) {
          setLocalCustomers(initialCustomers);
        } else {
          const cached = await localDB.getAll('clientes');
          if (cached.length > 0) setLocalCustomers(cached);
        }

        // Produtos: idem. A prop inicial já reflete o estado global (App.jsx),
        // que é populado por syncAll ou pelo cache local.
        if (initialProducts && initialProducts.length > 0) {
          setProducts(initialProducts);
        } else {
          const cached = await localDB.getAll('produtos');
          if (cached.length > 0) setProducts(cached);
        }

        // Acessórios: idem.
        if (initialAccessories && initialAccessories.length > 0) {
          setAccessoriesList(initialAccessories);
        } else {
          const cached = await localDB.getAll('accessories');
          if (cached.length > 0) setAccessoriesList(cached);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        setError('Erro ao carregar dados iniciais');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [initialCustomers, initialProducts, initialAccessories, updateParentCustomers]);

  useEffect(() => {
    // Sem subscription realtime: dependemos do syncService.syncAll disparado
    // pelo App.jsx, que atualiza o estado global e propaga via props.
    // SELECT direto aqui retornaria 42501 quando o RLS estiver ativo sem JWT.
  }, []);

  useEffect(() => {
    const loadBandoConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes')
          .select('bando_custo, bando_venda')
          .single();

        if (error) throw error;

        if (data) {
          setBandoConfig({
            custo: data.bando_custo || 80,
            venda: data.bando_venda || 120
          });
        }
      } catch (error) {
        console.error('Error loading bando config:', error);
      }
    };

    loadBandoConfig();
  }, []);

  useEffect(() => {
    const loadTrilhosConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('rail_pricing')
          .select('*');

        if (error) throw error;

        if (data) {
          console.log('Configurações dos trilhos carregadas:', data);
          const configMap = {};
          data.forEach(item => {
            configMap[item.rail_type] = {
              sale_price: item.sale_price || 0
            };
          });
          setTrilhosConfig(configMap);
        }
      } catch (error) {
        console.error('Erro ao carregar configurações dos trilhos:', error);
      }
    };

    loadTrilhosConfig();
  }, []);

  const safeParseArray = (raw) => {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('safeParseArray falhou ao converter string:', e);
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    if (isEditing && budgetId) {
      const loadBudgetData = async () => {
        try {
          setLoading(true);
          console.log('Loading budget for editing:', budgetId);
          
          let budget = null;
          try {
            const { data, error } = await supabase
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
                vendedores (
                  id,
                  nome
                )
              `)
              .eq('id', budgetId)
              .maybeSingle();

            if (error) {
              console.warn('Erro ao carregar orçamento do Supabase:', error);
            } else if (data) {
              budget = data;
            }
          } catch (e) {
            console.warn('Falha na chamada do Supabase:', e);
          }

          // Fallback para cache local (IndexedDB) ou props se o Supabase não retornar
          if (!budget) {
            budget = await localDB.get('orcamentos', budgetId);
            if (!budget && budgets && budgets.length > 0) {
              budget = budgets.find(b => String(b.id) === String(budgetId));
            }
          }

          if (!budget) {
            throw new Error(`Orçamento com ID ${budgetId} não foi encontrado.`);
          }
          
          console.log('Loaded budget:', budget);

          // Verificar e recuperar cliente se o join vier vazio mas tiver cliente_id
          let resolvedCustomer = budget.clientes;
          if ((!resolvedCustomer || !resolvedCustomer.id) && budget.cliente_id) {
            resolvedCustomer = (localCustomers || []).find(c => String(c.id) === String(budget.cliente_id));
            if (!resolvedCustomer) {
              resolvedCustomer = await localDB.get('clientes', budget.cliente_id);
            }
            if (!resolvedCustomer) {
              const { data: cData } = await supabase.from('clientes').select('*').eq('id', budget.cliente_id).maybeSingle();
              if (cData) resolvedCustomer = cData;
            }
          }

          // Verificar e recuperar vendedor se o join vier vazio mas tiver vendedor_id
          let resolvedSeller = budget.vendedores;
          if ((!resolvedSeller || !resolvedSeller.id) && budget.vendedor_id) {
            resolvedSeller = (sellers || []).find(s => String(s.id) === String(budget.vendedor_id));
            if (!resolvedSeller) {
              const { data: sData } = await supabase.from('vendedores').select('*').eq('id', budget.vendedor_id).maybeSingle();
              if (sData) resolvedSeller = sData;
            }
          }

          // Obter lista atual de produtos para mapeamento
          let availableProducts = (initialProducts && initialProducts.length > 0) ? initialProducts : products;
          if (!availableProducts || availableProducts.length === 0) {
            availableProducts = await localDB.getAll('produtos');
            if (!availableProducts || availableProducts.length === 0) {
              const { data: pData } = await supabase.from('produtos').select('*');
              if (pData) availableProducts = pData;
            }
            if (availableProducts && availableProducts.length > 0) {
              setProducts(availableProducts);
            }
          }

          // Obter lista atual de acessórios para mapeamento
          let availableAccessories = (initialAccessories && initialAccessories.length > 0) ? initialAccessories : accessoriesList;
          if (!availableAccessories || availableAccessories.length === 0) {
            availableAccessories = await localDB.getAll('accessories');
            if (!availableAccessories || availableAccessories.length === 0) {
              const { data: aData } = await supabase.from('accessories').select('*');
              if (aData) availableAccessories = aData;
            }
            if (availableAccessories && availableAccessories.length > 0) {
              setAccessoriesList(availableAccessories);
            }
          }

          const rawProducts = budget.produtos_json != null ? budget.produtos_json : budget.produtos;
          const rawAccessories = budget.acessorios_json != null ? budget.acessorios_json : budget.acessorios;

          const parsedProducts = safeParseArray(rawProducts);
          const parsedAccessories = safeParseArray(rawAccessories);

          const mappedProducts = parsedProducts.map(p => {
            const prodId = p.produto_id || p.produto?.id || p.id;
            const fullProduct = (availableProducts || []).find(prod => String(prod.id) === String(prodId))
              || p.produto
              || p.product
              || { id: prodId, nome: p.nome || 'Produto' };

            const inW = parseFloat(p.input_width != null ? p.input_width : p.largura) || 0;
            const inH = parseFloat(p.input_height != null ? p.input_height : p.altura) || 0;
            const dims = calculateDimensions(fullProduct, inW, inH, !!p.painel);

            return {
              product: fullProduct,
              produto: fullProduct,
              produto_id: prodId,
              width: dims.width,
              height: dims.height,
              inputWidth: inW,
              inputHeight: inH,
              ambiente: p.ambiente || '',
              quantity: parseInt(p.quantity || p.quantidade) || 1,
              bando: !!p.bando,
              bandoValue: parseFloat(p.valor_bando != null ? p.valor_bando : p.bandoValue) || 0,
              bandoCusto: parseFloat(p.valor_bando_custo != null ? p.valor_bando_custo : p.bandoCusto) || 0,
              installation: !!(p.instalacao != null ? p.instalacao : p.installation),
              installationValue: parseFloat(p.valor_instalacao != null ? p.valor_instalacao : p.installationValue) || 0,
              trilho_tipo: p.trilho_tipo || '',
              valor_trilho: parseFloat(p.valor_trilho) || 0,
              painel: !!p.painel,
              numFolhas: parseInt(p.num_folhas != null ? p.num_folhas : p.numFolhas) || 1,
              subtotal: parseFloat(p.subtotal) || 0,
              usedMinimum: dims.usedMinimum || !!p.usedMinimum,
              area: dims.area
            };
          });

          const mappedAccessories = parsedAccessories.map(a => {
            const accId = a.accessory_id || a.accessory?.id || a.id;
            let fullAccessory = (availableAccessories || []).find(acc => String(acc.id) === String(accId))
              || a.accessory
              || { id: accId, name: a.name || 'Acessório', colors: [] };

            let colors = fullAccessory.colors;
            if (typeof colors === 'string') {
              try { colors = JSON.parse(colors); } catch { colors = []; }
            }
            if (!Array.isArray(colors)) colors = [];
            fullAccessory = { ...fullAccessory, colors };

            return {
              accessory: fullAccessory,
              accessory_id: accId,
              color: a.color || '',
              quantity: parseFloat(a.quantity) || 1,
              subtotal: parseFloat(a.subtotal) || 0
            };
          });

          const paymentConditions = (() => {
            const rawPc = budget.payment_conditions;
            if (Array.isArray(rawPc)) return rawPc;
            if (typeof rawPc === 'string') {
              try {
                const parsed = JSON.parse(rawPc);
                if (Array.isArray(parsed)) return parsed;
              } catch {}
            }
            const arr = [];
            if (budget.payment_method === 'credit_card') {
              arr.push({
                method: 'credit_card',
                installments: parseInt(budget.payment_installments) || 0,
                taxRate: parseFloat(budget.payment_tax_rate) || 0
              });
            } else if (budget.payment_method === 'pix') {
              arr.push({
                method: 'pix',
                discountRate: parseFloat(budget.payment_discount_rate) || 0
              });
            }
            return arr;
          })();

          setNewBudget({
            customer: resolvedCustomer || null,
            seller: resolvedSeller || null,
            vendedor: resolvedSeller || null,
            products: mappedProducts,
            accessories: mappedAccessories,
            observation: budget.observacao || '',
            totalValue: parseFloat(budget.valor_total) || 0,
            negotiatedValue: budget.valor_negociado != null ? parseFloat(budget.valor_negociado) : null,
            paymentMethod: budget.payment_method || 'standard',
            paymentInstallments: parseInt(budget.payment_installments) || 0,
            paymentTaxRate: parseFloat(budget.payment_tax_rate) || 0,
            paymentDiscountRate: parseFloat(budget.payment_discount_rate) || 0,
            paymentConditions
          });
        } catch (error) {
          console.error('Error loading budget:', error);
          setError(`Erro ao carregar orçamento: ${error.message || 'Erro desconhecido'}`);
        } finally {
          setLoading(false);
        }
      };

      loadBudgetData();
    }
  }, [isEditing, budgetId]);

  const calculateDimensions = (product, width, height, isPainel = false) => {
    const inputWidth = parseFloat(width) || 0;
    const inputHeight = parseFloat(height) || 0;

    let minWidth = parseFloat(product.largura_minima) || 0;
    let minHeight = parseFloat(product.altura_minima) || 0;
    let minArea = parseFloat(product.area_minima) || 0;

    // Aplica area_minima genérica (não só hardcoded para 2 SKUs).
    // Se a área digitada é menor que a mínima, ajusta dimensões respeitando
    // a proporção (ou quadrado quando a proporção é ~1:1).
    if (minArea > 0) {
      const currentArea = inputWidth * inputHeight;
      if (currentArea > 0 && currentArea < minArea) {
        if (Math.abs(inputWidth - inputHeight) < 0.1) {
          const side = Math.sqrt(minArea);
          minWidth = side;
          minHeight = side;
        } else if (inputHeight > 0) {
          const ratio = inputWidth / inputHeight;
          const newHeight = Math.sqrt(minArea / ratio);
          const newWidth = newHeight * ratio;
          minWidth = newWidth;
          minHeight = newHeight;
        } else {
          // altura zero mas largura > 0: assume altura = largura (quadrado)
          minWidth = Math.sqrt(minArea);
          minHeight = minWidth;
        }
      }
    }

    // Para exibição, mantemos inputWidth/inputHeight.
    // Para pricing, usamos o piso mínimo quando necessário.
    let finalWidth = Math.max(inputWidth, minWidth);
    let finalHeight = Math.max(inputHeight, minHeight);

    const area = inputWidth * inputHeight;
    const isUsingMinimum = finalWidth > inputWidth || finalHeight > inputHeight;

    // Calcula área final para pricing.
    let finalArea = finalWidth * finalHeight;
    if (minArea > 0 && area < minArea) {
      finalArea = minArea;
    }

    // Aplica 10% de acréscimo por Painel.
    if (isPainel) {
      finalArea = finalArea * 1.1;
    }

    return {
      width: finalWidth,
      height: finalHeight,
      area: finalArea,
      usedMinimum: isUsingMinimum,
      inputWidth,
      inputHeight
    };
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setCurrentProduct(prev => {
      const updates = {
        ...prev,
        [name]: checked
      };

      if (name === 'bando' && checked) {
        // Calculate bando values when checkbox is checked
        const dimensions = calculateDimensions(
          prev.product,
          prev.width,
          prev.height,
          prev.painel
        );
        updates.bandoValue = dimensions.width * bandoConfig.venda;
        updates.bandoCusto = dimensions.width * bandoConfig.custo;
      } else if (name === 'bando' && !checked) {
        // Reset bando values when unchecked
        updates.bandoValue = 0;
        updates.bandoCusto = 0;
      } else if (name === 'painel' && !checked) {
        // Reset numFolhas when Painel is unchecked
        updates.numFolhas = 1;
      }
      
      // Recalculate subtotal whenever checkboxes change
      const newSubtotal = calculateProductSubtotal(updates);
      
      return {
        ...updates,
        subtotal: newSubtotal
      };
    });
  };

  const calculateProductSubtotal = (product = currentProduct) => {
    if (!product || !product.product) return 0;

    let subtotal = 0;
    let basePrice = 0;
    
    const dimensions = calculateDimensions(
      product.product,
      product.inputWidth != null ? product.inputWidth : product.width,
      product.inputHeight != null ? product.inputHeight : product.height,
      product.painel
    );

    const width = dimensions.width;
    const height = dimensions.height;
    const area = dimensions.area;

    console.log('Calculando subtotal:', {
      produto: product.product.nome,
      dimensoes: { width, height, area },
      painel: product.painel ? 'Sim (10% adicional)' : 'Não',
      numFolhas: product.painel ? product.numFolhas : 'N/A',
      trilho: {
        tipo: product.trilho_tipo,
        valor: product.valor_trilho,
        configDisponivel: product.trilho_tipo ? trilhosConfig[product.trilho_tipo] : 'N/A'
      }
    });

    if (product.product?.modelo?.toUpperCase() === 'WAVE') {
      // Para modelo Wave, calcula o preço base pela altura
      let wave_pricing = [];
      const rawWave = product.product.wave_pricing_data;
      if (Array.isArray(rawWave)) {
        wave_pricing = rawWave;
      } else if (typeof rawWave === 'string') {
        try {
          wave_pricing = JSON.parse(rawWave);
        } catch {
          wave_pricing = [];
        }
      }

      const heightInMeters = parseFloat(height) || 0;
      
      for (const tier of wave_pricing) {
        if (heightInMeters >= tier.min_height && heightInMeters <= tier.max_height) {
          basePrice = parseFloat(tier.price) || 0;
          // Aplica margem de lucro
          const margin = parseFloat(product.product.margem_lucro) || 0;
          basePrice = basePrice + (basePrice * margin / 100);
          break;
        }
      }
      
      // Calcula o subtotal baseado na largura
      subtotal = width * basePrice;
      
      console.log('Cálculo base Wave:', {
        largura: width,
        precoBase: basePrice,
        subtotalParcial: subtotal
      });
      
      // Adiciona o valor do trilho se selecionado
      if (product.trilho_tipo && product.valor_trilho > 0) {
        const railVal = parseFloat(product.valor_trilho) || 0;
        console.log('Adicionando valor do trilho:', {
          tipo: product.trilho_tipo,
          valorConfigurado: trilhosConfig[product.trilho_tipo],
          valorCalculado: railVal,
          subtotalAntes: subtotal,
          subtotalDepois: subtotal + railVal
        });
        subtotal += railVal;
      }
    } else {
      const price = parseFloat(product.product.preco_venda) || 0;
      const method = product.product?.metodo_calculo?.toLowerCase();
      const parsedWidth = parseFloat(width) || 0;
      const parsedHeight = parseFloat(height) || 0;

      if (method === 'linear' || method === 'ml') {
        // 'linear' e 'ml' são a mesma coisa: preço por metro linear (largura).
        const widthForCalc = product.painel ? parsedWidth * 1.1 : parsedWidth;
        subtotal = widthForCalc * price;
      } else if (method === 'altura') {
        // Wave: preço varia conforme a altura em tiers (calculado antes neste if).
        // Se chegou aqui, basePrice pode estar 0 (nenhum tier casou).
        if (basePrice === 0) {
          subtotal = parsedWidth * price;
        } else {
          subtotal = parsedWidth * basePrice;
        }
      } else {
        // m² (default): área × preço. area já considera area_minima.
        if (parsedWidth && parsedHeight) {
          subtotal = area * price;
        } else if (parsedWidth) {
          // Fallback quando altura é 0/NULL: usa largura × preço por metro
          // linear como aproximação segura (não zera subtotal silenciosamente).
          subtotal = parsedWidth * price;
        }
      }
    }

    // Adiciona valor do bandô se marcado
    if (product.bando && product.bandoValue) {
      const bandoValue = parseFloat(product.bandoValue) || 0;
      console.log('Adicionando bandô:', {
        valor: bandoValue,
        subtotalAntes: subtotal,
        subtotalDepois: subtotal + bandoValue
      });
      subtotal += bandoValue;
    }

    // Adiciona valor da instalação se marcada
    if (product.installation && product.installationValue) {
      const installationValue = parseFloat(product.installationValue) || 0;
      console.log('Adicionando instalação:', {
        valor: installationValue,
        subtotalAntes: subtotal,
        subtotalDepois: subtotal + installationValue
      });
      subtotal += installationValue;
    }

    console.log('Subtotal final calculado:', subtotal);
    return subtotal;
  };

  useEffect(() => {
    // Recalculate bando value when dimensions change
    if (currentProduct.bando && currentProduct.product && (currentProduct.width || currentProduct.height)) {
      const dimensions = calculateDimensions(
        currentProduct.product,
        currentProduct.width,
        currentProduct.height
      );
      
      setCurrentProduct(prev => {
        const bandoValue = dimensions.width * bandoConfig.venda;
        const bandoCusto = dimensions.width * bandoConfig.custo;
        const updates = {
          ...prev,
          bandoValue,
          bandoCusto
        };
        
        const newSubtotal = calculateProductSubtotal(updates);
        
        return {
          ...updates,
          subtotal: newSubtotal
        };
      });
    }
  }, [currentProduct.width, currentProduct.height, bandoConfig]);

  const calculateRailPrice = (width, railType) => {
    if (!width || !railType) {
      console.log('Faltando dados para cálculo do trilho:', { width, railType });
      return 0;
    }
    
    try {
      // Mapeia o nome do trilho para o tipo correto na tabela rail_pricing
      const railTypeMap = {
        'trilho_redondo_com_comando': 'trilho_redondo_comando',
        'trilho_redondo_sem_comando': 'trilho_redondo_sem_comando',
        'trilho_slim_com_comando': 'trilho_slim_comando',
        'trilho_slim_sem_comando': 'trilho_slim_sem_comando',
        'trilho_quadrado_com_rodizio_em_gancho': 'trilho_quadrado_gancho',
        'trilho_motorizado': 'trilho_motorizado'
      };

      const mappedRailType = railTypeMap[railType] || railType;
      const salePrice = parseFloat(trilhosConfig[mappedRailType]?.sale_price) || 0;
      const parsedWidth = parseFloat(width) || 0;
      
      console.log('Dados para cálculo do trilho:', {
        tipo: railType,
        tipoMapeado: mappedRailType,
        configuracaoTrilhos: trilhosConfig,
        precoVenda: salePrice,
        largura: parsedWidth,
        valorCalculado: parsedWidth * salePrice
      });
      
      return parsedWidth * salePrice;
    } catch (error) {
      console.error('Erro ao calcular preço do trilho:', error);
      return 0;
    }
  };

  const handleRailTypeChange = (e) => {
    const { value } = e.target;
    
    console.log('Mudança de tipo de trilho:', {
      novoTipo: value,
      larguraAtual: currentProduct.width,
      configuracoesDisponiveis: trilhosConfig
    });

    if (!value) {
      setCurrentProduct(prev => ({
        ...prev,
        trilho_tipo: '',
        valor_trilho: 0,
        subtotal: calculateProductSubtotal({ ...prev, trilho_tipo: '', valor_trilho: 0 })
      }));
      return;
    }

    const width = parseFloat(currentProduct.width) || 0;
    const railPrice = calculateRailPrice(width, value);
    
    console.log('Atualizando produto com novo trilho:', {
      tipo: value,
      largura: width,
      valor: railPrice,
      configAtual: trilhosConfig[value]
    });

    setCurrentProduct(prev => {
      const updates = {
        ...prev,
        trilho_tipo: value,
        valor_trilho: railPrice
      };

      const newSubtotal = calculateProductSubtotal(updates);
      console.log('Novo subtotal com trilho:', {
        subtotal: newSubtotal,
        valorTrilho: railPrice,
        detalhes: updates
      });

      return {
        ...updates,
        subtotal: newSubtotal
      };
    });
  };

  const handleProductDimensionChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'width' && currentProduct.product?.modelo?.toUpperCase() === 'WAVE' && currentProduct.trilho_tipo) {
      // Recalcula o preço do trilho quando a largura muda
      const railPrice = calculateRailPrice(value, currentProduct.trilho_tipo);
      
      console.log('Atualizando largura e recalculando trilho:', {
        novaLargura: value,
        novoValorTrilho: railPrice
      });

      setCurrentProduct(prev => {
        const updates = {
          ...prev,
          [name]: value,
          valor_trilho: railPrice
        };
        
        const newSubtotal = calculateProductSubtotal(updates);
        console.log('Novo subtotal após mudança de largura:', newSubtotal);

        return {
          ...updates,
          subtotal: newSubtotal
        };
      });
    } else {
      setCurrentProduct(prev => {
        const updates = {
          ...prev,
          [name]: value
        };
        
        return {
          ...updates,
          subtotal: calculateProductSubtotal(updates)
        };
      });
    }
  };

  const handleInstallationValueChange = (e) => {
    const { value } = e.target;
    setCurrentProduct(prev => {
      const updates = {
        ...prev,
        installationValue: value
      };
      
      // Recalculate subtotal when installation value changes
      const newSubtotal = calculateProductSubtotal(updates);
      
      return {
        ...updates,
        subtotal: newSubtotal
      };
    });
  };

  const handleNumFolhasChange = (value) => {
    const numFolhas = parseInt(value) || 1;
    setCurrentProduct(prev => {
      const updates = {
        ...prev,
        numFolhas
      };
      
      return {
        ...updates,
        subtotal: calculateProductSubtotal(updates)
      };
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setCurrentProduct(prev => ({ ...prev, [name]: newValue }));
  };

  const handleAccessoryInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentAccessory(prev => {
      const updated = { ...prev, [name]: value };
      
      if (updated.accessory && updated.color) {
        // Usar parseFloat para permitir valores decimais (medidas em metros)
        const quantity = parseFloat(updated.quantity) || 1;
        const color = updated.accessory.colors.find(c => c.color === updated.color);
        
        if (color) {
          const price = parseFloat(color.sale_price) || 0;
          // Multiplicar explicitamente o preço pela quantidade (que pode ser decimal)
          updated.subtotal = quantity * price;
          console.log(`Calculando subtotal do acessório: ${quantity} x R$${price} = R$${updated.subtotal}`);
        }
      }
      
      return updated;
    });
  };

  const calculateAccessorySubtotal = () => {
    if (!currentAccessory.accessory || !currentAccessory.color) return;

    // Usar parseFloat para permitir valores decimais (medidas em metros)
    const quantity = parseFloat(currentAccessory.quantity) || 1;
    const color = currentAccessory.accessory.colors.find(c => c.color === currentAccessory.color);

    if (!color) {
      setCurrentAccessory(prev => ({ ...prev, subtotal: 0 }));
      return;
    }

    const price = parseFloat(color.sale_price) || 0;
    const subtotal = quantity * price;
    console.log(`Calculando subtotal do acessório: ${quantity} x R$${price} = R$${subtotal}`);
    
    setCurrentAccessory(prev => ({ ...prev, quantity, subtotal }));
  };

  const handleCustomerChange = (selectedCustomer) => {
    console.log('Cliente selecionado:', selectedCustomer);
    
    if (!selectedCustomer) {
      setNewBudget(prev => ({ ...prev, customer: null }));
      return;
    }
    
    // Se temos apenas o ID do cliente, vamos buscar os dados completos
    if (selectedCustomer.id && (!selectedCustomer.name || !selectedCustomer.email || !selectedCustomer.phone)) {
      console.log('Buscando dados completos do cliente:', selectedCustomer.id);
      
      // Buscar cliente completo do Supabase
      supabase
        .from('clientes')
        .select('*')
        .eq('id', selectedCustomer.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Erro ao buscar cliente completo:', error);
            return;
          }
          
          if (data) {
            console.log('Dados completos do cliente encontrados:', data);
            setNewBudget(prev => ({ ...prev, customer: data }));
          }
        });
    } else {
      // Já temos todos os dados do cliente
      setNewBudget(prev => ({ ...prev, customer: selectedCustomer }));
    }
  };

  const handleCreateCustomer = async (name) => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{
          name,
          email: '',
          phone: '',
          address: '',
          cpf: ''
        }])
        .select()
        .single();

      if (error) throw error;

      setLocalCustomers(prev => [...prev, data]);
      updateParentCustomers?.(prev => [...prev, data]); // Update parent state if callback exists
      return data;
    } catch (error) {
      console.error('Error creating customer:', error);
      setError('Erro ao criar cliente');
      return null;
    }
  };

  const handleProductChange = (selectedProduct) => {
    setCurrentProduct(prev => ({
      ...prev,
      product: selectedProduct,
      width: '',
      height: '',
      ambiente: '',
      bando: false,
      bandoValue: 0,
      bandoCusto: 0,
      installation: false,
      installationValue: 0,
      trilho_tipo: '',
      valor_trilho: 0,
      painel: false,
      numFolhas: 1,
      subtotal: 0
    }));
  };

  const handleAccessoryChange = (selectedAccessory) => {
    setCurrentAccessory(prev => ({
      ...prev,
      accessory: selectedAccessory,
      color: '',
      quantity: 1,
      subtotal: 0
    }));
  };

  const fetchAccessories = async () => {
    try {
      const { data, error } = await supabase
        .from('accessories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        console.log('Fetched accessories:', data);
        setAccessoriesList(data);
      } else {
        console.log('Nenhum acessório encontrado');
        setAccessoriesList([]);
        setError('Nenhum acessório cadastrado. Adicione acessórios na seção de Acessórios primeiro.');
        setTimeout(() => setError(null), 5000); // Limpa a mensagem após 5 segundos
      }
    } catch (error) {
      console.error('Error fetching accessories:', error);
      setError('Erro ao carregar acessórios: ' + error.message);
      setTimeout(() => setError(null), 5000); // Limpa a mensagem após 5 segundos
    }
  };

  useEffect(() => {
    // Primeiro, carregue os acessórios
    fetchAccessories();
    
    // Em seguida, configure um listener em tempo real
    const accessoriesSubscription = supabase
      .channel('accessories_changes')
      .on('postgres_changes', 
        { 
          event: '*', // Escuta todos os eventos (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'accessories' 
        }, 
        (payload) => {
          console.log('Detected change in accessories:', payload);
          // Recarrega todos os acessórios quando houver qualquer alteração
          fetchAccessories();
        }
      )
      .subscribe();

    // Limpar o listener quando o componente for desmontado
    return () => {
      accessoriesSubscription.unsubscribe();
    };
  }, []);

  const handleAddProduct = () => {
    if (!currentProduct.product) {
      setError('Por favor, selecione um produto');
      return;
    }

    const dimensions = calculateDimensions(
      currentProduct.product,
      currentProduct.width,
      currentProduct.height,
      currentProduct.painel
    );

    const productToAdd = {
      ...currentProduct,
      produto: {
        id: currentProduct.product.id,
        nome: currentProduct.product.nome,
        name: currentProduct.product.name,
        modelo: currentProduct.product.modelo,
        tecido: currentProduct.product.tecido,
        codigo: currentProduct.product.codigo
      },
      produto_id: currentProduct.product.id,
      inputWidth: parseFloat(currentProduct.width) || 0,
      inputHeight: parseFloat(currentProduct.height) || 0,
      width: dimensions.width,
      height: dimensions.height,
      area: dimensions.area,
      usedMinimum: dimensions.usedMinimum
    };
    const qty = parseInt(currentProduct.quantity) || 1;
    const updatedProducts = [...newBudget.products];
    for (let i = 0; i < Math.max(1, qty); i++) {
      updatedProducts.push({ ...productToAdd });
    }

    const productsTotal = updatedProducts.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = newBudget.accessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    const newTotal = productsTotal + accessoriesTotal;

    setNewBudget(prev => ({
      ...prev,
      products: updatedProducts,
      totalValue: newTotal
    }));

    setCurrentProduct({
      product: null,
      width: '',
      height: '',
      ambiente: '',
      quantity: 1,
      bando: false,
      bandoValue: 0,
      bandoCusto: 0,
      installation: false,
      installationValue: 0,
      trilho_tipo: '',
      valor_trilho: 0,
      painel: false,
      numFolhas: 1,
      subtotal: 0
    });
  };

  const handleRemoveProduct = (index) => {
    const updatedProducts = newBudget.products.filter((_, i) => i !== index);

    const productsTotal = updatedProducts.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = newBudget.accessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    const newTotal = productsTotal + accessoriesTotal;

    setNewBudget(prev => ({
      ...prev,
      products: updatedProducts,
      totalValue: newTotal
    }));
  };

  const handleEditProduct = (index) => {
    const productToEdit = newBudget.products[index];
    setCurrentProduct(productToEdit);
    
    const updatedProducts = newBudget.products.filter((_, i) => i !== index);
    const productsTotal = updatedProducts.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = newBudget.accessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    
    setNewBudget(prev => ({
      ...prev,
      products: updatedProducts,
      totalValue: productsTotal + accessoriesTotal
    }));
  };

  const handleAddAccessory = () => {
    if (!currentAccessory.accessory || !currentAccessory.color) {
      setError("Por favor, selecione um acessório e uma cor.");
      return;
    }

    // Usar parseFloat para permitir valores decimais (medidas em metros)
    const quantity = parseFloat(currentAccessory.quantity) || 1;
    
    // Recalcular o subtotal para garantir consistência
    const color = currentAccessory.accessory.colors.find(c => c.color === currentAccessory.color);
    let subtotal = currentAccessory.subtotal;
    
    if (color) {
      const price = parseFloat(color.sale_price) || 0;
      subtotal = quantity * price;
    }
    
    const accessoryToAdd = {
      ...currentAccessory,
      quantity,
      subtotal
    };

    const updatedAccessories = [...newBudget.accessories, accessoryToAdd];

    const productsTotal = newBudget.products.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = updatedAccessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    const newTotal = productsTotal + accessoriesTotal;

    setNewBudget(prev => ({
      ...prev,
      accessories: updatedAccessories,
      totalValue: newTotal
    }));

    setCurrentAccessory({
      accessory: null,
      color: '',
      quantity: 1,
      subtotal: 0
    });
  };

  const handleRemoveAccessory = (index) => {
    const updatedAccessories = newBudget.accessories.filter((_, i) => i !== index);

    const productsTotal = newBudget.products.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = updatedAccessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    const newTotal = productsTotal + accessoriesTotal;

    setNewBudget(prev => ({
      ...prev,
      accessories: updatedAccessories,
      totalValue: newTotal
    }));
  };

  const handleEditAccessory = (index) => {
    const accessoryToEdit = newBudget.accessories[index];
    setCurrentAccessory(accessoryToEdit);
    
    const updatedAccessories = newBudget.accessories.filter((_, i) => i !== index);
    const productsTotal = newBudget.products.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
    const accessoriesTotal = updatedAccessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
    
    setNewBudget(prev => ({
      ...prev,
      accessories: updatedAccessories,
      totalValue: productsTotal + accessoriesTotal
    }));
  };

  const handleFinalizeBudget = async (e) => {
    e.preventDefault();

    if (!newBudget.customer) {
      setError("Por favor, selecione um cliente.");
      return;
    }

    if (newBudget.products.length === 0 && newBudget.accessories.length === 0) {
      setError("Por favor, adicione pelo menos um produto ou acessório.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const cleanProducts = newBudget.products.map(product => {
        const prodId = product.product?.id || product.produto_id || product.produto?.id;
        const prodObj = product.product || product.produto || {};
        return {
          produto_id: prodId,
          produto: {
            id: prodId,
            nome: prodObj.nome || prodObj.name || '',
            modelo: prodObj.modelo || '',
            tecido: prodObj.tecido || '',
            codigo: prodObj.codigo || '',
            metodo_calculo: prodObj.metodo_calculo || ''
          },
          largura: parseFloat(product.width) || 0,
          altura: product.height ? parseFloat(product.height) : null,
          input_width: parseFloat(product.inputWidth != null ? product.inputWidth : product.width) || 0,
          input_height: product.inputHeight ? parseFloat(product.inputHeight) : (product.height ? parseFloat(product.height) : null),
          ambiente: product.ambiente || '',
          bando: !!product.bando,
          valor_bando: parseFloat(product.bandoValue) || 0,
          valor_bando_custo: parseFloat(product.bandoCusto) || 0,
          instalacao: !!product.installation,
          valor_instalacao: parseFloat(product.installationValue) || 0,
          trilho_tipo: product.trilho_tipo || '',
          valor_trilho: parseFloat(product.valor_trilho) || 0,
          painel: !!product.painel,
          num_folhas: parseInt(product.numFolhas) || 1,
          subtotal: parseFloat(product.subtotal) || 0
        };
      });

      const cleanAccessories = newBudget.accessories.map(accessory => {
        const accId = accessory.accessory?.id || accessory.accessory_id;
        return {
          accessory_id: accId,
          color: accessory.color || '',
          quantity: parseFloat(accessory.quantity) || 1,
          subtotal: parseFloat(accessory.subtotal) || 0
        };
      });

      const nowIso = new Date().toISOString();

      const budgetData = {
        cliente_id: newBudget.customer?.id,
        vendedor_id: newBudget.seller?.id || newBudget.vendedor?.id || null,
        valor_total: newBudget.totalValue,
        produtos_json: JSON.stringify(cleanProducts),
        observacao: newBudget.observation || '',
        acessorios_json: JSON.stringify(cleanAccessories),
        valor_negociado: newBudget.negotiatedValue,
        status: 'pendente', // Ao criar ou editar, o orçamento volta a ficar válido (pendente)
        created_at: nowIso, // Ao editar, renova a data de emissão/criação para reiniciar o prazo de validade
        updated_at: nowIso,
        payment_method: (newBudget.paymentConditions[0]?.method) || newBudget.paymentMethod,
        payment_installments: (newBudget.paymentConditions[0]?.installments) ?? newBudget.paymentInstallments,
        payment_tax_rate: (newBudget.paymentConditions[0]?.taxRate) ?? newBudget.paymentTaxRate,
        payment_discount_rate: (newBudget.paymentConditions[0]?.discountRate) ?? newBudget.paymentDiscountRate,
        payment_conditions: JSON.stringify(newBudget.paymentConditions || [])
      };

      console.log('Saving budget with data:', budgetData);

      let result;
      if (isEditing) {
        const { data, error } = await supabase
          .from('orcamentos')
          .update(budgetData)
          .eq('id', budgetId)
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
          .single();

        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        result = data;

        await localDB.put('orcamentos', result);

        setBudgets(prev => prev.map(b =>
          String(b.id) === String(budgetId) ? { ...b, ...result } : b
        ));
      } else {
        const { data, error } = await supabase
          .from('orcamentos')
          .insert([budgetData])
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
          .single();

        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        result = data;

        await localDB.put('orcamentos', result);

        setBudgets(prev => [...prev, result]);
      }

      navigate('/budgets');
    } catch (error) {
      console.error('Detailed error:', error);
      setError(`Erro ao salvar orçamento: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateBudget = async () => {
    if (newBudget.products.length === 0 && newBudget.accessories.length === 0) {
      alert('Não há produtos ou acessórios para recalcular.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Busca dados atualizados do banco/cache para garantir preços recentes
      const [freshProducts, freshAccessories, freshConfigs, freshRails] = await Promise.all([
        supabase.from('produtos').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('accessories').select('*').then(res => res.data || []).catch(() => []),
        supabase.from('configuracoes').select('bando_custo, bando_venda').maybeSingle().then(res => res.data).catch(() => null),
        supabase.from('rail_pricing').select('*').then(res => res.data || []).catch(() => [])
      ]);

      const activeProducts = freshProducts.length > 0 
        ? freshProducts 
        : (products.length > 0 ? products : await localDB.getAll('produtos'));
      const activeAccessories = freshAccessories.length > 0 
        ? freshAccessories 
        : (accessoriesList.length > 0 ? accessoriesList : await localDB.getAll('accessories'));

      const currentBando = {
        custo: freshConfigs?.bando_custo != null ? parseFloat(freshConfigs.bando_custo) : bandoConfig.custo || 80,
        venda: freshConfigs?.bando_venda != null ? parseFloat(freshConfigs.bando_venda) : bandoConfig.venda || 120
      };
      if (freshConfigs) setBandoConfig(currentBando);

      const currentTrilhosConfig = { ...trilhosConfig };
      if (freshRails && freshRails.length > 0) {
        freshRails.forEach(item => {
          currentTrilhosConfig[item.rail_type] = {
            sale_price: parseFloat(item.sale_price) || 0
          };
        });
        setTrilhosConfig(currentTrilhosConfig);
      }

      if (activeProducts.length > 0) setProducts(activeProducts);
      if (activeAccessories.length > 0) setAccessoriesList(activeAccessories);

      // Função auxiliar para recalcular trilho
      const getRailPrice = (width, railType) => {
        if (!railType || !currentTrilhosConfig[railType]) return 0;
        const basePrice = parseFloat(currentTrilhosConfig[railType]?.sale_price) || 0;
        const widthNum = parseFloat(width) || 0;
        return widthNum * basePrice;
      };

      // Recalcular produtos
      let updatedProductsCount = 0;
      const recalculatedProducts = newBudget.products.map(item => {
        const prodId = item.product?.id || item.produto_id || item.produto?.id;
        const latestProd = (activeProducts || []).find(p => String(p.id) === String(prodId)) || item.product || item.produto;

        const inW = parseFloat(item.inputWidth != null ? item.inputWidth : item.width) || 0;
        const inH = parseFloat(item.inputHeight != null ? item.inputHeight : item.height) || 0;
        const dims = calculateDimensions(latestProd, inW, inH, !!item.painel);

        let bandoVal = parseFloat(item.bandoValue) || 0;
        let bandoCost = parseFloat(item.bandoCusto) || 0;
        if (item.bando) {
          bandoVal = dims.width * currentBando.venda;
          bandoCost = dims.width * currentBando.custo;
        }

        let railVal = parseFloat(item.valor_trilho) || 0;
        if (item.trilho_tipo) {
          railVal = getRailPrice(dims.width, item.trilho_tipo);
        }

        const itemForSubtotal = {
          ...item,
          product: latestProd,
          produto: latestProd,
          inputWidth: inW,
          inputHeight: inH,
          width: dims.width,
          height: dims.height,
          bando: !!item.bando,
          bandoValue: bandoVal,
          bandoCusto: bandoCost,
          installation: !!item.installation,
          installationValue: parseFloat(item.installationValue) || 0,
          trilho_tipo: item.trilho_tipo || '',
          valor_trilho: railVal,
          painel: !!item.painel,
          numFolhas: parseInt(item.numFolhas) || 1
        };

        const newSubtotal = calculateProductSubtotal(itemForSubtotal);
        updatedProductsCount++;

        return {
          ...itemForSubtotal,
          subtotal: newSubtotal,
          area: dims.area,
          usedMinimum: dims.usedMinimum
        };
      });

      // Recalcular acessórios
      let updatedAccessoriesCount = 0;
      const recalculatedAccessories = newBudget.accessories.map(acc => {
        const accId = acc.accessory?.id || acc.accessory_id;
        const latestAcc = (activeAccessories || []).find(a => String(a.id) === String(accId)) || acc.accessory;
        let colors = latestAcc?.colors;
        if (typeof colors === 'string') {
          try { colors = JSON.parse(colors); } catch { colors = []; }
        }
        if (!Array.isArray(colors)) colors = [];

        const colorObj = colors.find(c => c.color === acc.color);
        const unitPrice = colorObj 
          ? (parseFloat(colorObj.sale_price) || 0) 
          : (parseFloat(acc.subtotal) / (parseFloat(acc.quantity) || 1) || 0);
        const qty = parseFloat(acc.quantity) || 1;
        const newSubtotal = qty * unitPrice;
        updatedAccessoriesCount++;

        return {
          ...acc,
          accessory: { ...latestAcc, colors },
          subtotal: newSubtotal
        };
      });

      const prodTotal = recalculatedProducts.reduce((sum, p) => sum + (parseFloat(p.subtotal) || 0), 0);
      const accTotal = recalculatedAccessories.reduce((sum, a) => sum + (parseFloat(a.subtotal) || 0), 0);
      const newTotal = prodTotal + accTotal;

      setNewBudget(prev => ({
        ...prev,
        products: recalculatedProducts,
        accessories: recalculatedAccessories,
        totalValue: newTotal
      }));

      alert(`Orçamento recalculado com sucesso!\n${updatedProductsCount} produto(s) e ${updatedAccessoriesCount} acessório(s) recalculados com base na tabela de preços atual.`);
    } catch (err) {
      console.error('Erro ao recalcular orçamento:', err);
      setError(`Erro ao recalcular orçamento: ${err.message}`);
      alert(`Erro ao recalcular orçamento: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBudgetFromEdit = async () => {
    if (!isEditing || !budgetId) return;
    if (!window.confirm('Tem certeza de que deseja excluir este orçamento permanentemente? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setLoading(true);
      const { error: deleteError } = await supabase
        .from('orcamentos')
        .delete()
        .eq('id', budgetId);

      if (deleteError) throw deleteError;

      await localDB.delete('orcamentos', budgetId);

      setBudgets(prev => prev.filter(b => String(b.id) !== String(budgetId)));
      alert('Orçamento excluído com sucesso.');
      navigate('/budgets');
    } catch (err) {
      console.error('Erro ao excluir orçamento:', err);
      setError(`Erro ao excluir orçamento: ${err.message}`);
      alert(`Erro ao excluir orçamento: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = localCustomers.filter(customer =>
    customer.name.toLowerCase().includes((searchTerm.customer || '').toLowerCase())
  );

  const filteredProducts = products.filter(product =>
    product.nome?.toLowerCase().includes(searchTerm.product.toLowerCase()) ||
    product.modelo?.toLowerCase().includes(searchTerm.product.toLowerCase()) ||
    product.tecido?.toLowerCase().includes(searchTerm.product.toLowerCase()) ||
    product.codigo?.toLowerCase().includes(searchTerm.product.toLowerCase())
  );

  const filteredAccessories = accessoriesList.filter(accessory =>
    accessory.name?.toLowerCase().includes((searchTerm.accessory || '').toLowerCase()) ||
    accessory.description?.toLowerCase().includes((searchTerm.accessory || '').toLowerCase())
  );

  const productsTotal = newBudget.products.reduce((sum, prod) => sum + (prod.subtotal || 0), 0);
  const accessoriesTotal = newBudget.accessories.reduce((sum, acc) => sum + (acc.subtotal || 0), 0);
  const totalValue = productsTotal + accessoriesTotal;

  const calculateInstallmentValue = () => {
    const total = newBudget.negotiatedValue || totalValue;
    const rate = parseFloat(newBudget.paymentTaxRate) || 0;
    const installments = parseInt(newBudget.paymentInstallments) || 1;
    
    if (installments <= 0) return 0;
    
    const increasedTotal = total * (1 + rate / 100);
    return increasedTotal / installments;
  };

  const calculateDiscountValue = () => {
    const total = newBudget.negotiatedValue || totalValue;
    const rate = parseFloat(newBudget.paymentDiscountRate) || 0;
    return total * (1 - rate / 100);
  };
  const calculateConditionInstallment = (pc) => {
    const total = newBudget.negotiatedValue || totalValue;
    const rate = parseFloat(pc.taxRate) || 0;
    const installments = parseInt(pc.installments) || 1;
    if (!installments || installments <= 0) return 0;
    const increasedTotal = total * (1 + rate / 100);
    return increasedTotal / installments;
  };
  const calculateConditionTotalWithInterest = (pc) => {
    const per = calculateConditionInstallment(pc);
    const installments = parseInt(pc.installments) || 1;
    return per * installments;
  };
  const calculateConditionPix = (pc) => {
    const total = newBudget.negotiatedValue || totalValue;
    const rate = parseFloat(pc.discountRate) || 0;
    return total * (1 - rate / 100);
  };
  const handleAddPaymentCondition = () => {
    if (currentPayment.method === 'credit_card') {
      if (!currentPayment.installments || currentPayment.installments < 1) {
        setError('Informe o número de parcelas para o cartão');
        setTimeout(() => setError(null), 3000);
        return;
      }
    }
    const pc = { ...currentPayment };
    setNewBudget(prev => ({
      ...prev,
      paymentConditions: [...(prev.paymentConditions || []), pc]
    }));
    setCurrentPayment({
      method: 'credit_card',
      installments: 0,
      taxRate: 0,
      discountRate: 0
    });
  };
  const handleRemovePaymentCondition = (index) => {
    setNewBudget(prev => ({
      ...prev,
      paymentConditions: (prev.paymentConditions || []).filter((_, i) => i !== index)
    }));
  };

  const renderDimensionFields = () => {
    const isWaveModel = currentProduct.product?.modelo?.toUpperCase() === 'WAVE';

    return (
      <>
        <div className="form-group">
          <label>Ambiente:</label>
          <input
            type="text"
            name="ambiente"
            value={currentProduct.ambiente}
            onChange={handleInputChange}
            placeholder="Ex.: Sala, Quarto, Cozinha"
          />
        </div>
        <div className="form-group">
          <label>Quantidade:</label>
          <input
            type="number"
            name="quantity"
            min="1"
            step="1"
            value={currentProduct.quantity}
            onChange={handleInputChange}
            placeholder="1"
          />
        </div>
        <div className="form-group">
          <label>Largura (m):</label>
          <input
            type="number"
            name="width"
            step="0.01"
            value={currentProduct.width}
            onChange={handleProductDimensionChange}
            required
          />
        </div>

        {(isWaveModel || currentProduct.product?.metodo_calculo !== 'linear') && (
          <div className="form-group">
            <label>Altura (m):</label>
            <input
              type="number"
              name="height"
              step="0.01"
              value={currentProduct.height}
              onChange={handleProductDimensionChange}
              required={isWaveModel || currentProduct.product?.metodo_calculo !== 'linear'}
            />
          </div>
        )}

        {isWaveModel && currentProduct.height && (
          <div className="wave-price-info">
            <label>Faixa de preço atual:</label>
            <div className="price-range">
              {getCurrentWavePriceRange(currentProduct.height)}
            </div>
          </div>
        )}
      </>
    );
  };

  const getCurrentWavePriceRange = (height) => {
    if (!currentProduct.product?.wave_pricing_data) return 'Preço não definido';
    
    const heightNum = parseFloat(height || currentProduct.height);
    if (!heightNum) return 'Altura inválida';

    let wave_pricing = [];
    const rawWave = currentProduct.product.wave_pricing_data;
    if (Array.isArray(rawWave)) {
      wave_pricing = rawWave;
    } else if (typeof rawWave === 'string') {
      try {
        wave_pricing = JSON.parse(rawWave);
      } catch {
        wave_pricing = [];
      }
    }

    for (const tier of wave_pricing) {
      if (heightNum >= tier.min_height && heightNum <= tier.max_height) {
        const basePrice = parseFloat(tier.price) || 0;
        const margin = parseFloat(currentProduct.product.margem_lucro) || 0;
        const finalPrice = basePrice + (basePrice * margin / 100);
        return `R$ ${finalPrice.toFixed(2)} por metro de largura`;
      }
    }
    
    return 'Largura fora das faixas de preço definidas';
  };

  const renderAdditionalOptions = () => {
    return (
      <div className="additional-options">
        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              name="bando"
              checked={currentProduct.bando}
              onChange={handleCheckboxChange}
            />
            Bando
          </label>
          {currentProduct.bando && (
            <div className="bando-info">
              <span>Valor do Bando: R$ {currentProduct.bandoValue?.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              name="installation"
              checked={currentProduct.installation}
              onChange={handleCheckboxChange}
            />
            Instalação
          </label>
          {currentProduct.installation && (
            <div className="installation-value">
              <input
                type="number"
                step="0.01"
                value={currentProduct.installationValue}
                onChange={handleInstallationValueChange}
                placeholder="Valor da instalação"
              />
            </div>
          )}
        </div>

        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              name="painel"
              checked={currentProduct.painel}
              onChange={handleCheckboxChange}
            />
            Painel
          </label>
          {currentProduct.painel && (
            <div className="painel-info">
              <div>
                <span>Área com acréscimo de 10%: {(parseFloat(currentProduct.width) * parseFloat(currentProduct.height) * 1.1).toFixed(2)}m²</span>
              </div>
              <div className="num-folhas">
                <label>Número de folhas:</label>
                <input
                  type="number"
                  min="1"
                  value={currentProduct.numFolhas}
                  onChange={(e) => handleNumFolhasChange(e.target.value)}
                />
              </div>
              {currentProduct.numFolhas > 1 && currentProduct.width && currentProduct.height && (
                <div className="folhas-info">
                  <span>Cada folha: {(parseFloat(currentProduct.width) * 1.1 / currentProduct.numFolhas).toFixed(2)}m x {parseFloat(currentProduct.height).toFixed(2)}m</span>
                  <p className="minimum-notice">As dimensões de cada folha são baseadas nas dimensões digitadas com acréscimo de 10% na largura.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error}</p>;

  return (
    <div className="budgets-container">
      <div className="budget-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{isEditing ? 'Editar Orçamento' : 'Novo Orçamento'}</h2>
        {isEditing && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="recalculate-button"
              onClick={handleRecalculateBudget}
              disabled={loading}
              title="Recalcular preços com base no cadastro atual dos produtos e acessórios"
            >
              <i className="fas fa-calculator" style={{ marginRight: '8px' }}></i>
              Recalcular Orçamento
            </button>
            <button
              type="button"
              className="delete-budget-btn"
              onClick={handleDeleteBudgetFromEdit}
              disabled={loading}
              title="Excluir este orçamento permanentemente"
            >
              <i className="fas fa-trash-alt" style={{ marginRight: '8px' }}></i>
              Excluir Orçamento
            </button>
          </div>
        )}
      </div>
      <form onSubmit={handleFinalizeBudget}>
        {/* Cliente Section */}
        <div className="form-section">
          <h3>Cliente</h3>
          <SelectOrCreate
            options={localCustomers}
            value={newBudget.customer}
            labelKey="name"
            valueKey="id"
            onChange={handleCustomerChange}
            onCreate={handleCreateCustomer}
            id="customer"
            name="customer"
          />
        </div>

        {/* Vendedor Section */}
        <div className="form-section">
          <h3>Vendedor</h3>
          <select
            className="form-control"
            value={newBudget.seller?.id || ''}
            onChange={(e) => {
              const sellerId = e.target.value;
              const selectedSeller = sellers.find(s => s.id === sellerId);
              setNewBudget(prev => ({ ...prev, seller: selectedSeller || null }));
            }}
          >
            <option value="">Selecione um vendedor</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Produtos Section */}
        <div className="form-section">
          <h3>Produtos</h3>

          {/* Lista de produtos já adicionados */}
          {newBudget.products.length > 0 && (
            <div className="added-products">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <h4 style={{ margin: 0 }}>Produtos Adicionados ({newBudget.products.length})</h4>
                <button
                  type="button"
                  className="recalculate-button"
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                  onClick={handleRecalculateBudget}
                  disabled={loading}
                  title="Recalcular preços de todos os produtos com os valores atuais"
                >
                  <i className="fas fa-sync-alt" style={{ marginRight: '6px' }}></i>
                  Recalcular Preços
                </button>
              </div>
              <div className="products-summary">
                <p>Total de produtos: {newBudget.products.length}</p>
                <p>Valor total dos produtos: R$ {productsTotal.toFixed(2)}</p>
              </div>
              <div className="products-list">
                {newBudget.products.map((prod, index) => {
                  const prodName = prod.product?.nome || prod.product?.name || prod.produto?.nome || 'Produto';
                  const inW = parseFloat(prod.inputWidth != null ? prod.inputWidth : prod.width) || 0;
                  const inH = parseFloat(prod.inputHeight != null ? prod.inputHeight : prod.height) || 0;
                  const w = parseFloat(prod.width) || 0;
                  const h = parseFloat(prod.height) || 0;
                  const bandoVal = parseFloat(prod.bandoValue) || 0;
                  const railVal = parseFloat(prod.valor_trilho) || 0;
                  const sub = parseFloat(prod.subtotal) || 0;
                  const leaves = parseInt(prod.numFolhas) || 1;

                  return (
                    <div key={index} className="added-product-item">
                      <div className="product-info">
                        <p><strong>{prodName}</strong></p>
                        {prod.ambiente && (
                          <p>Ambiente: {prod.ambiente}</p>
                        )}
                        <p>
                          Dimensões digitadas: {inW.toFixed(2)}m x {inH.toFixed(2)}m
                        </p>
                        {prod.usedMinimum && (
                          <p className="minimum-warning">
                            DIMENSÕES MÍNIMAS PARA CÁLCULO: {w.toFixed(2)}m x {h.toFixed(2)}m
                          </p>
                        )}
                        {prod.painel && (
                          <>
                            <p>Painel com acréscimo de 10%: {(inW * inH * 1.1).toFixed(2)}m²</p>
                            <p>Número de folhas: {leaves}</p>
                            {leaves > 1 && (
                              <p>Cada folha: {(inW * 1.1 / leaves).toFixed(2)}m x {inH.toFixed(2)}m</p>
                            )}
                          </>
                        )}
                        {prod.bando && <p>Bandô: R$ {bandoVal.toFixed(2)}</p>}
                        {prod.installation && <p>Instalação: R$ {parseFloat(prod.installationValue) || 0}</p>}
                        {prod.trilho_tipo && <p>Trilho: {prod.trilho_tipo}</p>}
                        {railVal > 0 && <p>Valor do Trilho: R$ {railVal.toFixed(2)}</p>}
                        <p className="product-subtotal">Subtotal: R$ {sub.toFixed(2)}</p>
                      </div>
                      <div className="product-actions">
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => handleEditProduct(index)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="remove-button"
                          onClick={() => handleRemoveProduct(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Adicionar novo produto */}
          <div className="add-product">
            <h4>Adicionar Produto</h4>
            <input
              type="text"
              placeholder="Pesquisar produto..."
              value={searchTerm.product}
              onChange={(e) => setSearchTerm(prev => ({ ...prev, product: e.target.value }))}
            />
            <SelectOrCreate
              options={filteredProducts}
              value={currentProduct.product}
              labelKey="nome"
              valueKey="id"
              onChange={handleProductChange}
              onCreate={fetchAccessories}
              showCreate={false}
            />

            {currentProduct.product && (
              <>
                {renderDimensionFields()}
                {renderAdditionalOptions()}

                {currentProduct.product?.modelo?.toUpperCase() === 'WAVE' && (
                  <div className="form-group">
                    <label htmlFor="trilho_tipo">Tipo de Trilho</label>
                    <select
                      id="trilho_tipo"
                      value={currentProduct.trilho_tipo}
                      onChange={handleRailTypeChange}
                      className="form-control"
                    >
                      <option value="">Selecione o tipo de trilho</option>
                      <option value="trilho_redondo_com_comando">Trilho redondo com comando</option>
                      <option value="trilho_redondo_sem_comando">Trilho redondo sem comando</option>
                      <option value="trilho_slim_com_comando">Trilho Slim com comando</option>
                      <option value="trilho_slim_sem_comando">Trilho Slim sem comando</option>
                      <option value="trilho_quadrado_com_rodizio_em_gancho">Trilho quadrado com rodizio em gancho</option>
                      <option value="trilho_motorizado">Trilho motorizado</option>
                    </select>
                  </div>
                )}

                {currentProduct.subtotal > 0 && (
                  <p>Subtotal do produto: R$ {currentProduct.subtotal.toFixed(2)}</p>
                )}

                <button
                  type="button"
                  className="add-product-button"
                  onClick={handleAddProduct}
                >
                  Adicionar Produto
                </button>
              </>
            )}
          </div>
        </div>

        {/* Acessórios Section */}
        <div className="form-section">
          <h3>Acessórios</h3>

          {/* Lista de acessórios já adicionados */}
          {newBudget.accessories.length > 0 && (
            <div className="added-accessories">
              <h4>Acessórios Adicionados ({newBudget.accessories.length})</h4>
              <div className="accessories-summary">
                <p>Total de acessórios: {newBudget.accessories.length}</p>
                <p>Valor total dos acessórios: R$ {accessoriesTotal.toFixed(2)}</p>
              </div>
              {newBudget.accessories.map((acc, index) => {
                const accName = acc.accessory?.name || 'Acessório';
                let colors = acc.accessory?.colors;
                if (typeof colors === 'string') {
                  try { colors = JSON.parse(colors); } catch { colors = []; }
                }
                if (!Array.isArray(colors)) colors = [];
                const colorObj = colors.find(c => c.color === acc.color);
                const unitPrice = colorObj 
                  ? (parseFloat(colorObj.sale_price) || 0) 
                  : (parseFloat(acc.subtotal) / (parseFloat(acc.quantity) || 1) || 0);
                const qty = parseFloat(acc.quantity) || 1;
                const sub = parseFloat(acc.subtotal) || 0;

                return (
                  <div key={index} className="added-accessory-item">
                    <div className="accessory-info">
                      <p><strong>{accName}</strong></p>
                      <p>Cor: {acc.color}</p>
                      <p>Quantidade: {qty}</p>
                      <p>Preço unitário: R$ {unitPrice.toFixed(2)}</p>
                      <p className="accessory-subtotal">Subtotal: R$ {sub.toFixed(2)}</p>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => handleEditAccessory(index)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="remove-button"
                        onClick={() => handleRemoveAccessory(index)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Adicionar novo acessório */}
          <div className="add-accessory">
            <h4>Adicionar Acessório</h4>
            <input
              type="text"
              placeholder="Pesquisar acessório..."
              value={searchTerm.accessory}
              onChange={(e) => setSearchTerm(prev => ({ ...prev, accessory: e.target.value }))}
            />
            <SelectOrCreate
              options={filteredAccessories}
              value={currentAccessory.accessory}
              onChange={handleAccessoryChange}
              labelKey="name"
              valueKey="id"
              onCreate={fetchAccessories}
              showCreate={false}
            />

            {currentAccessory.accessory && (
              <>
                <div className="accessory-options">
                  <select
                    name="color"
                    value={currentAccessory.color}
                    onChange={handleAccessoryInputChange}
                    className="form-control"
                  >
                    <option value="">Selecione uma cor</option>
                    {currentAccessory.accessory.colors.map((color, index) => (
                      <option key={index} value={color.color}>
                        {color.color} - R$ {parseFloat(color.sale_price).toFixed(2)}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    name="quantity"
                    value={currentAccessory.quantity}
                    onChange={handleAccessoryInputChange}
                    placeholder="Quantidade"
                    min="0.01"
                  />
                </div>

                {currentAccessory.subtotal > 0 && (
                  <p>Subtotal do acessório: R$ {currentAccessory.subtotal.toFixed(2)}</p>
                )}

                <button
                  type="button"
                  className="add-accessory-button"
                  onClick={handleAddAccessory}
                >
                  Adicionar Acessório
                </button>
              </>
            )}
          </div>
        </div>

        {/* Observação Section */}
        <div className="form-section">
          <h3>Observação</h3>
          <textarea
            name="observation"
            value={newBudget.observation}
            onChange={(e) => setNewBudget(prev => ({ ...prev, observation: e.target.value }))}
            rows="4"
          />
        </div>

        {/* Valor Negociado Section */}
        <div className="form-section">
          <h3>Valor Negociado</h3>
          <input
            type="number"
            step="0.01"
            value={newBudget.negotiatedValue || ''}
            onChange={(e) => {
              const value = e.target.value ? parseFloat(e.target.value) : null;
              setNewBudget(prev => ({ ...prev, negotiatedValue: value }));
            }}
            placeholder="Digite o valor negociado (opcional)"
          />
          {newBudget.negotiatedValue && (
            <p className="text-sm text-gray-600 mt-1">
              Desconto: {((1 - newBudget.negotiatedValue / newBudget.totalValue) * 100).toFixed(2)}%
            </p>
          )}
        </div>

        {/* Condições de Pagamento */}
        <div className="form-section">
          <h3>Condições de Pagamento</h3>
          <div className="payment-options-container" style={{ display: 'grid', gap: '12px' }}>
            <div className="payment-add" style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 120px', gap: '10px', alignItems: 'end' }}>
              <div className="form-group">
                <label>Método:</label>
                <select
                  value={currentPayment.method}
                  onChange={(e) => setCurrentPayment(prev => ({ ...prev, method: e.target.value }))}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                >
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="pix">À Vista (PIX)</option>
                </select>
              </div>
              {currentPayment.method === 'credit_card' && (
                <>
                  <div className="form-group">
                    <label>Parcelas:</label>
                    <input
                      type="number"
                      min="1"
                      value={currentPayment.installments || ''}
                      onChange={(e) => setCurrentPayment(prev => ({ ...prev, installments: parseInt(e.target.value) || 0 }))}
                      placeholder="Ex: 10"
                      style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Taxa de Juros (%):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={currentPayment.taxRate || ''}
                      onChange={(e) => setCurrentPayment(prev => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ex: 5"
                      style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                    />
                  </div>
                </>
              )}
              {currentPayment.method === 'pix' && (
                <div className="form-group">
                  <label>Desconto (%):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentPayment.discountRate || ''}
                    onChange={(e) => setCurrentPayment(prev => ({ ...prev, discountRate: parseFloat(e.target.value) || 0 }))}
                    placeholder="Ex: 5"
                    style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                  />
                </div>
              )}
              <button
                type="button"
                className="add-payment-condition"
                onClick={handleAddPaymentCondition}
                style={{ padding: '10px 12px' }}
              >
                Adicionar condição
              </button>
            </div>
            {newBudget.paymentConditions.length > 0 && (
              <div className="payment-list" style={{ marginTop: '6px' }}>
                {newBudget.paymentConditions.map((pc, idx) => (
                  <div key={idx} className="payment-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', padding: '10px', borderRadius: '6px', marginBottom: '8px' }}>
                    <div>
                      {pc.method === 'credit_card' ? (
                        <span>
                          Cartão: {pc.installments}x de R$ {calculateConditionInstallment(pc).toFixed(2)}
                          {pc.taxRate > 0 ? ` (Total: R$ ${calculateConditionTotalWithInterest(pc).toFixed(2)})` : ''}
                        </span>
                      ) : (
                        <span>
                          À Vista (PIX): R$ {calculateConditionPix(pc).toFixed(2)} {pc.discountRate ? `com ${pc.discountRate}% de desconto` : ''}
                        </span>
                      )}
                    </div>
                    <button type="button" onClick={() => handleRemovePaymentCondition(idx)} style={{ padding: '6px 8px' }}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Total Value and Submit */}
        {totalValue > 0 && (
          <div className="total-value">
            <h3>Valor Total: R$ {totalValue.toFixed(2)}</h3>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginTop: '20px' }}>
          <button type="submit" className="finalize-button" disabled={loading}>
            {isEditing ? 'Salvar Alterações' : 'Finalizar Orçamento'}
          </button>
          {isEditing && (
            <>
              <button
                type="button"
                className="recalculate-button"
                onClick={handleRecalculateBudget}
                disabled={loading}
              >
                <i className="fas fa-calculator" style={{ marginRight: '8px' }}></i>
                Recalcular Preços
              </button>
              <button
                type="button"
                className="delete-budget-btn"
                onClick={handleDeleteBudgetFromEdit}
                disabled={loading}
              >
                <i className="fas fa-trash-alt" style={{ marginRight: '8px' }}></i>
                Excluir Orçamento
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export default Budgets;
