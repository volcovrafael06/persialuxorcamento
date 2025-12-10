import 'package:flutter/material.dart';

class CustomersScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Clientes'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () {
              // TODO: Implementar adição de novo cliente
            },
          ),
        ],
      ),
      body: ListView.builder(
        itemCount: 0, // TODO: Implementar lista de clientes
        itemBuilder: (context, index) {
          return ListTile(
            leading: CircleAvatar(
              child: Icon(Icons.person),
            ),
            title: Text('Nome do Cliente'),
            subtitle: Text('Telefone: (00) 00000-0000'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: Icon(Icons.edit),
                  onPressed: () {
                    // TODO: Implementar edição de cliente
                  },
                ),
                IconButton(
                  icon: Icon(Icons.delete),
                  onPressed: () {
                    // TODO: Implementar exclusão de cliente
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
