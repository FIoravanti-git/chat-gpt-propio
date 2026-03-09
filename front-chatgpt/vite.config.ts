import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { listDocumentsPlugin } from './vite-plugin-list-documents'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), listDocumentsPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['ia.puntoguarani.com.py'],
    proxy: {
      '/api/whatsapp': {
        target: 'http://31.220.102.254:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/whatsapp/, '')
      },
      '/api/quivr': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/quivr/, '')
      },
      '/api/auth': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, '/api/auth')
      }
    }
  }
})
