import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    // Ensure the build produces minimal console output in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // Fix for Cloudflare Pages SPA
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['chart.js', 'react-chartjs-2'],
          pdf: ['jspdf', 'jspdf-autotable', 'html2canvas']
        }
      }
    }
  },
  server: {
    sourcemap: true,
    allowedHosts: true  // aceita qualquer Host (dev local)
  },
  preview: {
    // Aceita requests via domínio (TLS no nginx) e via IP (dev/teste).
    // Sem isso, vite preview retorna 403 quando o Host não bate.
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '167.126.31.192',
      'saas-ads-rafa.comercial.ws',
      '.comercial.ws'  // qualquer subdomínio (futuro)
    ]
  }
})
