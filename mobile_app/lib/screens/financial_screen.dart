import 'package:flutter/material.dart';

class FinancialScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Financeiro'),
          bottom: TabBar(
            tabs: [
              Tab(text: 'Resumo'),
              Tab(text: 'Transações'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _buildSummaryTab(),
            _buildTransactionsTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryTab() {
    return SingleChildScrollView(
      padding: EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildBalanceCard(),
          SizedBox(height: 16.0),
          _buildMetricsGrid(),
          SizedBox(height: 16.0),
          _buildRecentTransactionsList(),
        ],
      ),
    );
  }

  Widget _buildBalanceCard() {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saldo Total',
              style: TextStyle(fontSize: 16.0),
            ),
            SizedBox(height: 8.0),
            Text(
              'R\$ 0,00',
              style: TextStyle(
                fontSize: 32.0,
                fontWeight: FontWeight.bold,
                color: Colors.green,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricsGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: NeverScrollableScrollPhysics(),
      mainAxisSpacing: 16.0,
      crossAxisSpacing: 16.0,
      children: [
        _buildMetricCard(
          'Receitas do Mês',
          'R\$ 0,00',
          Colors.green,
          Icons.arrow_upward,
        ),
        _buildMetricCard(
          'Despesas do Mês',
          'R\$ 0,00',
          Colors.red,
          Icons.arrow_downward,
        ),
        _buildMetricCard(
          'Orçamentos Pendentes',
          '0',
          Colors.orange,
          Icons.pending,
        ),
        _buildMetricCard(
          'Orçamentos Aprovados',
          '0',
          Colors.blue,
          Icons.check_circle,
        ),
      ],
    );
  }

  Widget _buildMetricCard(String title, String value, Color color, IconData icon) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 32.0),
            SizedBox(height: 8.0),
            Text(
              title,
              style: TextStyle(fontSize: 14.0),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 4.0),
            Text(
              value,
              style: TextStyle(
                fontSize: 20.0,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentTransactionsList() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Transações Recentes',
          style: TextStyle(
            fontSize: 20.0,
            fontWeight: FontWeight.bold,
          ),
        ),
        SizedBox(height: 16.0),
        ListView.builder(
          shrinkWrap: true,
          physics: NeverScrollableScrollPhysics(),
          itemCount: 0, // TODO: Implementar lista de transações
          itemBuilder: (context, index) {
            return Card(
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: Colors.green[100],
                  child: Icon(Icons.attach_money, color: Colors.green),
                ),
                title: Text('Descrição da Transação'),
                subtitle: Text('00/00/0000'),
                trailing: Text(
                  'R\$ 0,00',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.green,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildTransactionsTab() {
    return Column(
      children: [
        Padding(
          padding: EdgeInsets.all(16.0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Pesquisar transações...',
                    prefixIcon: Icon(Icons.search),
                    border: OutlineInputBorder(),
                  ),
                ),
              ),
              SizedBox(width: 16.0),
              PopupMenuButton(
                icon: Icon(Icons.filter_list),
                itemBuilder: (context) => [
                  PopupMenuItem(
                    child: Text('Todas'),
                    value: 'all',
                  ),
                  PopupMenuItem(
                    child: Text('Receitas'),
                    value: 'income',
                  ),
                  PopupMenuItem(
                    child: Text('Despesas'),
                    value: 'expense',
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: 0, // TODO: Implementar lista de transações
            itemBuilder: (context, index) {
              return Card(
                margin: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.green[100],
                    child: Icon(Icons.attach_money, color: Colors.green),
                  ),
                  title: Text('Descrição da Transação'),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Data: 00/00/0000'),
                      Text('Categoria: Exemplo'),
                    ],
                  ),
                  trailing: Text(
                    'R\$ 0,00',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                  isThreeLine: true,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
