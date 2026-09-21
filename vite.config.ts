import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * El frontend se compila a `dist/client` y Cloudflare lo sirve como Static Assets
 * desde el mismo Worker que expone la API (ver wrangler.jsonc).
 *
 * En desarrollo, Vite (5173) hace proxy de `/api` hacia `wrangler dev` (8787)
 * para que las cookies de sesion sean same-origin desde el punto de vista del navegador.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // La division en chunks la decide Rolldown (Vite 8). Forzarla a mano
    // aqui empeoraba el resultado y no aporta nada en una app de este tamano.
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
})
