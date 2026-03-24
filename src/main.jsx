import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom';
import './components/animations.css'
import { supabase } from './supabase/client'

window.supabase = supabase

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

async function executeSql() {
  try {
    const { error } = await supabase.from('accessories').select('*').limit(1);
    if (error) {
      console.error("Error checking 'accessories' table:", error);
      if (error.message.includes('relation "accessories" does not exist')) {
        console.log("Table 'accessories' does not exist, creating it...");
        const { error: createTableError } = await supabase.schema.raw(`
          CREATE TABLE accessories (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            product_type VARCHAR(255) NOT NULL,
            measurement_mm NUMERIC,
            unit VARCHAR(255),
            colors JSONB
          );
        `);

        if (createTableError) {
          console.error("Error creating 'accessories' table:", createTableError);
        } else {
          console.log("Table 'accessories' created successfully.");
        }
      }
    } else {
      console.log("Table 'accessories' exists.");
    }
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

executeSql();
