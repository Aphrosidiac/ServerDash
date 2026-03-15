import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backendPort = process.env.VITE_BACKEND_PORT || 9847

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    proxy: {
      '/api': `http://localhost:${backendPort}`,
      '/socket.io': { target: `http://localhost:${backendPort}`, ws: true },
    },
  },
})
