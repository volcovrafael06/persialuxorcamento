import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://msgjlpmertyofzlywysu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ2pscG1lcnR5b2Z6bHl3eXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTUyNDMsImV4cCI6MjA4MDk3MTI0M30.fWl1PVrzuLqoDj5eLfhUwBPjbUmNY7E9Dvrpu3U2MY0'

export const supabase = createClient(supabaseUrl, supabaseKey)
