import 'package:flutter/material.dart';

class VisitsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Visitas'),
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: () {
              // TODO: Implementar agendamento de nova visita
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Card(
            margin: EdgeInsets.all(16.0),
            child: CalendarDatePicker(
              initialDate: DateTime.now(),
              firstDate: DateTime(2024),
              lastDate: DateTime(2025),
              onDateChanged: (date) {
                // TODO: Implementar filtro por data
              },
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: 0, // TODO: Implementar lista de visitas
              itemBuilder: (context, index) {
                return Card(
                  margin: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.purple[100],
                      child: Icon(Icons.calendar_today, color: Colors.purple),
                    ),
                    title: Text('Visita - Nome do Cliente'),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Data: 00/00/0000'),
                        Text('Horário: 00:00'),
                        Text('Endereço: Rua Exemplo, 123'),
                      ],
                    ),
                    trailing: PopupMenuButton(
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          value: 'edit',
                          child: ListTile(
                            leading: Icon(Icons.edit),
                            title: Text('Editar'),
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                        PopupMenuItem(
                          value: 'complete',
                          child: ListTile(
                            leading: Icon(Icons.check_circle),
                            title: Text('Concluir'),
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                        PopupMenuItem(
                          value: 'cancel',
                          child: ListTile(
                            leading: Icon(Icons.cancel),
                            title: Text('Cancelar'),
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ],
                      onSelected: (value) {
                        // TODO: Implementar ações do menu
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
          // TODO: Implementar agendamento de nova visita
        },
        label: Text('Nova Visita'),
        icon: Icon(Icons.add),
      ),
    );
  }
}
