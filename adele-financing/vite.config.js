import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The string shorthand ('/api': 'http://localhost:4000') makes Vite set
      // changeOrigin: true, which rewrites Host to localhost:4000 while the
      // browser still sends Origin: http://localhost:5173. The API's CSRF
      // backstop compares those two headers, so every login looked cross-site
      // and was refused with a 403. Forward the browser's own Host instead, so
      // the check compares against the origin the page was actually loaded
      // from. Nothing in the API uses Host for anything else.
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
})
