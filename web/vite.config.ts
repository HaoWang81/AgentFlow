import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [
    vue(),
    tailwindcss(),
    process.env.NODE_ENV === 'production' ? VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false
      },
      manifest: {
        name: 'Agent Flow',
        short_name: 'Agent Flow',
        description: 'Agent Flow Platform',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    }) : undefined,
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['sqlite3', 'better-sqlite3', 'officeparser', 'pdf-parse', 'xlsx', 'puppeteer', 'onnxruntime-node', '@xenova/transformers']
            }
          },
          define: {
            __dirname: 'import.meta.dirname',
            __filename: 'import.meta.filename'
          }
        }
      }
    ])
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      }
    }
  }
})
