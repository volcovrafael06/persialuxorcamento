import 'package:flutter/material.dart';
import 'customers_screen.dart';
import 'products_screen.dart';
import 'budgets_screen.dart';
import 'settings_screen.dart';
import 'visits_screen.dart';
import 'financial_screen.dart';

class HomeScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> modules = [
      {
        'title': 'Clientes',
        'icon': Icons.people,
        'color': Colors.blue,
      },
      {
        'title': 'Produtos',
        'icon': Icons.inventory,
        'color': Colors.green,
      },
      {
        'title': 'Orçamentos',
        'icon': Icons.description,
        'color': Colors.orange,
      },
      {
        'title': 'Configurações',
        'icon': Icons.settings,
        'color': Colors.grey,
      },
      {
        'title': 'Visitas',
        'icon': Icons.calendar_today,
        'color': Colors.purple,
      },
      {
        'title': 'Financeiro',
        'icon': Icons.attach_money,
        'color': Colors.green,
      },
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Orçamento Online'),
        centerTitle: true,
      ),
      body: GridView.builder(
        padding: EdgeInsets.all(16.0),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 16.0,
          mainAxisSpacing: 16.0,
        ),
        itemCount: modules.length,
        itemBuilder: (context, index) {
          final module = modules[index];
          return Card(
            elevation: 4.0,
            child: InkWell(
              onTap: () {
                final route = MaterialPageRoute(
                  builder: (context) {
                    switch (module['title']) {
                      case 'Clientes':
                        return CustomersScreen();
                      case 'Produtos':
                        return ProductsScreen();
                      case 'Orçamentos':
                        return BudgetsScreen();
                      case 'Configurações':
                        return SettingsScreen();
                      case 'Visitas':
                        return VisitsScreen();
                      case 'Financeiro':
                        return FinancialScreen();
                      default:
                        return Scaffold(
                          appBar: AppBar(title: Text(module['title'])),
                          body: Center(child: Text('Em desenvolvimento')),
                        );
                    }
                  },
                );
                Navigator.push(context, route);
              },
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: EdgeInsets.all(16.0),
                    decoration: BoxDecoration(
                      color: module['color'].withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      module['icon'],
                      size: 40.0,
                      color: module['color'],
                    ),
                  ),
                  SizedBox(height: 8.0),
                  Text(
                    module['title'],
                    style: TextStyle(
                      fontSize: 16.0,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
