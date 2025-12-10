import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';

function Dashboard({ budgets, customers, visits }) {
  // Calculate metrics
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const monthlyBudgets = budgets.filter(budget => {
    const budgetDate = new Date(budget.created_at);
    return budgetDate.getMonth() === currentMonth && budgetDate.getFullYear() === currentYear;
  });

  const finalizedBudgets = budgets.filter(budget => {
    const budgetDate = new Date(budget.created_at);
    return budget.status === 'finalizado' && 
           budgetDate.getMonth() === currentMonth && 
           budgetDate.getFullYear() === currentYear;
  });
  const numberOfCustomers = customers.length;
  const numberOfVisits = visits.length;

  return (
    <div className="dashboard">
      <div className="dashboard-item">
        <h3>Orçamentos Realizados no Mês</h3>
        <p>{monthlyBudgets.length}</p>
        <Link to="/budgets?filter=monthly">Mais informações</Link>
      </div>

      <div className="dashboard-item">
        <h3>Orçamentos Finalizados</h3>
        <p>{finalizedBudgets.length}</p>
        <Link to="/budgets?filter=finalized">Mais informações</Link>
      </div>

      <div className="dashboard-item">
        <h3>Número de Clientes na Base</h3>
        <p>{numberOfCustomers}</p>
        <Link to="/customers">Mais informações</Link>
      </div>

      <div className="dashboard-item">
        <h3>Agendamentos de Visitas</h3>
        <p>{numberOfVisits}</p>
        <Link to="/visits">Mais informações</Link>
      </div>
    </div>
  );
}

export default Dashboard;
