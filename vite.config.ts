import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`α${packageJson.version}`),
  },
  base: '/tama/',
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  plugins: [
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'ただ穴に玉を入れるだけのゲーム',
        short_name: 'Hole In One',
        description: 'スマホの傾きだけで遊ぶ激ムズアクションゲーム',
        theme_color: '#1a1e24',
        background_color: '#1a1e24',
        display: 'fullscreen',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
