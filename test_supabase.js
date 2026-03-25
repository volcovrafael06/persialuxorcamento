import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  console.log('Testing connection to:', supabaseUrl)
  
  const tables = ['clientes', 'produtos', 'acessorios', 'orcamentos', 'configuracoes', 'rail_pricing']
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)

    if (error) {
      console.error(`Error with table "${table}":`, error.message)
    } else {
      console.log(`Table "${table}" found (Sample: ${JSON.stringify(data)})`)
    }
  }
}

testConnection()
