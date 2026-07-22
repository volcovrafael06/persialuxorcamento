# Persialux Orçamentos

Aplicação React/Vite de clientes, produtos, visitas e orçamentos, com Supabase no backend e deploy pelo Cloudflare Pages.

## Desenvolvimento local

Requisitos: Node.js 20 ou superior.

```bash
cp .env.example .env.local
npm install
npm test
npm run dev
```

Preencha `.env.local` somente com a URL e a chave publicável do Supabase. Nunca exponha a chave `service_role` em variáveis `VITE_*`.

## PDF do cliente

O PDF baixado em **Visualizar orçamento** omite largura, altura, área e medida de cada folha. As medidas continuam salvas no orçamento e aparecem normalmente na visualização interna e na edição.

Os testes dessa regra ficam em `tests/budgetPresentation.test.js`.

## Ativação segura do Supabase Auth e da RLS

A migração `supabase/migrations/20260722201630_secure_auth_rls_and_data_integrity.sql`:

- troca os usuários e senhas embutidos no frontend pelo Supabase Auth;
- bloqueia acesso anônimo às tabelas de negócio;
- consolida as políticas RLS permissivas;
- deixa o bucket `images` privado e usa URLs assinadas;
- normaliza os status de orçamentos e visitas;
- gera o número do orçamento de forma transacional no Postgres;
- corrige chaves estrangeiras, índices e o cadastro de vendedores das visitas.

Antes de aplicá-la em produção:

1. Em **Supabase > Authentication > Users**, crie exatamente um usuário com e-mail e senha. Esse primeiro usuário será promovido pela migração a administrador ativo.
2. Aplique a migração pelo Supabase CLI (`supabase db push`) ou pelo conector Supabase.
3. Confirme que esse administrador consegue entrar e consultar os dados.
4. Cadastros posteriores nascem inativos. A ativação deve ser feita por um administrador do banco, atualizando `public.profiles.active` e, quando necessário, `public.profiles.role`.

Não publique a versão com Supabase Auth antes de concluir as etapas 1 e 2, pois as credenciais antigas foram removidas por segurança.

## Cloudflare Pages

Configure o projeto conectado ao GitHub com:

- comando de build: `npm run build`;
- diretório de saída: `dist`;
- Node.js: 20 ou superior;
- variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou a variável legada `VITE_SUPABASE_KEY`).

O projeto já contém `_redirects` e `_routes.json` para o roteamento da SPA.
