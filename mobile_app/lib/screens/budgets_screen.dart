import 'package:flutter/material.dart';

class BudgetsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Orçamentos'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () {
              // TODO: Implementar criação de novo orçamento
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.all(16.0),
            child: Card(
              child: Padding(
                padding: EdgeInsets.all(16.0),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        decoration: InputDecoration(
                          hintText: 'Pesquisar orçamentos...',
                          prefixIcon: Icon(Icons.search),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    PopupMenuButton(
                      icon: Icon(Icons.filter_list),
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          child: Text('Todos'),
                          value: 'all',
                        ),
                        PopupMenuItem(
                          child: Text('Em andamento'),
                          value: 'in_progress',
                        ),
                        PopupMenuItem(
                          child: Text('Aprovados'),
                          value: 'approved',
                        ),
                        PopupMenuItem(
                          child: Text('Finalizados'),
                          value: 'finished',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: 0, // TODO: Implementar lista de orçamentos
              itemBuilder: (context, index) {
                return Card(
                  margin: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.blue[100],
                      child: Icon(Icons.description, color: Colors.blue),
                    ),
                    title: Text('Orçamento #0000'),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Cliente: Nome do Cliente'),
                        Text('Data: 00/00/0000'),
                        Text('Status: Em andamento'),
                      ],
                    ),
                    trailing: IconButton(
                      icon: Icon(Icons.arrow_forward_ios),
                      onPressed: () {
                        // TODO: Implementar navegação para detalhes do orçamento
                      },
                    ),
                    isThreeLine: true,
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          // TODO: Implementar criação de novo orçamento
        },
        label: Text('Novo Orçamento'),
        icon: Icon(Icons.add),
      ),
    );
  }
}
