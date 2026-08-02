import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    proxy: {
      '/api': {
        target: 'https://arabswim-backend-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
})
