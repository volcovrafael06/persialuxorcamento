import React from 'react';
import BudgetList from './BudgetList';
import { supabase } from '../supabase/client';

function BudgetStatusPage({ budgets, setBudgets, validadeOrcamento }) {
  // Debug log to see the budgets data
  console.log('BudgetStatusPage - All budgets:', budgets);
  
  // Helper function to check if a budget status is pending (igual à função no BudgetList)
  const isPending = (status) => {
    return status === 'pendente' || status === 'pending' || !status || status === '' || status === null || status === undefined;
  };
  
  // Check if we have any budgets with pending status - agora usando a função isPending
  const pendingBudgets = budgets.filter(budget => 
    isPending(budget.status)
  );
  console.log('BudgetStatusPage - Pending budgets:', pendingBudgets);

  // Function to finalize a budget
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
      alert(`Orçamento ${budgetId} finalizado.`);
    } catch (error) {
      console.error('Error finalizing budget:', error);
      alert('Erro ao finalizar orçamento.');
    }
  };

  // Function to cancel a budget
  const handleCancelBudget = async (budgetId) => {
    try {
      console.log(`Attempting to cancel budget ID: ${budgetId}`);
      
      // First, find the budget in our local state to check its status
      const budgetToCancel = budgets.find(b => b.id === budgetId);
      
      if (!budgetToCancel) {
        console.error(`Budget with ID ${budgetId} not found in local state`);
        alert('Orçamento não encontrado');
        return;
      }
      
      // Only cancel if the budget is in pending status
      if (!isPending(budgetToCancel.status)) {
        console.log(`Cannot cancel budget with status: ${budgetToCancel.status}`);
        alert('Apenas orçamentos pendentes podem ser cancelados');
        return;
      }
      
      // Update the budget status to cancelado
      const { data, error } = await supabase
        .from('orcamentos')
        .update({ status: 'cancelado' })
        .eq('id', budgetId);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Budget canceled successfully, updating UI');
      
      // Update local state
      const updatedBudgets = budgets.map(budget =>
        budget.id === budgetId ? { ...budget, status: 'cancelado' } : budget
      );
      
      setBudgets(updatedBudgets);
      alert(`Orçamento ${budgetId} foi cancelado com sucesso.`);
    } catch (error) {
      console.error('Error details:', error);
      alert(`Erro ao cancelar orçamento: ${error.message || 'Unknown error'}`);
    }
  };

  // Function to reactivate a budget
  const handleReactivateBudget = async (budgetId) => {
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: 'pendente' })
        .eq('id', budgetId);

      if (error) throw error;

      const updatedBudgets = budgets.map(budget =>
        budget.id === budgetId ? { ...budget, status: 'pendente' } : budget
      );
      setBudgets(updatedBudgets);
      alert(`Orçamento ${budgetId} reativado.`);
    } catch (error) {
      console.error('Error reactivating budget:', error);
      alert('Erro ao reativar orçamento.');
    }
  };

  return (
    <div>
      <h2>Orçamentos</h2>
      <BudgetList
        budgets={budgets}
        validadeOrcamento={validadeOrcamento}
        onFinalizeBudget={handleFinalizeBudget}
        onCancelBudget={handleCancelBudget}
        onReactivateBudget={handleReactivateBudget}
      />
    </div>
  );
}

export default BudgetStatusPage;
