import { createClient } from '@supabase/supabase-js'

// Publishable keys are intentionally safe for browser bundles. Environment
// variables override these defaults in production and local development.
const DEFAULT_SUPABASE_URL = 'https://ozxpdccutroxtjqcpjea.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_78VLP54uyTLDDXsCan3N9w_G0_SqIzy'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_KEY
  || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
