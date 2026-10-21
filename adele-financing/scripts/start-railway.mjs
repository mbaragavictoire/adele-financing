import '../server/env.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { X509Certificate } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createRestrictedPostgresProxyIngress } from '../server/proxyIngress.js'

export function prepareRailwayEnvironment(env = process.env) {
  createRestrictedPostgresProxyIngress(env)
  if (!env.PGHOST || !env.PGDATABASE || !env.PGPASSWORD || env.DATABASE_URL ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || (env.PGSSLMODE && env.PGSSLMODE !== 'verify-full') ||
      String(env.PGPORT || '5432') !== '5432' || env.TZ !== 'UTC' || env.PG_TIME_ZONE !== 'UTC') {
    throw new Error('Invalid restricted PostgreSQL startup configuration')
  }
  const pem = String(env.PG_CA_CERT || '').replaceAll('\r\n', '\n')
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || []
  if (!certificates.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim()) throw new Error('Invalid CA bundle')
  for (const block of certificates) {
    const ca = new X509Certificate(block)
    if (!ca.ca || Date.parse(ca.validFrom) > Date.now() || Date.parse(ca.validTo) <= Date.now()) throw new Error('Invalid CA certificate')
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'adele-tls-'))
  const file = path.join(directory,'supabase-ca.pem')
  const cleanup = () => {
    try { fs.unlinkSync(file) } catch { /* own temporary file only */ }
    try { fs.rmdirSync(directory) } catch { /* no recursive deletion */ }
  }
  try {
    fs.chmodSync(directory,0o700)
    fs.writeFileSync(file,pem,{mode:0o600,flag:'wx'})
    env.PGSSLROOTCERT = file
    delete env.PG_CA_CERT
    return { file, cleanup }
  } catch { cleanup(); throw new Error('Could not provision TLS CA file') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { cleanup } = prepareRailwayEnvironment()
    process.once('exit',cleanup)
    await import('../server/index.js')
  } catch {
    console.error('Restricted Railway startup refused; check configuration and CA certificate.')
    process.exitCode = 1
  }
}
