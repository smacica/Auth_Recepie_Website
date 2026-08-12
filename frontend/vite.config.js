import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

//every path the express api owns, so `npm run dev` can talk to it on :4000.
///auth and /verify-email sit outside /api because google and the emailed links
//point at them directly, /data serves the uploaded photos.
const apiRoutes = ['/api', '/auth', '/verify-email', '/data']

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      apiRoutes.map(route => [route, { target: 'http://localhost:4000', changeOrigin: true }])
    )
  },
  build: {
    outDir: 'dist'
  }
})
