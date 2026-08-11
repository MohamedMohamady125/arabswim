import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep flag-icons SVGs as on-demand files instead of inlining ~500
    // data URIs into the stylesheet (kept the CSS ~10x smaller).
    assetsInlineLimit: 0,
  },
  preview: {
    proxy: {
      '/api': {
        target: 'https://arabswim-backend-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
})
