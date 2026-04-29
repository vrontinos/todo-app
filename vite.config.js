import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const tauriHost = process.env.TAURI_DEV_HOST || '10.5.0.2'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'To Do Vrontinos',
        short_name: 'To Do',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          {
            src: '/icon-192v3.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512v3.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
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