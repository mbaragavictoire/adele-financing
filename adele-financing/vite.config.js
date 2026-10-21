import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { assertPreviewBuild } from './cloudflare/build-policy.js'
import { syntheticPreviewApi } from './cloudflare/vite-preview.js'

export default defineConfig(({ mode }) => {
  assertPreviewBuild(loadEnv(mode, process.cwd(), 'VITE_'))
  return { plugins: [react(), syntheticPreviewApi()] }
})
