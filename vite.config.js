import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { bulkActionSafetyPatch } from './scripts/bulk-action-safety-patch.js'
import { atomicBulkDeletePatch } from './scripts/atomic-bulk-delete-patch.js'
import { authStorageSafetyPatch } from './scripts/auth-storage-safety-patch.js'
import { realtimeVisibilityRecoveryPatch } from './scripts/realtime-visibility-recovery-patch.js'
import { realtimeLeaseHandoffPatch } from './scripts/realtime-lease-handoff-patch.js'
import { atomicTaskReorderPatch } from './scripts/atomic-task-reorder-patch.js'
import { atomicListReorderPatch } from './scripts/atomic-list-reorder-patch.js'
import { listReorderOwnerGuardPatch } from './scripts/list-reorder-owner-guard-patch.js'

const tauriHost = process.env.TAURI_DEV_HOST || '10.5.0.2'
const isTauriBuild = process.env.TAURI === 'true'

export default defineConfig({
  plugins: [
    listReorderOwnerGuardPatch(),
    atomicListReorderPatch(),
    atomicTaskReorderPatch(),
    realtimeLeaseHandoffPatch(),
    realtimeVisibilityRecoveryPatch(),
    atomicBulkDeletePatch(),
    bulkActionSafetyPatch(),
    authStorageSafetyPatch(),
    react(),
    !isTauriBuild &&
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
  ].filter(Boolean),
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
