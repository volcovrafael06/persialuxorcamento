import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SelectOrCreate from './SelectOrCreate';
import { supabase } from '../supabase/client';
import './Budgets.css';

function Budgets({ budgets, setBudgets, customers: initialCustomers, products: initialProducts, accessories: initialAccessories, setCustomers: updateParentCustomers }) {
  const navigate = useNavigate();
  const { budgetId } = useParams();
  const isEditing = budgetId !== undefined;

  const [newBudget, setNewBudget] = useState({
    customer: null,
    products: [],
    accessories: [],
    observation: '',
    totalValue: 0,
    negotiatedValue: null
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

    fetchCustomers();
  }, [updateParentCustomers]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [customersResponse, productsResponse, accessoriesResponse] = await Promise.all([
          !initialCustomers && supabase.from('clientes').select('*').order('name'),
          !initialProducts && supabase.from('produtos').select('*'),
          !initialAccessories && supabase.from('accessories').select('*').order('name')
        ]);

        if (customersResponse && customersResponse.error) throw customersResponse.error;
        if (productsResponse && productsResponse.error) throw productsResponse.error;
        if (accessoriesResponse && accessoriesResponse.error) throw accessoriesResponse.error;

        if (customersResponse) {
          setLocalCustomers(customersResponse.data || []);
          updateParentCustomers?.(customersResponse.data || []);
        }
        
        if (productsResponse) {
          setProducts(productsResponse.data || []);
        }
        
        if (accessoriesResponse) {
          setAccessoriesList(accessoriesResponse.data || []);
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
    const fetchLatestProducts = async () => {
      try {
        const { data, error } = await supabase.from('produtos').select('*');
        if (error) throw error;
        setProducts(data || []);
      } catch (error) {
        console.error('Error fetching latest products:', error);
      }
    };

    const productsSubscription = supabase
      .channel('produtos_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'produtos' 
        }, 
        () => {
          fetchLatestProducts();
        }
      )
      .subscribe();

    fetchLatestProducts();

    return () => {
      productsSubscription.unsubscribe();
    };
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

  useEffect(() => {
    if (isEditing && budgetId) {
      const loadBudgetData = async () => {
        try {
          console.log('Loading budget for editing:', budgetId);
          
          const { data: budget, error } = await supabase
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
            .single();

          if (error) throw error;
          
          console.log('Loaded budget:', budget);
          
          let products = [];
          let accessories = [];

          try {
            products = JSON.parse(budget.produtos_json || '[]');
            accessories = JSON.parse(budget.acessorios_json || '[]');
            
            products = products.map(p => {
              const fullProduct = initialProducts?.find(prod => prod.id === p.produto_id) || {};
              return {
                product: fullProduct,
                width: p.input_width || p.largura || '',
                height: p.input_height || p.altura || '',
                inputWidth: p.input_width || p.largura || '',
                inputHeight: p.input_height || p.altura || '',
                ambiente: p.ambiente || '',
                bando: p.bando || false,
                bandoValue: p.valor_bando || 0,
                bandoCusto: p.valor_bando_custo || 0,
                installation: p.instalacao || false,
                installationValue: p.valor_instalacao || 0,
                trilho_tipo: p.trilho_tipo || '',
                valor_trilho: p.valor_trilho || 0,
                painel: p.painel || false,
                numFolhas: p.num_folhas || 1,
                subtotal: p.subtotal || 0,
                usedMinimum: false // Add this since we're using existing values
              };
            });

            accessories = accessories.map(a => {
              const fullAccessory = initialAccessories?.find(acc => acc.id === a.accessory_id) || {};
              return {
                accessory: fullAccessory,
                color: a.color || '',
                quantity: a.quantity || 1,
                subtotal: a.subtotal || 0
              };
            });

          } catch (e) {
            console.error('Error parsing budget data:', e);
          }

          console.log('Processed products:', products);
          console.log('Processed accessories:', accessories);

          setNewBudget({
            customer: budget.clientes,
            products,
            accessories,
            observation: budget.observacao || '',
            totalValue: budget.valor_total || 0,
            negotiatedValue: budget.valor_negociado
          });
        } catch (error) {
          console.error('Error loading budget:', error);
          setError('Erro ao carregar orçamento');
        }
      };

      loadBudgetData();
    }
  }, [isEditing, budgetId, initialProducts, initialAccessories]);

  const calculateDimensions = (product, width, height, isPainel = false) => {
    const inputWidth = parseFloat(width) || 0;
    const inputHeight = parseFloat(height) || 0;
    
    let minWidth = parseFloat(product.largura_minima) || 0;
    let minHeight = parseFloat(product.altura_minima) || 0;
    let minArea = parseFloat(product.area_minima) || 0;
    
    // Special case for SCREEN 0,5 PREMIUM - ensure it has the correct minimum area
    if (product.nome === 'SCREEN 0,5 PREMIUM' || product.nome === 'SCREEN 0.5 PREMIUM' || product.nome === 'PARIS BK') {
      minArea = 1.5;
      
      // Calculate minimum dimensions based on the correct minimum area
      // If current dimensions don't provide enough area, adjust them
      const currentArea = inputWidth * inputHeight;
      if (currentArea < minArea) {
        // If the dimensions are square (or nearly square), adjust both proportionally
        if (Math.abs(inputWidth - inputHeight) < 0.1) {
          const sideDimension = Math.sqrt(minArea);
          minWidth = sideDimension;
          minHeight = sideDimension;
        } 
        // Otherwise, maintain aspect ratio but scale up to reach minimum area
        else {
          const ratio = inputWidth / inputHeight;
          minHeight = Math.sqrt(minArea / ratio);
          minWidth = minHeight * ratio;
        }
      }
      
      console.log('Fixed minimum area for SCREEN 0,5 PREMIUM to 1.5m² with dimensions', minWidth.toFixed(2), 'x', minHeight.toFixed(2));
    }
    
    // For display purposes, we'll keep the original input dimensions
    // For pricing calculations, we'll use the minimum dimensions if necessary
    let finalWidth = Math.max(inputWidth, minWidth);
    let finalHeight = Math.max(inputHeight, minHeight);
    
    const area = inputWidth * inputHeight;
    const isUsingMinimum = finalWidth > inputWidth || finalHeight > inputHeight || (minArea > 0 && area < minArea);
    
    // Calculate the final area for pricing purposes
    let finalArea = finalWidth * finalHeight;
    
    if (minArea > 0 && area < minArea) {
      // Use the exact minimum area value directly for pricing
      finalArea = minArea;
    }
    
    // Apply 10% increase to area if Painel is selected
    if (isPainel) {
      finalArea = finalArea * 1.1; // 10% increase
    }
    
    return {
      // Return both the pricing dimensions and the input dimensions
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
    if (!product.product) return 0;

    let subtotal = 0;
    
    const dimensions = calculateDimensions(
      product.product,
      product.width,
      product.height,
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

    if (product.product.modelo.toUpperCase() === 'WAVE') {
      // Para modelo Wave, calcula o preço base pela altura
      const wave_pricing = JSON.parse(product.product.wave_pricing_data || '[]');
      const heightInMeters = parseFloat(height) || 0;
      
      let basePrice = 0;
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
        console.log('Adicionando valor do trilho:', {
          tipo: product.trilho_tipo,
          valorConfigurado: trilhosConfig[product.trilho_tipo],
          valorCalculado: product.valor_trilho,
          subtotalAntes: subtotal,
          subtotalDepois: subtotal + product.valor_trilho
        });
        subtotal += product.valor_trilho;
      }
    } else {
      const price = parseFloat(product.product.preco_venda) || 0;
      if (width && height) {
        // Use the area that already includes the 10% increase if Painel is selected
        subtotal = area * price;
      }
    }

    // Adiciona valor do bandô se marcado
    if (product.bando && product.bandoValue) {
      const bandoValue = parseFloat(product.bandoValue);
      console.log('Adicionando bandô:', {
        valor: bandoValue,
        subtotalAntes: subtotal,
        subtotalDepois: subtotal + bandoValue
      });
      subtotal += bandoValue;
    }

    // Adiciona valor da instalação se marcada
    if (product.installation && product.installationValue) {
      const installationValue = parseFloat(product.installationValue);
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
        name: currentProduct.product.name
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

      // Primeiro, vamos obter o próximo número de orçamento
      let nextBudgetNumber = 985;
      const { data: maxBudget } = await supabase
        .from('orcamentos')
        .select('numero_orcamento')
        .order('numero_orcamento', { ascending: false })
        .limit(1);

      if (maxBudget && maxBudget.length > 0 && maxBudget[0].numero_orcamento) {
        nextBudgetNumber = Math.max(985, maxBudget[0].numero_orcamento + 1);
      }

      const cleanProducts = newBudget.products.map(product => ({
        produto_id: product.product.id,
        largura: parseFloat(product.width),
        altura: product.height ? parseFloat(product.height) : null,
        input_width: parseFloat(product.inputWidth) || parseFloat(product.width),
        input_height: product.inputHeight ? parseFloat(product.inputHeight) : (product.height ? parseFloat(product.height) : null),
        ambiente: product.ambiente || '',
        bando: product.bando,
        valor_bando: product.bandoValue,
        valor_bando_custo: product.bandoCusto,
        instalacao: product.installation,
        valor_instalacao: parseFloat(product.installationValue),
        trilho_tipo: product.trilho_tipo,
        valor_trilho: product.valor_trilho,
        painel: product.painel,
        num_folhas: product.numFolhas,
        subtotal: product.subtotal
      }));

      const cleanAccessories = newBudget.accessories.map(accessory => ({
        accessory_id: accessory.accessory.id,
        color: accessory.color,
        quantity: parseFloat(accessory.quantity), // Usar parseFloat para permitir valores decimais
        subtotal: accessory.subtotal
      }));

      const budgetData = {
        cliente_id: newBudget.customer.id,
        valor_total: newBudget.totalValue,
        produtos_json: JSON.stringify(cleanProducts),
        observacao: newBudget.observation || '',
        acessorios_json: JSON.stringify(cleanAccessories),
        valor_negociado: newBudget.negotiatedValue,
        ambientes: Array.from(new Set((newBudget.products || []).map(p => (p.ambiente || '').trim()).filter(Boolean))),
        status: isEditing ? undefined : 'pending',
        numero_orcamento: isEditing ? undefined : nextBudgetNumber // Adiciona o número do orçamento apenas para novos orçamentos
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
            )
          `)
          .single();

        if (error) {
          console.error('Update error:', error);
          throw error;
        }
        result = data;

        setBudgets(prev => prev.map(b =>
          b.id === parseInt(budgetId) ? { ...b, ...result } : b
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
            )
          `)
          .single();

        if (error) {
          console.error('Insert error:', error);
          throw error;
        }
        result = data;

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

  const renderDimensionFields = () => {
    const isWaveModel = currentProduct.product?.modelo.toUpperCase() === 'WAVE';

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
              required={isWaveModel}
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
    
    const heightNum = parseFloat(currentProduct.height);
    if (!heightNum) return 'Altura inválida';

    const wave_pricing = JSON.parse(currentProduct.product.wave_pricing_data || '[]');
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
      <h2>{isEditing ? 'Editar Orçamento' : 'Novo Orçamento'}</h2>
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

        {/* Produtos Section */}
        <div className="form-section">
          <h3>Produtos</h3>

          {/* Lista de produtos já adicionados */}
          {newBudget.products.length > 0 && (
            <div className="added-products">
              <h4>Produtos Adicionados ({newBudget.products.length})</h4>
              <div className="products-summary">
                <p>Total de produtos: {newBudget.products.length}</p>
                <p>Valor total dos produtos: R$ {productsTotal.toFixed(2)}</p>
              </div>
              <div className="products-list">
                {newBudget.products.map((prod, index) => (
                  <div key={index} className="added-product-item">
                    <div className="product-info">
                      <p><strong>{prod.product.nome}</strong></p>
                      {prod.ambiente && (
                        <p>Ambiente: {prod.ambiente}</p>
                      )}
                      <p>
                        Dimensões digitadas: {prod.inputWidth.toFixed(2)}m x {prod.inputHeight.toFixed(2)}m
                      </p>
                      {prod.usedMinimum && (
                        <>
                          <p className="minimum-warning">
                            DIMENSÕES MÍNIMAS PARA CÁLCULO: {prod.width.toFixed(2)}m x {prod.height.toFixed(2)}m
                          </p>
                        </>
                      )}
                      {prod.painel && (
                        <>
                          <p>Painel com acréscimo de 10%: {(prod.inputWidth * prod.inputHeight * 1.1).toFixed(2)}m²</p>
                          <p>Número de folhas: {prod.numFolhas}</p>
                          {prod.numFolhas > 1 && (
                            <p>Cada folha: {(prod.inputWidth * 1.1 / prod.numFolhas).toFixed(2)}m x {prod.inputHeight.toFixed(2)}m</p>
                          )}
                        </>
                      )}
                      {prod.bando && <p>Bandô: R$ {prod.bandoValue.toFixed(2)}</p>}
                      {prod.installation && <p>Instalação: R$ {prod.installationValue}</p>}
                      {prod.trilho_tipo && <p>Trilho: {prod.trilho_tipo}</p>}
                      {prod.valor_trilho && <p>Valor do Trilho: R$ {prod.valor_trilho.toFixed(2)}</p>}
                      <p className="product-subtotal">Subtotal: R$ {prod.subtotal.toFixed(2)}</p>
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
                ))}
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

                {currentProduct.product.modelo.toUpperCase() === 'WAVE' && (
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
              {newBudget.accessories.map((acc, index) => (
                <div key={index} className="added-accessory-item">
                  <div className="accessory-info">
                    <p><strong>{acc.accessory.name}</strong></p>
                    <p>Cor: {acc.color}</p>
                    <p>Quantidade: {acc.quantity}</p>
                    <p>Preço unitário: R$ {acc.accessory.colors.find(c => c.color === acc.color)?.sale_price.toFixed(2)}</p>
                    <p className="accessory-subtotal">Subtotal: R$ {acc.subtotal.toFixed(2)}</p>
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
              ))}
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

        {/* Total Value and Submit */}
        {totalValue > 0 && (
          <div className="total-value">
            <h3>Valor Total: R$ {totalValue.toFixed(2)}</h3>
          </div>
        )}

        <button type="submit" className="finalize-button" disabled={loading}>
          {isEditing ? 'Salvar Alterações' : 'Finalizar Orçamento'}
        </button>
      </form>
    </div>
  );
}

export default Budgets;
