import React from 'react';
import Dashboard from './Dashboard';
import SalesChart from './SalesChart';

function HomePage({ budgets, customers, visits }) {
  return (
    <div className="home-page">
      <Dashboard budgets={budgets} customers={customers} visits={visits} />
      <SalesChart budgets={budgets} />
    </div>
  );
}

export default HomePage;
