import { createApiProxy } from './api-proxy.js'

// Vite does not execute Pages Functions. Never proxy its preview to localhost:4000.
const handle = createApiProxy({
  fetchImpl() { throw new Error('Network access is disabled in the Vite preview.') },
})

function install(server) {
  server.middlewares.use(async (incoming, outgoing, next) => {
    const base = 'http://' + (incoming.headers.host || 'localhost')
    const url = new URL(incoming.url, base)
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return next()
    incoming.resume()
    try {
      const request = new Request(url, { method: incoming.method, headers: incoming.headers })
      const response = await handle({ request, env: { API_MODE: 'synthetic' } })
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.end(await response.text())
    } catch {
      outgoing.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      outgoing.end('{"error":"Synthetic preview API unavailable."}')
    }
  })
}

export function syntheticPreviewApi() {
  return {
    name: 'adele-synthetic-preview-api',
    configureServer: install,
    configurePreviewServer: install,
  }
}
