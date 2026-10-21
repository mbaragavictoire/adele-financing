import { onRequest as api } from '../cloudflare/api-proxy.js'

function refuse(status) {
  return new Response(JSON.stringify({ error: 'Preview path refused.' }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}

// All URLs invoke this middleware: malformed API prefixes must not become SPA HTML.
export function onRequest(context) {
  const path = new URL(context.request.url).pathname
  // Canonical application routes use plain ASCII first segments. Reject encoded
  // prefixes rather than introducing a second URL-decoding interpretation.
  if (/^\/+[^/]*%/.test(path)) return refuse(400)
  if (/^\/+api/i.test(path)) return api(context)
  if (/^\/+\.(?:env|git)(?:[/.]|$)/i.test(path) ||
      /^\/+(?:server|uploads|backups)(?:\/|$)/i.test(path)) return refuse(403)
  return context.next()
}
