import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import BudgetStatusPage from './components/BudgetStatusPage';
import Budgets from './components/Budgets';
import Customers from './components/Customers';
import Products from './components/Products';
import Accessories from './components/Accessories';
import Reports from './components/Reports';
import Login from './components/Login';
import Configuracoes from './components/Configuracoes';
import BudgetDetailsPage from './components/BudgetDetailsPage';
import HomePage from './components/HomePage';
import VisitScheduler from './components/VisitScheduler';
import Despesas from './components/Despesas';
import TaxasCartao from './components/TaxasCartao';
import ContasPagar from './components/ContasPagar';
import ContasReceber from './components/ContasReceber';
import ProductSelectorCascataTest from './pages/ProductSelectorCascataTest';
import OrcamentoV2 from './pages/OrcamentoV2';
import ConnectionStatus from './components/ConnectionStatus';
import './components/ConnectionStatus.css';
import { supabase } from './supabase/client';
import { authService } from './services/authService';
import { keepStableUserReference } from './services/authState';
import { syncService } from './services/syncService';
import { localDB } from './services/localDatabase';
import { storageService } from './services/storageService';

const EMPTY_DATA = {
  budgets: [],
  customers: [],
  products: [],
  accessories: []
};

function App() {
  const [companyLogo, setCompanyLogo] = useState(null);
  const [validadeOrcamento, setValidadeOrcamento] = useState('30');
  const [customers, setCustomers] = useState(EMPTY_DATA.customers);
  const [products, setProducts] = useState(EMPTY_DATA.products);
  const [accessories, setAccessories] = useState(EMPTY_DATA.accessories);
  const [budgets, setBudgets] = useState(EMPTY_DATA.budgets);
  const [visits, setVisits] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [notification, setNotification] = useState(null);
  const syncPromiseRef = useRef(null);
  const navigate = useNavigate();
  const loggedInUserId = loggedInUser?.id;

  const applyCachedData = useCallback(async () => {
    const [
      localBudgets,
      localCustomers,
      localProducts,
      localProdutosAcessorios,
      localAccessories,
      localConfigs,
      localVisits
    ] = await Promise.all([
      localDB.getAll('orcamentos'),
      localDB.getAll('clientes'),
      localDB.getAll('produtos'),
      localDB.getAll('produtos_acessorios'),
      localDB.getAll('accessories'),
      localDB.getAll('configuracoes'),
      localDB.getAll('visits')
    ]);

    setBudgets(localBudgets || []);
    setCustomers(localCustomers || []);
    setProducts(localProducts || []);
    // Prioriza a nova tabela; fallback para a legada se a nova estiver vazia
    // (ambiente ainda não migrado).
    setAccessories(
      (localProdutosAcessorios && localProdutosAcessorios.length > 0)
        ? localProdutosAcessorios
        : (localAccessories || [])
    );
    setVisits(localVisits || []);

    const localConfig = localConfigs?.[0];
    if (localConfig) {
      try {
        setCompanyLogo(await storageService.getLogoUrl(localConfig.company_logo));
      } catch (error) {
        console.error('Erro ao carregar logo:', error);
        setCompanyLogo(null);
      }
      setValidadeOrcamento(String(localConfig.validade_orcamento || 30));
    }
  }, []);

  const syncData = useCallback(async ({ notify = true } = {}) => {
    if (syncPromiseRef.current) return syncPromiseRef.current;

    setSyncing(true);
    const syncPromise = (async () => {
      await syncService.syncAll();
      await applyCachedData();
      if (notify) setNotification('Dados sincronizados com sucesso!');
    })();

    syncPromiseRef.current = syncPromise;

    try {
      return await syncPromise;
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      if (notify) setNotification(`Erro ao sincronizar dados: ${error.message}`);
      throw error;
    } finally {
      syncPromiseRef.current = null;
      setSyncing(false);
    }
  }, [applyCachedData]);

  const fetchVisits = useCallback(async () => {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .order('date_time', { ascending: true });

    if (error) throw error;
    setVisits(data || []);
  }, []);

  useEffect(() => {
    let active = true;

    authService.getCurrentUser()
      .then(user => {
        if (active) {
          setLoggedInUser(currentUser => keepStableUserReference(currentUser, user));
        }
      })
      .catch(error => console.error('Erro ao restaurar sessão:', error))
      .finally(() => {
        if (active) setAuthReady(true);
      });

    const subscription = authService.onAuthStateChange(user => {
      if (active) {
        setLoggedInUser(currentUser => keepStableUserReference(currentUser, user));
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loggedInUser) return undefined;

    let active = true;
    setLoading(true);

    const loadAuthenticatedData = async () => {
      try {
        await applyCachedData();

        if (navigator.onLine) {
          await Promise.all([
            syncData({ notify: false }),
            fetchVisits()
          ]);
        }
      } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        if (active) setNotification(`Erro ao carregar dados: ${error.message}`);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAuthenticatedData();

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) syncData({ notify: false }).catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [applyCachedData, fetchVisits, loggedInUserId, syncData]);

  useEffect(() => {
    if (!loggedInUser) return undefined;

    const channel = supabase
      .channel('business_data_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, payload => {
        syncData({ notify: false }).catch(() => {});
        setNotification(`Orçamento ${payload.eventType === 'DELETE' ? 'removido' : 'atualizado'}.`);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, payload => {
        syncData({ notify: false }).catch(() => {});
        setNotification(`Cliente ${payload.eventType === 'DELETE' ? 'removido' : 'atualizado'}.`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loggedInUserId, syncData]);

  useEffect(() => {
    if (!loggedInUser) return undefined;

    const handleOnline = () => {
      setNotification('Conexão restabelecida. Sincronizando dados...');
      syncData({ notify: false }).catch(() => {});
      fetchVisits().catch(() => {});
    };
    const handleOffline = () => {
      setNotification('Sem conexão. Usando os dados armazenados neste dispositivo.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchVisits, loggedInUserId, syncData]);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = window.setTimeout(() => setNotification(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  const handleLogin = user => {
    setLoggedInUser(user);
    navigate('/');
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Erro ao sair:', error);
    } finally {
      setLoggedInUser(null);
      setBudgets([]);
      setCustomers([]);
      setProducts([]);
      setAccessories([]);
      setVisits([]);
      navigate('/login');
    }
  };

  const isAdmin = authService.hasAccess('admin', loggedInUser);

  if (!authReady) {
    return <div className="loading-screen"><div className="loading-spinner">Verificando sessão...</div></div>;
  }

  if (!loggedInUser) {
    return (
      <div className="app">
        <div className="login-page-container">
          <Login onLogin={handleLogin} companyLogo={companyLogo} />
        </div>
        <footer className="app-footer"><p>&copy; 2026 Vecchio Sistemas</p></footer>
      </div>
    );
  }

  if (loading) {
    return <div className="loading-screen"><div className="loading-spinner">Carregando dados...</div></div>;
  }

  return (
    <div className="app">
      <button
        className="menu-toggle"
        onClick={() => setSidebarExpanded(expanded => !expanded)}
        aria-label="Alternar menu"
      >
        {sidebarExpanded ? '✕' : '☰'}
      </button>

      {companyLogo && <img src={companyLogo} alt="Logo da Empresa" className="company-logo" />}

      <div className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
        <nav aria-label="Navegação principal">
          <ul className="nav-list">
            <li className="nav-item"><NavLink to="/" className="nav-link"><span className="icon">🏠</span><span className="text">Home</span></NavLink></li>
            <li className="nav-item"><NavLink to="/customers" className="nav-link"><span className="icon">👥</span><span className="text">Clientes</span></NavLink></li>
            <li className="nav-item"><NavLink to="/products" className="nav-link"><span className="icon">📦</span><span className="text">Produtos</span></NavLink></li>
            <li className="nav-item"><NavLink to="/accessories" className="nav-link"><span className="icon">🔧</span><span className="text">Acessórios</span></NavLink></li>
            <li className="nav-item"><NavLink to="/budgets" className="nav-link"><span className="icon">📝</span><span className="text">Orçamentos</span></NavLink></li>
            <li className="nav-item"><NavLink to="/orcamento-v2" className="nav-link"><span className="icon">✨</span><span className="text">Orçamento v2</span></NavLink></li>
            <li className="nav-item"><NavLink to="/reports" className="nav-link"><span className="icon">📊</span><span className="text">Relatórios</span></NavLink></li>
            <li className="nav-item"><NavLink to="/visits" className="nav-link"><span className="icon">📅</span><span className="text">Visitas</span></NavLink></li>
            {isAdmin && <>
              <li className="nav-item"><NavLink to="/despesas" className="nav-link"><span className="icon">💸</span><span className="text">Despesas</span></NavLink></li>
              <li className="nav-item"><NavLink to="/taxas-cartao" className="nav-link"><span className="icon">💳</span><span className="text">Taxas de Cartão</span></NavLink></li>
              <li className="nav-item"><NavLink to="/contas-pagar" className="nav-link"><span className="icon">📤</span><span className="text">Contas a Pagar</span></NavLink></li>
              <li className="nav-item"><NavLink to="/contas-receber" className="nav-link"><span className="icon">📥</span><span className="text">Contas a Receber</span></NavLink></li>
              <li className="nav-item"><NavLink to="/configuracoes" className="nav-link"><span className="icon">⚙️</span><span className="text">Configurações</span></NavLink></li>
            </>}
            <li className="nav-item"><button onClick={handleLogout} className="nav-link logout-button"><span className="icon">🚪</span><span className="text">Sair</span></button></li>
          </ul>
        </nav>
      </div>

      <main className={`main-content ${sidebarExpanded ? 'expanded' : ''}`}>
        {notification && <div className="notification" role="status">{notification}</div>}
        {syncing && <span className="sr-only" aria-live="polite">Sincronizando dados</span>}
        <Routes>
          <Route path="/" element={<HomePage budgets={budgets} customers={customers} visits={visits} setVisits={setVisits} />} />
          <Route path="/customers" element={isAdmin ? <Customers customers={customers} setCustomers={setCustomers} /> : <div>Acesso restrito</div>} />
          <Route path="/products" element={<Products products={products} setProducts={setProducts} />} />
          <Route path="/accessories" element={<Accessories accessories={accessories} setAccessories={setAccessories} />} />
          <Route path="/test-cascata" element={<ProductSelectorCascataTest />} />
          <Route path="/orcamento-v2" element={<OrcamentoV2 products={products} customers={customers} setCustomers={setCustomers} accessories={accessories} />} />
          <Route path="/budgets" element={<BudgetStatusPage budgets={budgets} setBudgets={setBudgets} validadeOrcamento={validadeOrcamento} />} />
          <Route path="/budgets/new" element={<Budgets budgets={budgets} setBudgets={setBudgets} customers={customers} products={products} accessories={accessories} setCustomers={setCustomers} />} />
          <Route path="/budgets/:budgetId/edit" element={<Budgets budgets={budgets} setBudgets={setBudgets} customers={customers} products={products} accessories={accessories} setCustomers={setCustomers} />} />
          <Route path="/budgets/:budgetId/view" element={<BudgetDetailsPage companyLogo={companyLogo} />} />
          <Route path="/reports" element={<Reports budgets={budgets} customers={customers} />} />
          <Route path="/visits" element={<VisitScheduler visits={visits} setVisits={setVisits} />} />
          <Route path="/despesas" element={isAdmin ? <Despesas /> : <div>Acesso restrito</div>} />
          <Route path="/taxas-cartao" element={isAdmin ? <TaxasCartao /> : <div>Acesso restrito</div>} />
          <Route path="/contas-pagar" element={isAdmin ? <ContasPagar /> : <div>Acesso restrito</div>} />
          <Route path="/contas-receber" element={isAdmin ? <ContasReceber /> : <div>Acesso restrito</div>} />
          <Route path="/configuracoes" element={isAdmin ? <Configuracoes setCompanyLogo={setCompanyLogo} /> : <div>Acesso restrito</div>} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app-footer"><div>&copy; 2026 Vecchio Sistemas <ConnectionStatus /></div></footer>
    </div>
  );
}

export default App;
