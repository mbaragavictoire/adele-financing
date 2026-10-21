import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
import { rootCertificates } from 'node:tls'
import { X509Certificate,randomBytes } from 'node:crypto'
import { prepareRailwayEnvironment } from '../../scripts/start-railway.mjs'
import { financialPolicy } from '../../server/databaseDriver.js'
const ca=rootCertificates.find(pem=>{const c=new X509Certificate(pem);return c.ca && Date.parse(c.validFrom)<Date.now() && Date.parse(c.validTo)>Date.now()})
function config(){return {DB_DRIVER:'postgres',ADELE_DEPLOYMENT_MODE:'postgres-restricted',PGUSER:'adele_railway.synthetic',PGHOST:'synthetic.invalid',PGDATABASE:'postgres',PGPASSWORD:randomBytes(32).toString('base64url'),PG_CA_CERT:ca,PG_TIME_ZONE:'UTC',TZ:'UTC',PGPORT:'5432',PGSSLMODE:'verify-full',NODE_ENV:'production',SESSION_COOKIE_SECURE:'true',SESSION_COOKIE_SAMESITE:'strict',API_PROXY_SECRET:randomBytes(32).toString('base64url'),API_ALLOWED_ORIGIN:'https://test.example.invalid',CORS_ORIGINS:'https://test.example.invalid'}}
test('Railway creates a private CA file from runtime variable without connecting; cleanup removes only its files',()=>{
 const env=config(),old={...env},first=prepareRailwayEnvironment(env),second=prepareRailwayEnvironment(config())
 try{
  assert.equal(fs.readFileSync(first.file,'utf8'),ca);assert.equal(env.PGSSLROOTCERT,first.file);assert.equal(env.PG_CA_CERT,undefined)
  assert.notEqual(first.file,second.file);assert.equal(env.PGPASSWORD,old.PGPASSWORD)
  if(process.platform!=='win32')assert.equal(fs.statSync(first.file).mode&0o777,0o600)
 }finally{first.cleanup();second.cleanup()}
 assert.equal(fs.existsSync(first.file),false)
})
test('Railway refuses missing/invalid CA, credentials, MySQL fallback, privileged users, insecure TLS and financial opt-in',()=>{
 for(const change of [{PG_CA_CERT:''},{PG_CA_CERT:'not a certificate'},{PGPASSWORD:''},{DB_DRIVER:'mysql'},{PGUSER:'postgres.synthetic'},{PGPORT:'6543'},{DATABASE_URL:'refused'},{PGSSLMODE:'require'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{ADELE_PG_FINANCIAL_POLICY:'reviewed-exact-v1'},{SESSION_COOKIE_SECURE:'false'},{SESSION_COOKIE_SAMESITE:'none'},{ADELE_DEPLOYMENT_MODE:''},{CORS_ORIGINS:'*'},{TZ:'Africa/Kigali'}])assert.throws(()=>prepareRailwayEnvironment({...config(),...change}))
})
test('restricted deployment cannot enable financial policy even if its environment is later changed',()=>{
 assert.equal(financialPolicy({ADELE_DEPLOYMENT_MODE:'postgres-restricted',ADELE_PG_FINANCIAL_POLICY:'reviewed-exact-v1'}),false)
})

test('failed startup does not print credential values or certificate contents',()=>{
 const env={...process.env,...config(),PG_CA_CERT:'INVALID-CERTIFICATE-FIXTURE'}
 const result=spawnSync(process.execPath,['scripts/start-railway.mjs'],{env,encoding:'utf8'})
 assert.equal(result.status,1)
 const output=result.stdout+result.stderr
 assert.ok(output.includes('Restricted Railway startup refused'))
 for(const value of [env.PGPASSWORD,env.API_PROXY_SECRET,env.PG_CA_CERT])assert.ok(!output.includes(value))
})
