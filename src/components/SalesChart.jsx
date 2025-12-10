import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import './SalesChart.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function SalesChart({ budgets }) {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: []
  });

  useEffect(() => {
    if (!budgets || budgets.length === 0) return;

    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Month names in Portuguese
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Initialize monthly data
    const monthlyData = Array(12).fill().map(() => ({ count: 0, totalValue: 0 }));

    // Process budgets data
    budgets.forEach(budget => {
      const budgetDate = new Date(budget.created_at);
      const budgetYear = budgetDate.getFullYear();
      
      // Only process budgets from current year
      if (budgetYear === currentYear) {
        const month = budgetDate.getMonth();
        
        // Only count finalized budgets (sales)
        if (budget.status === 'finalizado') {
          monthlyData[month].count += 1;
          
          // Use negotiated value if available, otherwise use total value
          const value = budget.valor_negociado || budget.valor_total || 0;
          monthlyData[month].totalValue += parseFloat(value);
        }
      }
    });

    // Prepare chart data
    setChartData({
      labels: monthNames,
      datasets: [
        {
          label: 'Quantidade de Vendas',
          data: monthlyData.map(data => data.count),
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
          borderColor: 'rgba(53, 162, 235, 1)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Valor Total (R$)',
          data: monthlyData.map(data => data.totalValue),
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
          yAxisID: 'y1'
        }
      ]
    });
  }, [budgets]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Quantidade de Vendas'
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: {
          drawOnChartArea: false
        },
        title: {
          display: true,
          text: 'Valor Total (R$)'
        },
        ticks: {
          callback: function(value) {
            return 'R$ ' + value.toLocaleString('pt-BR');
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Vendas por Mês'
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.datasetIndex === 1) {
              label += 'R$ ' + context.raw.toLocaleString('pt-BR');
            } else {
              label += context.raw;
            }
            return label;
          }
        }
      }
    }
  };

  return (
    <div className="sales-chart-container">
      <h2>Desempenho de Vendas</h2>
      <div className="chart-wrapper">
        {budgets && budgets.length > 0 ? (
          <Bar data={chartData} options={options} />
        ) : (
          <p className="no-data-message">Não há dados de vendas disponíveis para exibição.</p>
        )}
      </div>
    </div>
  );
}

export default SalesChart;
