import React from 'react';
import BudgetList from './BudgetList';
import { supabase } from '../supabase/client';
import { localDB } from '../services/localDatabase';

function BudgetStatusPage({ budgets, setBudgets, validadeOrcamento }) {
  // Helper function to check if a budget status is pending
  const isPending = (status) => {
    return status === 'pendente';
  };

  // Function to finalize a budget
  const handleFinalizeBudget = async (budgetId) => {
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: 'finalizado' })
        .eq('id', budgetId);

      if (error) throw error;

      await localDB.update('orcamentos', budgetId, { status: 'finalizado' });

      const updatedBudgets = budgets.map(budget =>
        String(budget.id) === String(budgetId) ? { ...budget, status: 'finalizado' } : budget
      );
      setBudgets(updatedBudgets);
      alert(`Orçamento finalizado com sucesso.`);
    } catch (error) {
      console.error('Error finalizing budget:', error);
      alert('Erro ao finalizar orçamento.');
    }
  };

  // Function to cancel a budget
  const handleCancelBudget = async (budgetId) => {
    try {
      const budgetToCancel = budgets.find(b => String(b.id) === String(budgetId));
      
      if (!budgetToCancel) {
        console.error(`Budget with ID ${budgetId} not found in local state`);
        alert('Orçamento não encontrado');
        return;
      }
      
      // Only cancel if the budget is in pending status
      if (!isPending(budgetToCancel.status)) {
        alert('Apenas orçamentos pendentes podem ser cancelados');
        return;
      }
      
      // Update the budget status to cancelado
      const { error } = await supabase
        .from('orcamentos')
        .update({ status: 'cancelado' })
        .eq('id', budgetId);

      if (error) throw error;

      await localDB.update('orcamentos', budgetId, { status: 'cancelado' });
      
      // Update local state
      const updatedBudgets = budgets.map(budget =>
        String(budget.id) === String(budgetId) ? { ...budget, status: 'cancelado' } : budget
      );
      
      setBudgets(updatedBudgets);
      alert(`Orçamento cancelado com sucesso.`);
    } catch (error) {
      console.error('Error details:', error);
      alert(`Erro ao cancelar orçamento: ${error.message || 'Erro desconhecido'}`);
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

      await localDB.update('orcamentos', budgetId, { status: 'pendente' });

      const updatedBudgets = budgets.map(budget =>
        String(budget.id) === String(budgetId) ? { ...budget, status: 'pendente' } : budget
      );
      setBudgets(updatedBudgets);
      alert(`Orçamento reativado com sucesso.`);
    } catch (error) {
      console.error('Error reactivating budget:', error);
      alert('Erro ao reativar orçamento.');
    }
  };

  // Function to delete a budget
  const handleDeleteBudget = async (budgetId) => {
    if (!window.confirm('Tem certeza de que deseja excluir este orçamento? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('orcamentos')
        .delete()
        .eq('id', budgetId);

      if (error) throw error;

      await localDB.delete('orcamentos', budgetId);

      const updatedBudgets = budgets.filter(budget => String(budget.id) !== String(budgetId));
      setBudgets(updatedBudgets);
      alert(`Orçamento excluído com sucesso.`);
    } catch (error) {
      console.error('Error deleting budget:', error);
      alert(`Erro ao excluir orçamento: ${error.message || 'Erro desconhecido'}`);
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
        onDeleteBudget={handleDeleteBudget}
      />
    </div>
  );
}

export default BudgetStatusPage;
