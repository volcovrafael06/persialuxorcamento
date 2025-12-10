import React, { useState, useEffect } from 'react';
import { Route, Routes, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import BudgetStatusPage from './components/BudgetStatusPage';
import Budgets from './components/Budgets';
import Customers from './components/Customers';
import Products from './components/Products';
import Accessories from './components/Accessories';
import Reports from './components/Reports';
import Login from './components/Login';
import Configuracoes from './components/Configuracoes';
import BudgetList from './components/BudgetList';
import BudgetDetailsPage from './components/BudgetDetailsPage';
import HomePage from './components/HomePage';
import Dashboard from './components/Dashboard';
import { supabase } from './supabase/client';
import TestDB from './components/TestDB';
import { authService } from './services/authService';
import { syncService } from './services/syncService';
import { localDB } from './services/localDatabase';
import VisitScheduler from './components/VisitScheduler';
import ConnectionStatus from './components/ConnectionStatus';
import './components/ConnectionStatus.css';

function App() {
  const [companyLogo, setCompanyLogo] = useState(null);
  const [validadeOrcamento, setValidadeOrcamento] = useState('30');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(authService.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [visits, setVisits] = useState([]);
  const [notification, setNotification] = useState(null); // Novo estado para notificações
  const [onlineStatus, setOnlineStatus] = useState(null);

  useEffect(() => {
    const checkInitialData = async () => {
      setLoading(true);
      
      // Verificar se há conexão com a internet
      const isOnline = navigator.onLine;
      setOnlineStatus(isOnline);
      
      if (isOnline) {
        // Se estiver online, sempre priorize carregar dados da API
        // O fetchBudgets já foi chamado no useEffect anterior, não precisamos chamar novamente
        console.log('Online, loading data from Supabase directly');
      } else {
        // Se estiver offline, tente carregar do cache
        console.log('Offline, loading from cache');
        await loadFromCache();
      }
      
      setLoading(false);
    };
    
    checkInitialData();
    
    // Adicionar listeners para detectar mudanças no status de conexão
    const handleOnline = () => {
      console.log('Voltou a ficar online');
      setOnlineStatus(true);
      setNotification('Conexão com a internet restabelecida. Sincronizando dados...');
      syncData(); // Sincroniza dados quando voltar a ficar online
    };
    
    const handleOffline = () => {
      console.log('Ficou offline');
      setOnlineStatus(false);
      setNotification('Sem conexão com a internet. Usando dados em cache.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    syncData();
    fetchVisits();
    
    const syncInterval = setInterval(syncData, 30 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, []);

  useEffect(() => {
    const fetchBudgets = async () => {
      try {
        const { data, error } = await supabase.from('orcamentos').select('*');
        if (error) throw error;
        
        console.log('Budgets fetched from Supabase:', data);
        
        // Sempre usar a versão mais recente do banco de dados
        setBudgets(data);
        
        // Atualizar o cache local com os dados do Supabase
        // Isso garante que apenas orçamentos válidos estão no cache
        await localDB.clear('orcamentos');
        if (data && data.length > 0) {
          for (const budget of data) {
            await localDB.put('orcamentos', budget);
          }
        }
        
        // Check and update any 'pending' status to 'pendente'
        const needsUpdate = data.filter(budget => budget.status === 'pending');
        if (needsUpdate.length > 0) {
          console.log('Updating old pending statuses:', needsUpdate.length);
          for (const budget of needsUpdate) {
            await supabase
              .from('orcamentos')
              .update({ status: 'pendente' })
              .eq('id', budget.id);
          }
          // Fetch again after updates
          const { data: updatedData, error: updatedError } = await supabase.from('orcamentos').select('*');
          if (updatedError) throw updatedError;
          setBudgets(updatedData);
        }
      } catch (error) {
        console.error('Error fetching budgets:', error);
        setNotification('Erro ao carregar orçamentos: ' + error.message);
      }
    };

    fetchBudgets();

    // Configurar um listener em tempo real para atualizações, inserções e exclusões
    const budgetsSubscription = supabase
      .channel('orcamentos_changes')
      .on('postgres_changes', 
        { 
          event: '*', // Escuta todos os eventos (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'orcamentos' 
        }, 
        (payload) => {
          console.log('Detected change in orcamentos table:', payload);
          // Recarrega todos os orçamentos quando houver qualquer alteração
          fetchBudgets();
          
          // Mostra notificação apropriada baseada no tipo de evento
          if (payload.eventType === 'DELETE') {
            setNotification('Um orçamento foi removido do banco de dados');
          } else if (payload.eventType === 'INSERT') {
            setNotification('Um novo orçamento foi adicionado');
          } else if (payload.eventType === 'UPDATE') {
            setNotification('Um orçamento foi atualizado');
          }
        }
      )
      .subscribe();

    return () => {
      // Desinscrever do canal quando o componente for desmontado
      budgetsSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Configurar listener para atualizações de clientes
    const fetchCustomers = async () => {
      try {
        const { data, error } = await supabase.from('clientes').select('*');
        if (error) throw error;
        
        console.log('Clientes fetched from Supabase:', data.length);
        
        // Atualizar o estado
        setCustomers(data);
        
        // Atualizar o cache local
        await localDB.clear('clientes');
        if (data && data.length > 0) {
          for (const cliente of data) {
            await localDB.put('clientes', cliente);
          }
        }
      } catch (error) {
        console.error('Error fetching customers:', error);
        setNotification('Erro ao carregar clientes: ' + error.message);
      }
    };

    fetchCustomers();

    // Configurar um listener em tempo real para clientes
    const customersSubscription = supabase
      .channel('clientes_changes')
      .on('postgres_changes', 
        { 
          event: '*', // Escuta todos os eventos (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'clientes' 
        }, 
        (payload) => {
          console.log('Detected change in clientes table:', payload);
          // Recarrega todos os clientes quando houver qualquer alteração
          fetchCustomers();
          
          // Recarrega também os orçamentos para atualizar as referências aos clientes
          const fetchBudgetsWithCustomers = async () => {
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
                  )
                `);
                
              if (error) throw error;
              console.log('Budgets with customers fetched:', data.length);
              
              // Atualizar o estado e o cache local
              setBudgets(data);
              await localDB.clear('orcamentos');
              if (data && data.length > 0) {
                for (const budget of data) {
                  await localDB.put('orcamentos', budget);
                }
              }
              
              // Mostrar notificação
              if (payload.eventType === 'DELETE') {
                setNotification('Um cliente foi removido do banco de dados');
              } else if (payload.eventType === 'INSERT') {
                setNotification('Um novo cliente foi adicionado');
              } else if (payload.eventType === 'UPDATE') {
                setNotification('Um cliente foi atualizado');
              }
            } catch (error) {
              console.error('Error fetching budgets with customers:', error);
            }
          };
          
          fetchBudgetsWithCustomers();
        }
      )
      .subscribe();

    return () => {
      // Desinscrever do canal quando o componente for desmontado
      customersSubscription.unsubscribe();
    };
  }, []);

  const loadFromCache = async () => {
    try {
      setLoading(true);
      const [
        localBudgets,
        localCustomers,
        localProducts,
        localAccessories,
        localConfig
      ] = await Promise.all([
        localDB.getAll('orcamentos'),
        localDB.getAll('clientes'),
        localDB.getAll('produtos'),
        localDB.getAll('accessories'),
        localDB.get('configuracoes', 1)
      ]);

      if (localBudgets?.length) setBudgets(localBudgets);
      if (localCustomers?.length) setCustomers(localCustomers);
      if (localProducts?.length) setProducts(localProducts);
      if (localAccessories?.length) setAccessories(localAccessories);
      if (localConfig?.company_logo) setCompanyLogo(localConfig.company_logo);
    } catch (error) {
      console.error('Error loading from cache:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncData = async () => {
    if (syncing) return; 
    try {
      setSyncing(true);
      await syncService.syncAll();
      
      const [
        updatedBudgets,
        updatedCustomers,
        updatedProducts,
        updatedAccessories,
        updatedConfig
      ] = await Promise.all([
        localDB.getAll('orcamentos'),
        localDB.getAll('clientes'),
        localDB.getAll('produtos'),
        localDB.getAll('accessories'),
        localDB.get('configuracoes', 1)
      ]);

      setBudgets(updatedBudgets);
      setCustomers(updatedCustomers);
      setProducts(updatedProducts);
      setAccessories(updatedAccessories);
      if (updatedConfig?.company_logo) setCompanyLogo(updatedConfig.company_logo);
      setNotification('Dados sincronizados com sucesso!'); // Mostrar notificação após sincronização
    } catch (error) {
      console.error('Error syncing data:', error);
      setNotification('Erro ao sincronizar dados: ' + error.message); // Mostrar notificação de erro
    } finally {
      setSyncing(false);
    }
  };

  const fetchVisits = async () => {
    try {
      const { data, error } = await supabase
        .from('visits')
        .select('*')
        .order('date_time', { ascending: true });

      if (error) {
        console.error('Error fetching visits:', error);
        return;
      }

      setVisits(data || []);
    } catch (error) {
      console.error('Error in fetchVisits:', error);
    }
  };

  const handleLogin = (user) => {
    console.log('Login successful:', user);
    setLoggedInUser(user);
    navigate("/");
  };

  const handleLogout = () => {
    authService.logout();
    setLoggedInUser(null);
    navigate("/login");
  };

  const handleFinalizeBudget = async (budgetId) => {
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: 'finalizado' })
        .eq('id', budgetId);

      if (error) throw error;

      const updatedBudgets = budgets.map(budget =>
        budget.id === budgetId ? { ...budget, status: 'finalizado' } : budget
      );
      setBudgets(updatedBudgets);

      localDB.update('orcamentos', budgetId, { status: 'finalizado' });
      setNotification('Orçamento finalizado com sucesso!'); // Mostrar notificação após finalizar orçamento
    } catch (error) {
      console.error('Error finalizing budget:', error);
      setNotification('Erro ao finalizar orçamento: ' + error.message); // Mostrar notificação de erro
    }
  };

  const handleCancelBudget = async (budgetId) => {
    try {
      // First check if the budget exists and is in a cancellable state
      const { data: budget, error: fetchError } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('id', budgetId)
        .single();

      if (fetchError) throw fetchError;

      if (!budget) {
        throw new Error('Orçamento não encontrado');
      }

      // Verificar se o orçamento está em estado pendente (compatível com toda a aplicação)
      const isPending = (status) => {
        return status === 'pendente' || status === 'pending' || !status || status === '' || status === null || status === undefined;
      };

      if (!isPending(budget.status)) {
        throw new Error('Apenas orçamentos pendentes podem ser cancelados');
      }

      // Update in Supabase
      const { error: updateError } = await supabase
        .from('orcamentos')
        .update({ status: 'cancelado' })
        .eq('id', budgetId);

      if (updateError) throw updateError;

      // Update local state
      const updatedBudgets = budgets.map(budget =>
        budget.id === budgetId ? { ...budget, status: 'cancelado' } : budget
      );
      setBudgets(updatedBudgets);

      // Update local database
      const updatedBudget = { ...budget, status: 'cancelado' };
      await localDB.put('orcamentos', updatedBudget);

      // Show success message
      setNotification('Orçamento cancelado com sucesso!'); // Mostrar notificação após cancelar orçamento
    } catch (error) {
      console.error('Error canceling budget:', error);
      setNotification('Erro ao cancelar orçamento: ' + error.message); // Mostrar notificação de erro
    }
  };

  const handleReactivateBudget = async (budgetId) => {
    try {
      // First check if the budget exists and is canceled
      const { data: budget, error: fetchError } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('id', budgetId)
        .single();

      if (fetchError) throw fetchError;

      if (!budget) {
        throw new Error('Orçamento não encontrado');
      }

      if (budget.status !== 'cancelado') {
        throw new Error('Apenas orçamentos cancelados podem ser reativados');
      }

      // Update in Supabase
      const { error: updateError } = await supabase
        .from('orcamentos')
        .update({ status: 'pending' })
        .eq('id', budgetId);

      if (updateError) throw updateError;

      // Update local state
      const updatedBudgets = budgets.map(budget =>
        budget.id === budgetId ? { ...budget, status: 'pending' } : budget
      );
      setBudgets(updatedBudgets);

      // Update local database
      const updatedBudget = { ...budget, status: 'pending' };
      await localDB.put('orcamentos', updatedBudget);

      // Show success message
      setNotification('Orçamento reativado com sucesso!'); // Mostrar notificação após reativar orçamento
    } catch (error) {
      console.error('Error reactivating budget:', error);
      setNotification('Erro ao reativar orçamento: ' + error.message); // Mostrar notificação de erro
    }
  };

  const toggleSidebar = () => {
    setSidebarExpanded(!sidebarExpanded);
  };

  // Efeito para limpar notificações automaticamente
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000); // A notificação desaparece após 4 segundos
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Função para mostrar notificações
  const showNotification = (message) => {
    setNotification(message);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">Carregando...</div>
      </div>
    );
  }

  // If no user is logged in, show only the login page
  if (!loggedInUser) {
    return (
      <div className="app">
        <div className="login-page-container">
          <Login onLogin={handleLogin} companyLogo={companyLogo} />
        </div>
        <footer className="app-footer">
          <p>&copy; 2025 Vecchio Sistemas</p>
        </footer>
      </div>
    );
  }

  // If user is logged in, show the main application
  return (
    <div className="app">
      <button 
        className="menu-toggle" 
        onClick={toggleSidebar}
        aria-label="Toggle Menu"
      >
        {sidebarExpanded ? '✕' : '☰'}
      </button>
      
      {companyLogo && (
        <img 
          src={companyLogo} 
          alt="Logo da Empresa" 
          className="company-logo"
        />
      )}

      <div className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
        <nav>
          <ul className="nav-list">
            <li className="nav-item">
              <NavLink to="/" className="nav-link">
                <span className="icon">🏠</span>
                <span className="text">Home</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/customers" className="nav-link">
                <span className="icon">👥</span>
                <span className="text">Clientes</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/products" className="nav-link">
                <span className="icon">📦</span>
                <span className="text">Produtos</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/accessories" className="nav-link">
                <span className="icon">🔧</span>
                <span className="text">Acessórios</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/budgets" className="nav-link">
                <span className="icon">📝</span>
                <span className="text">Orçamentos</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/reports" className="nav-link">
                <span className="icon">📊</span>
                <span className="text">Relatórios</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/visits" className="nav-link">
                <span className="icon">📅</span>
                <span className="text">Visitas</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink to="/configuracoes" className="nav-link">
                <span className="icon">⚙️</span>
                <span className="text">Configurações</span>
              </NavLink>
            </li>
            <li className="nav-item">
              <button onClick={handleLogout} className="nav-link logout-button">
                <span className="icon">🚪</span>
                <span className="text">Sair</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
      <main className={`main-content ${sidebarExpanded ? 'expanded' : ''}`}>
        {notification && (
          <div className="notification">
            {notification}
          </div>
        )}
        <Routes>
          <Route 
            path="/" 
            element={<HomePage 
              budgets={budgets} 
              customers={customers} 
              visits={visits} 
              setVisits={setVisits}
            />}
          />
          <Route 
            path="/customers" 
            element={
              authService.hasAccess('admin') ? (
                <Customers 
                  customers={customers} 
                  setCustomers={setCustomers}
                />
              ) : (
                <div>Acesso restrito</div>
              )
            }
          />
          <Route 
            path="/products" 
            element={<Products products={products} setProducts={setProducts} />}
          />
          <Route 
            path="/accessories" 
            element={<Accessories accessories={accessories} setAccessories={setAccessories} />}
          />
          <Route 
            path="/budgets" 
            element={<BudgetStatusPage budgets={budgets} setBudgets={setBudgets} validadeOrcamento={validadeOrcamento} />}
          />
          <Route 
            path="/budgets/new" 
            element={<Budgets 
              budgets={budgets} 
              setBudgets={setBudgets} 
              customers={customers} 
              products={products} 
              accessories={accessories} 
              setCustomers={setCustomers} 
            />}
          />
          <Route 
            path="/budgets/:budgetId/edit" 
            element={<Budgets 
              budgets={budgets} 
              setBudgets={setBudgets} 
              customers={customers} 
              products={products} 
              accessories={accessories} 
              setCustomers={setCustomers} 
            />}
          />
          <Route 
            path="/budgets/:budgetId/view" 
            element={<BudgetDetailsPage companyLogo={companyLogo} />}
          />
          <Route 
            path="/reports" 
            element={<Reports budgets={budgets} customers={customers} />}
          />
          <Route 
            path="/visits" 
            element={<VisitScheduler visits={visits} setVisits={setVisits} />}
          />
          <Route 
            path="/configuracoes" 
            element={
              authService.hasAccess('admin') ? (
                <Configuracoes 
                  setCompanyLogo={setCompanyLogo} 
                  companyLogo={companyLogo} 
                  validadeOrcamento={validadeOrcamento} 
                  setValidadeOrcamento={setValidadeOrcamento} 
                />
              ) : (
                <div>Acesso restrito</div>
              )
            }
          />
          <Route 
            path="/test" 
            element={<TestDB />}
          />
        </Routes>
      </main>
      
      <footer className="app-footer">
        <div>&copy; 2025 Vecchio Sistemas <ConnectionStatus /></div>
      </footer>
    </div>
  );
}

export default App;
