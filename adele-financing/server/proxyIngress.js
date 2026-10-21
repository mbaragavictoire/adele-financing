import { blockedFinancialWrite } from '../cloudflare/financial-boundary.js'
import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

// Only opt-in synthetic sandboxes may install this middleware. No DB imports or queries.
function createProxyIngress(env, restricted) {
  const secret = env.API_PROXY_SECRET || ''
  let frontend
  try { frontend = new URL(env.API_ALLOWED_ORIGIN) } catch { throw new Error('Invalid sandbox origin configuration.') }
  if ((restricted
        ? env.ADELE_DEPLOYMENT_MODE !== 'postgres-restricted' || env.DB_DRIVER !== 'postgres' ||
          !/^adele_railway(?:\.[A-Za-z0-9_-]+)?$/.test(env.PGUSER || '') ||
          Boolean(env.ADELE_PG_FINANCIAL_POLICY) || env.ADELE_PROXY_SANDBOX_ONLY === 'true' ||
          env.NODE_ENV !== 'production' || env.SESSION_COOKIE_SECURE !== 'true' ||
          env.SESSION_COOKIE_SAMESITE !== 'strict' || env.CORS_ORIGINS !== env.API_ALLOWED_ORIGIN
        : env.ADELE_PROXY_SANDBOX_ONLY !== 'true' || !/^adele_synthetic_[a-z0-9_]+$/.test(env.DB_NAME || '')) ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(secret) ||
      frontend.protocol !== 'https:' || frontend.origin !== env.API_ALLOWED_ORIGIN) {
    throw new Error('Restricted proxy configuration is invalid.')
  }
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    if (restricted && req.path === '/health' && ['GET','HEAD'].includes(req.method)) {
      res.setHeader('X-Adele-Data-Class','restricted-postgres')
      return next()
    }
    const supplied = Buffer.from(String(req.headers['x-adele-proxy-secret'] || ''))
    const expected = Buffer.from(secret)
    const ip = String(req.headers['x-adele-client-ip'] || '')
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) ||
        req.headers['x-adele-proxy-stage'] !== (restricted ? 'postgres-restricted' : 'synthetic-sandbox') ||
        req.headers.origin !== frontend.origin || !isIP(ip)) {
      return res.status(403).json({ error: 'Authenticated proxy required.' })
    }
    delete req.headers['x-adele-proxy-secret']
    req.adeleProxy = Object.freeze({ clientIp: ip, frontendOrigin: frontend.origin })
    // Caller-supplied forwarding chains never become an authoritative client identity.
    req.headers['x-forwarded-for'] = ip
    req.headers['x-forwarded-host'] = frontend.host
    req.headers['x-forwarded-proto'] = 'https'
    res.setHeader('X-Adele-Data-Class', restricted ? 'restricted-postgres' : 'synthetic-only')
    if (req.path === '/preview/identity') {
      const nonce = String(req.headers['x-adele-preview-nonce'] || '')
      if (req.method !== 'GET' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
        return res.status(400).json({ error: 'Invalid preview probe.' })
      }
      return res.json({ kind: restricted ? 'adele-postgres-restricted' : 'adele-synthetic-sandbox', nonce })
    }
    if (restricted && blockedFinancialWrite(req.method,'/api' + req.path)) return res.status(503).json({ error: 'Financial writes are disabled.' })
    next()
  }
}

export const createSandboxProxyIngress = env => createProxyIngress(env, false)
export const createRestrictedPostgresProxyIngress = env => createProxyIngress(env, true)
