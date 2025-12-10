import 'package:flutter/material.dart';

class SettingsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Configurações'),
      ),
      body: ListView(
        children: [
          _buildSection(
            'Personalização',
            [
              ListTile(
                leading: Icon(Icons.color_lens),
                title: Text('Tema do Aplicativo'),
                subtitle: Text('Claro'),
                trailing: Switch(
                  value: false,
                  onChanged: (value) {
                    // TODO: Implementar mudança de tema
                  },
                ),
              ),
              ListTile(
                leading: Icon(Icons.image),
                title: Text('Logo da Empresa'),
                subtitle: Text('Toque para alterar'),
                onTap: () {
                  // TODO: Implementar upload de logo
                },
              ),
            ],
          ),
          _buildSection(
            'Dados da Empresa',
            [
              ListTile(
                leading: Icon(Icons.business),
                title: Text('Nome da Empresa'),
                subtitle: Text('Configurar nome'),
                onTap: () {
                  // TODO: Implementar edição do nome da empresa
                },
              ),
              ListTile(
                leading: Icon(Icons.phone),
                title: Text('Telefone'),
                subtitle: Text('Configurar telefone'),
                onTap: () {
                  // TODO: Implementar edição do telefone
                },
              ),
              ListTile(
                leading: Icon(Icons.email),
                title: Text('E-mail'),
                subtitle: Text('Configurar e-mail'),
                onTap: () {
                  // TODO: Implementar edição do e-mail
                },
              ),
              ListTile(
                leading: Icon(Icons.location_on),
                title: Text('Endereço'),
                subtitle: Text('Configurar endereço'),
                onTap: () {
                  // TODO: Implementar edição do endereço
                },
              ),
            ],
          ),
          _buildSection(
            'Configurações do Sistema',
            [
              ListTile(
                leading: Icon(Icons.notifications),
                title: Text('Notificações'),
                subtitle: Text('Configurar notificações'),
                trailing: Switch(
                  value: true,
                  onChanged: (value) {
                    // TODO: Implementar configuração de notificações
                  },
                ),
              ),
              ListTile(
                leading: Icon(Icons.backup),
                title: Text('Backup Automático'),
                subtitle: Text('Realizar backup diariamente'),
                trailing: Switch(
                  value: true,
                  onChanged: (value) {
                    // TODO: Implementar configuração de backup
                  },
                ),
              ),
            ],
          ),
          _buildSection(
            'Sobre',
            [
              ListTile(
                leading: Icon(Icons.info),
                title: Text('Versão do Aplicativo'),
                subtitle: Text('1.0.0'),
              ),
              ListTile(
                leading: Icon(Icons.update),
                title: Text('Verificar Atualizações'),
                onTap: () {
                  // TODO: Implementar verificação de atualizações
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Text(
            title,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.blue,
            ),
          ),
        ),
        ...children,
        Divider(height: 32.0),
      ],
    );
  }
}
