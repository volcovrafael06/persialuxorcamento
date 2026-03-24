import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/client';
import './BudgetList.css';

function BudgetList({ budgets, validadeOrcamento, onFinalizeBudget, onCancelBudget, onReactivateBudget }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const [filter, setFilter] = useState(queryParams.get('filter') || 'all');
  const [searchTerm, setSearchTerm] = useState('');
  const [localBudgets, setLocalBudgets] = useState([]);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Helper function to check if a budget status is pending
  const isPending = (status) => {
    // Check for all possible pending status variations
    return status === 'pendente' || status === 'pending' || !status || status === '' || status === null || status === undefined;
  };

  // Carregar dados completos dos orçamentos com informações de clientes
  useEffect(() => {
    const loadBudgetsWithCustomers = async () => {
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
          
        if (error) {
          console.error('Erro ao carregar orçamentos com clientes:', error);
          return;
        }
        
        console.log('Orçamentos com clientes carregados:', data.length);
        setLocalBudgets(data);
      } catch (err) {
        console.error('Erro ao processar orçamentos:', err);
      }
    };
    
    loadBudgetsWithCustomers();
    
    // Configurar listener para mudanças nos clientes
    const clientesSubscription = supabase
      .channel('clientes_changes_budgetlist')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'clientes' 
        }, 
        () => {
          // Recarregar os orçamentos quando houver mudanças nos clientes
          loadBudgetsWithCustomers();
        }
      )
      .subscribe();
      
    return () => {
      clientesSubscription.unsubscribe();
    };
  }, []);

  const calculateExpirationDate = (creationDate, validadeOrcamento) => {
    const creation = new Date(creationDate);
    const validityDays = parseInt(validadeOrcamento, 10);
    const expirationDate = new Date(creation.setDate(creation.getDate() + validityDays));
    return expirationDate;
  };

  const isExpired = (creationDate, validadeOrcamento) => {
    const expirationDate = calculateExpirationDate(creationDate, validadeOrcamento);
    return new Date() > expirationDate;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
  };

  const getCustomerDisplayName = (budget) => {
    // Se o cliente existe e tem nome, exibe o nome
    if (budget.clientes && budget.clientes.name) {
      return budget.clientes.name;
    }
    
    // Se não tem cliente mas tem cliente_id, indica que o cliente existe mas o join falhou
    if (budget.cliente_id && !budget.clientes) {
      return 'Carregando cliente...';
    }
    
    // Se não tem cliente_id ou se cliente_id é null/undefined
    return 'Cliente não encontrado';
  };

  // Usar os orçamentos do estado local (que têm info completa de clientes) ou os passados por props
  const budgetsToUse = localBudgets.length > 0 ? localBudgets : budgets;

  const filteredBudgets = budgetsToUse
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter(budget => {
      if (filter === 'monthly') {
        const budgetDate = new Date(budget.created_at);
        return budgetDate.getMonth() === currentMonth && budgetDate.getFullYear() === currentYear;
      } else if (filter === 'pending') {
        return isPending(budget.status);
      } else if (filter === 'finalized') {
        return budget.status === 'finalizado';
      } else if (filter === 'canceled') {
        return budget.status === 'cancelado';
      }
      return true;
    })
    .filter(budget => {
      // Se não houver termo de busca, retorna todos
      if (!searchTerm.trim()) return true;
      
      // Se o cliente não existir, considere apenas "Cliente não encontrado" para pesquisa
      const customerName = budget.clientes?.name || 'Cliente não encontrado';
      return customerName.toUpperCase().includes(searchTerm.toUpperCase());
    });

  return (
    <div>
      <Link to="/budgets/new" className="new-budget-button">Novo Orçamento</Link>

      <div className="budget-list">
        <div className="search-filter-container">
          <input
            type="text"
            placeholder="Buscar orçamentos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <div className="filter-buttons">
            <button 
              className={`filter-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              Todos
            </button>
            <button 
              className={`filter-button ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pendentes
            </button>
            <button 
              className={`filter-button ${filter === 'finalized' ? 'active' : ''}`}
              onClick={() => setFilter('finalized')}
            >
              Finalizados
            </button>
            <button 
              className={`filter-button ${filter === 'canceled' ? 'active' : ''}`}
              onClick={() => setFilter('canceled')}
            >
              Cancelados
            </button>
            <button 
              className={`filter-button ${filter === 'monthly' ? 'active' : ''}`}
              onClick={() => setFilter('monthly')}
            >
              Mensal
            </button>
          </div>
        </div>

        <div className="table-container">
          {filteredBudgets.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Valor Total</th>
                  <th>Data de Criação</th>
                  <th>Válido até</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredBudgets.map(budget => (
                  <tr key={budget.id}>
                    <td data-component-name="BudgetList">{getCustomerDisplayName(budget)}</td>
                    <td>
                      {budget.valor_negociado ? (
                        <div>
                          {parseFloat(budget.valor_negociado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          <br/>
                          <small className="text-gray-500">
                            Original: {parseFloat(budget.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </small>
                        </div>
                      ) : (
                        parseFloat(budget.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      )}
                    </td>
                    <td>{formatDate(budget.created_at)}</td>
                    <td>
                      {formatDate(calculateExpirationDate(budget.created_at, validadeOrcamento))}
                      {isExpired(budget.created_at, validadeOrcamento) && isPending(budget.status) && (
                        <span className="expired-tag">EXPIRADO</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-${isExpired(budget.created_at, validadeOrcamento) && isPending(budget.status) ? 'expired' : budget.status || 'pendente'}`}>
                        {isExpired(budget.created_at, validadeOrcamento) && isPending(budget.status) ? 'expirado' : budget.status || 'pendente'}
                      </span>
                    </td>
                    <td className="action-buttons">
                      {/* Buttons based on status */}
                      
                      {/* Visualizar button - All statuses */}
                      <Link 
                        to={`/budgets/${budget.id}/view`}
                        className="action-button view-button"
                        title="Visualizar"
                      >
                        <i className="fas fa-eye"></i>
                      </Link>

                      {/* For Pending Status: Visualizar, Finalizar, Editar, Cancelar */}
                      {(isPending(budget.status)) && (
                        <>
                          {/* Debug display - remove after testing */}
                          {console.log(`Budget ${budget.id} has status: "${budget.status}" - shows Pending Buttons`)}
                          <button
                            onClick={() => onFinalizeBudget(budget.id)}
                            className="action-button finalize-button"
                            title="Finalizar"
                          >
                            <i className="fas fa-check"></i>
                          </button>
                          
                          <Link 
                            to={`/budgets/${budget.id}/edit`}
                            className="action-button edit-button"
                            title="Editar"
                          >
                            <i className="fas fa-pen"></i>
                          </Link>
                          
                          <button
                            onClick={() => {
                              console.log(`Canceling budget with ID: ${budget.id}`);
                              onCancelBudget(budget.id);
                            }}
                            className="action-button cancel-button"
                            title="Cancelar"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </>
                      )}
                      
                      {/* For Finalized Status: Visualizar, Editar */}
                      {budget.status === 'finalizado' && (
                        <Link 
                          to={`/budgets/${budget.id}/edit`}
                          className="action-button edit-button"
                          title="Editar"
                        >
                          <i className="fas fa-pen"></i>
                        </Link>
                      )}
                      
                      {/* For Canceled Status: Visualizar, Editar, Reativar */}
                      {budget.status === 'cancelado' && (
                        <>
                          <Link 
                            to={`/budgets/${budget.id}/edit`}
                            className="action-button edit-button"
                            title="Editar"
                          >
                            <i className="fas fa-pen"></i>
                          </Link>
                          
                          <button
                            onClick={() => onReactivateBudget(budget.id)}
                            className="action-button reactivate-button"
                            title="Reativar"
                          >
                            <i className="fas fa-redo"></i>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Nenhum orçamento encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default BudgetList;
