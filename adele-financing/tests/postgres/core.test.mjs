import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { compile } from '../../server/postgres/sql.js'
import { createPostgresAdapter, postgresConfig } from '../../server/postgres/adapter.js'
import { databaseDriver } from '../../server/databaseDriver.js'
import { money, binary, math, installments, Exact, parsedMoney } from '../../server/money.js'
process.env.DB_DRIVER='postgres'

test('driver opt-in and mysql source preserved apart from Git line endings',()=>{
 assert.equal(databaseDriver({}),'mysql')
 assert.equal(databaseDriver({DB_DRIVER:'mariadb'}),'mysql')
 assert.throws(()=>databaseDriver({DB_DRIVER:'unknown'}))
 // Reviewed original source at a104c041e15c2a43691429a6e657c70e59e0fc88; works after commits and without Git history.
 const originalHash='5b70fe058e0db30079451c1ae4e7e5ceb0bab3e60232e7a5735fd836d0dbaa77'
 const hash = value => createHash('sha256').update(value.toString().replaceAll('\r\n','\n')).digest('hex')
 assert.equal(hash(fs.readFileSync('server/db.mysql.js')),originalHash)
})
test('placeholder lexer preserves SQL literals/identifiers/comments and refuses missing arguments',()=>{
 const p=compile("SELECT '?' AS literal, `key` FROM settings WHERE value=@v OR value=@v /* @unused ? */",{v:"x'; DROP TABLE users; --"})
 assert.equal(p.values.length,2)
 assert.match(p.text,/SELECT '\?' AS literal , "key"/)
 assert.match(p.text,/value = \$1 OR value = \$2/)
 assert.throws(()=>compile('SELECT ?',[1,2]))
 assert.throws(()=>compile('SELECT @missing',{}))
 assert.throws(()=>compile('SELECT ?',[0.1]))
 assert.throws(()=>compile('SELECT 1; DELETE FROM users'))
 assert.throws(()=>compile('DROP TABLE users'))
})
test('MySQL settings upserts/month buckets/boolean predicates compile without touching literal text',()=>{
 assert.match(compile('SELECT DATE_FORMAT(payment_date, \'%Y-%m\') AS month FROM payments').text,/to_char \( payment_date , 'YYYY-MM' \)/)
 assert.match(compile('SELECT * FROM login_attempts WHERE successful = 0').text,/successful = false/)
 assert.match(compile('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',['opening_cash','0'],{returning:true}).text,/ON CONFLICT \("key"\) DO UPDATE SET value = EXCLUDED.value RETURNING id/)
 assert.match(compile('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE `key` = `key`',['k','v']).text,/DO NOTHING/)
 assert.match(compile('SELECT * FROM loan_applications WHERE id = ? OR application_id = ?',['APP-00001','APP-00001']).text,/id::text = \$1 OR application_id = \$2/)
})
test('decimal operations preserve high precision, prohibit unsafe JSON amounts and implicit coercion',()=>{
 assert.equal(binary('+',money('0.1'),money('0.2')).toString(),'0.3')
 assert.equal(binary('-',money('9007199254740993.01'),money('9007199254740993')).toString(),'0.01')
 assert.equal(binary('*',money('12345678901234567890.12'),money('0.01')).toString(),'123456789012345678.9012')
 assert.equal(JSON.stringify({amount:money('0.10')}),'{"amount":"0.1"}')
 assert.throws(()=>Number(money('1.01')),/Implicit/)
 assert.throws(()=>money(0.1),/decimal strings/)
 for(const v of ['Infinity','NaN','1e500','0x10','12abc',null,Infinity]) assert.throws(()=>money(v))
 assert.throws(()=>binary('/',money('1'),money('3')),/Non-terminating/)
 assert.throws(()=>binary('/',money('1'),money('7')),/Non-terminating/)
 assert.equal(binary('/',money('1'),money('8')).toString(),'0.125')
})
test('financial policy is required and installment allocation sums exactly without altering history',()=>{
 delete process.env.ADELE_PG_FINANCIAL_POLICY
 assert.throws(()=>installments(money('100'),3),/policy/)
 process.env.ADELE_PG_FINANCIAL_POLICY='reviewed-exact-v1'
 const schedule=installments(money('100'),3)
 assert.deepEqual(schedule.map(String),['33.34','33.33','33.33'])
 assert.equal(schedule.reduce((a,b)=>binary('+',a,b),money('0')).toString(),'100')
 assert.equal(math('round',money('2.5')).toString(),'3')
 assert.equal(math('round',money('-2.5')).toString(),'-2')
 delete process.env.ADELE_PG_FINANCIAL_POLICY
})
test('MariaDB numeric helpers retain native behavior and API types',()=>{
 process.env.DB_DRIVER='mysql'
 try {
  assert.equal(money('0.1'),0.1)
  assert.equal(parsedMoney('12abc'),12)
  assert.equal(binary('+',money('0.1'),money('0.2')),0.1+0.2)
  assert.equal(binary('===','1',1),false)
  assert.deepEqual(installments(100,3),[33.33,33.33,33.33])
 }finally{process.env.DB_DRIVER='postgres'}
})
test('adapter keeps transaction operations on one client and rolls back failures/releases clients',async()=>{
 const calls=[];const client={query:async q=>{calls.push(q);return {rows:[{id:'42',amount:'1.20'}],rowCount:1}},release(){calls.push('RELEASE')}}
 const adapter=createPostgresAdapter({connect:async()=>client,query:async()=>assert.fail('transaction cannot use pool.query')})
 const result=await adapter.withTransaction(async tx=>tx.run('INSERT INTO audit_logs (action) VALUES (?)',['SYNTHETIC']))
 assert.equal(result.lastInsertRowid,'42');assert.equal(result.changes,1)
 assert.equal(calls[0],'BEGIN');assert.equal(calls.at(-2),'COMMIT');assert.equal(calls.at(-1),'RELEASE')
 calls.length=0
 await assert.rejects(adapter.withTransaction(async()=>{throw Error('Synthetic failure')}),/Synthetic failure/)
 assert.deepEqual(calls,['BEGIN','ROLLBACK','RELEASE'])
})
test('adapter rejects financial writes and unsafe parameters before invoking the fake executor',async()=>{
 delete process.env.ADELE_PG_FINANCIAL_POLICY
 const adapter=createPostgresAdapter({query(){assert.fail('no query should execute')}})
 await assert.rejects(adapter.run('INSERT INTO loans (principal) VALUES (?)',['1.00']),/policy/)
 await assert.rejects(adapter.run('INSERT INTO audit_logs (user_id) VALUES (?)',[1.1]),/exact decimal/)
})
test('adapter preserves date/numeric strings and sanitizes uniqueness errors',async()=>{
 const adapter=createPostgresAdapter({query:async()=>({rows:[{amount:'9007199254740993.01',created_at:'2026-10-19 15:00:00'}],rowCount:1})})
 assert.deepEqual(await adapter.queryOne('SELECT amount,created_at FROM loans'),{amount:'9007199254740993.01',created_at:'2026-10-19 15:00:00'})
 const bad=createPostgresAdapter({query:async()=>{const e=Error('private row contents');e.code='23505';throw e}})
 await assert.rejects(bad.run('INSERT INTO audit_logs (action) VALUES (?)',['SYNTHETIC']),e=>e.code==='ER_DUP_ENTRY'&&!e.message.includes('private'))
})
test('PostgreSQL configuration refuses fallback/insecure TLS/timezone guesses before connecting',()=>{
 assert.throws(()=>postgresConfig({}),/explicit/)
 assert.throws(()=>postgresConfig({PGHOST:'synthetic.invalid',PGDATABASE:'synthetic',PGUSER:'synthetic',PGSSLROOTCERT:'not-read',NODE_TLS_REJECT_UNAUTHORIZED:'0'}),/insecure/)
 assert.throws(()=>postgresConfig({PGHOST:'synthetic.invalid',PGDATABASE:'synthetic',PGUSER:'synthetic',PGSSLROOTCERT:'not-read',TZ:'UTC',PG_TIME_ZONE:'Africa/Johannesburg'}),/matching/)
 assert.throws(()=>postgresConfig({PGHOST:'synthetic.invalid',PGDATABASE:'synthetic',PGUSER:'synthetic',PGSSLROOTCERT:'not-read',TZ:'UTC',PG_TIME_ZONE:'UTC',PGPORT:'6543'}),/transaction/)
 assert.ok(money('1') instanceof Exact)
})

test('type parsers preserve historical wall-clock strings and numeric text exactly',async()=>{
 const {postgresTypes}=await import('../../server/postgres/adapter.js')
 const parsers=postgresTypes({getTypeParser(){return value=>Number(value)}})
 assert.equal(parsers.getTypeParser(1114)('2026-10-19 15:57:27'),'2026-10-19 15:57:27')
 assert.equal(parsers.getTypeParser(1082)('2026-10-19'),'2026-10-19')
 assert.equal(parsers.getTypeParser(1700)('9007199254740993.0001'),'9007199254740993.0001')
 assert.equal(parsers.getTypeParser(23)('42'),42)
})

test('date-only loan terms preserve the calendar day independently of process timezone',async()=>{
 const {loanDueDate}=await import('../../server/dates.js')
 const previous=process.env.TZ
 process.env.TZ='Africa/Johannesburg'
 try {
  assert.equal(loanDueDate('2026-10-21',3),'2027-01-21')
  assert.throws(()=>loanDueDate('2026-02-30',1),/calendar/)
  process.env.DB_DRIVER='mysql'
  const old=new Date('2026-10-21T00:00:00');old.setMonth(old.getMonth()+3)
  assert.equal(loanDueDate('2026-10-21',3),old.toISOString().slice(0,10))
 }finally{process.env.DB_DRIVER='postgres';if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})
test('unreviewed nondeterministic search is refused before a PostgreSQL query',async()=>{
 const adapter=createPostgresAdapter({query(){assert.fail('unreviewed search cannot execute')}})
 await assert.rejects(adapter.queryAll('SELECT * FROM customers WHERE full_name LIKE ?',['%Synthetic%']),/collation/)
})

test('savepoints let existing uniqueness retry loops continue without an aborted PostgreSQL transaction',async()=>{
 process.env.ADELE_PG_FINANCIAL_POLICY='reviewed-exact-v1'
 const calls=[];let attempts=0
 const client={release(){},async query(q){
  calls.push(typeof q==='string'?q:q.text)
  if(typeof q!=='string'&&++attempts===1){const e=Error('synthetic duplicate');e.code='23505';throw e}
  return {rows:[],rowCount:1}
 }}
 const adapter=createPostgresAdapter({connect:async()=>client})
 await adapter.withTransaction(async tx=>{
  try{await tx.run('INSERT INTO audit_logs (action) VALUES (?)',['FIRST'])}catch(e){assert.equal(e.code,'ER_DUP_ENTRY')}
  await tx.run('INSERT INTO audit_logs (action) VALUES (?)',['SECOND'])
 })
 assert.ok(calls.includes('ROLLBACK TO SAVEPOINT adele_write_1'))
 assert.equal(calls.at(-1),'COMMIT')
 delete process.env.ADELE_PG_FINANCIAL_POLICY
})
