import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3333,
    allowedHosts: true,
    headers: {
      'Content-Security-Policy': "frame-ancestors *",
    },
    hmr: {
      protocol: 'wss',
      host: 'preview--agent-launcher-awesome-link.app.architect.new',
      clientPort: 443,
    },
  },
  build: {
    outDir: 'dist',
  },
})
