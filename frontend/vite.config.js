import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'mirror-icon.svg'],
      manifest: {
        name:             'المرايا',
        short_name:       'المرايا',
        description:      'مساحتك للتأمل اليومي',
        theme_color:      '#0D1B2A',
        background_color: '#0D1B2A',
        display:          'standalone',
        orientation:      'portrait',
        start_url:        '/',
        dir:              'rtl',
        lang:             'ar',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            // Cache API responses للـ GET requests
            urlPattern: /\/api\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api':      { target: 'http://localhost:8000', changeOrigin: true },
      '/accounts': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
