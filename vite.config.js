import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const tauriHost = process.env.TAURI_DEV_HOST || '10.5.0.2'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: tauriHost,
      port: 5173,
      clientPort: 5173,
    },
  },
})