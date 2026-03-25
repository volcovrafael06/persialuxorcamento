
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding data...');

  // 1. Seed Clientes
  const { error: clientError } = await supabase.from('clientes').upsert([
    { name: 'Cliente Teste', email: 'teste@exemplo.com', phone: '11999999999', address: 'Rua Teste, 123' }
  ]);
  if (clientError) console.error('Error seeding clientes:', clientError.message);
  else console.log('✅ Cliente seeded');

  // 2. Seed Produtos
  const { error: prodError } = await supabase.from('produtos').upsert([
    { nome: 'Persiana Rolo', preco_venda: 150.00, modelo: 'Rolo', tecido: 'Blackout', produto: 'Persiana' },
    { nome: 'Persiana Romana', preco_venda: 200.00, modelo: 'Romana', tecido: 'Tecido', produto: 'Persiana' }
  ]);
  if (prodError) console.error('Error seeding produtos:', prodError.message);
  else console.log('✅ Produtos seeded');

  // 3. Seed Acessorios
  const { error: accError } = await supabase.from('acessorios').upsert([
    { nome: 'Controle Remoto', tipo: 'Motorização', modelo: 'Universal' },
    { nome: 'Bando de Alumínio', tipo: 'Acabamento', modelo: 'Standard' }
  ]);
  if (accError) console.error('Error seeding acessorios:', accError.message);
  else console.log('✅ Acessorios seeded');

  process.exit(0);
}

seed();
