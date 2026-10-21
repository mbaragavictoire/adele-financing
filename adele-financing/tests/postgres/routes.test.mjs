import test, { mock, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes,createHash } from 'node:crypto'
import express from 'express'
import { createPostgresAdapter } from '../../server/postgres/adapter.js'
process.env.DB_DRIVER='postgres'
process.env.NODE_ENV='test'
const token=randomBytes(32).toString('base64url')
const hash=createHash('sha256').update(token).digest('hex')
let role='finance_officer',failPayment=false,savedLoan=null,checkpoint=null
let loan={id:1,loan_id:'LON-00001',customer_id:2,status:'active',amount_paid:'0.20',outstanding_balance:'100.30',total_payable:'100.50'}
const writes=[],schedules=[],sequence=new Map()
const normalize=v=>v?.toPostgres ? v.toPostgres() : v
async function query(config) {
 if(typeof config==='string') {
  if(config==='BEGIN')checkpoint={loan:{...loan},writes:writes.length,schedules:schedules.length}
  if(config==='ROLLBACK'&&checkpoint){loan=checkpoint.loan;writes.length=checkpoint.writes;schedules.length=checkpoint.schedules}
  return {rows:[],rowCount:0}
 }
 const sql=config.text, v=config.values.map(normalize)
 const rows=value=>({rows:value,rowCount:value.length})
 if(sql.includes('FROM sessions'))return rows(v[0]===hash?[{id:hash,user_id:9,created_at:'2026-10-19 12:00:00',last_seen_at:'2030-01-01 00:00:00',absolute_expires_at:'2030-01-01 00:00:00',idle_expires_at:'2030-01-01 00:00:00',revoked_at:null}]:[])
 if(sql.includes('FROM users'))return rows([{id:9,full_name:'Synthetic Tester',email:'synthetic@example.invalid',role,status:'active'}])
 if(sql.includes('nextval')){const key=sql.match(/business_[a-z_]+/)[0];const next=(sequence.get(key)||0)+1;sequence.set(key,next);return rows([{next:String(next)}])}
 if(sql.includes('FROM loan_applications'))return rows([{id:3,application_id:'APP-00003',customer_id:2,loan_product_id:4,status:'approved',approved_amount:'100',requested_amount:'100',approved_duration:3,duration:3,interest_rate:'0'}])
 if(sql.includes('FROM loan_products'))return rows([{id:4,interest_rate:'0'}])
 if(sql.startsWith('SELECT id FROM loans WHERE application_id'))return rows([])
 if(sql.startsWith('SELECT * FROM loans WHERE id'))return rows([{...loan}])
 if(sql.includes('FROM loans l'))return rows(savedLoan?[savedLoan]:[])
 if(sql.startsWith('INSERT INTO payments')&&failPayment){const e=Error('Synthetic constraint error');e.code='23514';throw e}
 if(sql.startsWith('INSERT INTO')||sql.startsWith('UPDATE')) {
  writes.push({sql,values:v})
  if(sql.startsWith('UPDATE loans SET amount_paid'))loan={...loan,amount_paid:String(v[0]),outstanding_balance:String(v[1]),status:v[2]}
  if(sql.startsWith('INSERT INTO repayment_schedules'))schedules.push(v)
  if(sql.startsWith('INSERT INTO loans'))savedLoan={id:22,principal:String(v[4]),interest:String(v[5]),total_payable:String(v[6])}
  return {rows:[{id:22}],rowCount:1}
 }
 if(sql.includes('FROM settings'))return rows([{value:'0.10'}])
 if(sql.includes('FROM incomes'))return rows([{s:'0.20'}])
 if(sql.includes('FROM expenses'))return rows([{s:'0.10'}])
 if(sql.includes('FROM repayments'))return rows([{s:'0.10',total:'0.10',interest:'0.02'}])
 if(sql.includes('SUM')&&sql.includes('FROM loans'))return rows([{s:sql.includes('outstanding_balance')?'100.20':'50.00'}])
 throw Error('Unhandled synthetic query shape')
}
const client={query,release(){}}
const adapter=createPostgresAdapter({query,connect:async()=>client})
mock.module('../../server/db.js',{namedExports:{...adapter,initDb:async()=>{throw Error('Database startup forbidden in synthetic tests')}}})
const [{default:repayments},{default:loans},{default:finance}]=await Promise.all([
 import('../../server/routes/repayments.js'),import('../../server/routes/loans.js'),import('../../server/routes/finance.js')])
const app=express();app.use(express.json());app.use('/repayments',repayments);app.use('/loans',loans);app.use('/finance',finance)
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
const origin='http://127.0.0.1:'+server.address().port
async function request(path,body,{cookie=true,method=body?'POST':'GET'}={}) {
 const response=await fetch(origin+path,{method,headers:{...(cookie?{Cookie:'adele_session='+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
 return {status:response.status,body:await response.json()}
}
after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
test('real authentication and role middleware reject missing sessions and unauthorized financial roles',async()=>{
 assert.equal((await request('/repayments',undefined,{cookie:false})).status,401)
 role='loan_officer';assert.equal((await request('/repayments',{loan_id:1,amount:'0.10',payment_date:'2026-10-21'})).status,403)
 role='finance_officer'
})
test('unreviewed PostgreSQL financial writes fail before changing even synthetic financial rows',async()=>{
 delete process.env.ADELE_PG_FINANCIAL_POLICY
 const before=writes.length
 const response=await request('/repayments',{loan_id:1,amount:'0.10',payment_date:'2026-10-21'})
 assert.equal(response.status,503);assert.equal(writes.length,before)
 assert.equal(loan.amount_paid,'0.20')
})
test('repayment route uses exact decimal amounts, one transaction and unchanged relationship/audit IDs',async()=>{
 process.env.ADELE_PG_FINANCIAL_POLICY='reviewed-exact-v1'
 const response=await request('/repayments',{loan_id:1,amount:'0.10',payment_date:'2026-10-21'})
 assert.equal(response.status,201)
 assert.equal(response.body.loan.amount_paid,'0.3');assert.equal(response.body.loan.outstanding_balance,'100.2')
 assert.ok(writes.some(w=>w.sql.startsWith('INSERT INTO repayments')&&w.values[2]===2&&w.values[3]==='0.1'))
 assert.ok(writes.some(w=>w.sql.startsWith('INSERT INTO audit_logs')&&w.values[0]===9))
})
test('unsafe fractional JSON numbers are rejected and later payment failure rolls back the fake transaction',async()=>{
 const before={...loan},count=writes.length
 assert.equal((await request('/repayments',{loan_id:1,amount:0.1,payment_date:'2026-10-21'})).status,400)
 failPayment=true
 assert.equal((await request('/repayments',{loan_id:1,amount:'0.10',payment_date:'2026-10-21'})).status,400)
 failPayment=false
 assert.deepEqual(loan,before);assert.equal(writes.length,count)
})
test('disbursement distributes residual schedule cents exactly and preserves customer/application links',async()=>{
 const result=await request('/loans/disburse',{application_id:'APP-00003',disbursement_date:'2026-10-21'})
 assert.equal(result.status,201)
 assert.equal(result.body.loan.total_payable,'100')
 assert.deepEqual(schedules.map(r=>r[2]),['33.34','33.33','33.33'])
 const insert=writes.find(w=>w.sql.startsWith('INSERT INTO loans'))
 assert.deepEqual(insert.values.slice(1,4),[3,2,4])
})
test('finance summary returns decimal strings without binary float artifacts',async()=>{
 const response=await request('/finance/summary?q=4&year=2026')
 assert.equal(response.status,200)
 assert.equal(response.body.summary.total_income_quarter,'0.22')
 assert.equal(response.body.summary.net_profit_quarter,'0.12')
})

test('exact PostgreSQL settlement rejects overpayment instead of consuming a closing tolerance',async()=>{
 const before={...loan},count=writes.length
 const response=await request('/repayments',{loan_id:1,amount:'100.21',payment_date:'2026-10-21'})
 assert.equal(response.status,400)
 assert.deepEqual(loan,before);assert.equal(writes.length,count)
 const settled=await request('/repayments',{loan_id:1,amount:'100.20',payment_date:'2026-10-21'})
 assert.equal(settled.status,201)
 assert.equal(settled.body.loan.outstanding_balance,'0')
 assert.equal(settled.body.loan.amount_paid,'100.5')
 assert.equal(settled.body.loan.status,'completed')
})

test('PostgreSQL public document routes fail closed without reading original document paths',async()=>{
 const {default:publicApplications}=await import('../../server/routes/publicApplications.js')
 app.use('/apply',publicApplications)
 assert.equal((await request('/apply/documents/999/file')).status,503)
 assert.equal((await request('/apply',{amount:'100',first:'Synthetic'})).status,503)
})

test('product and financial settings cannot introduce NaN or rounded JSON monetary inputs',async()=>{
 const [{default:products},{default:settings}]=await Promise.all([import('../../server/routes/loanProducts.js'),import('../../server/routes/settings.js')])
 app.use('/products',products);app.use('/settings',settings)
 role='super_admin'
 const count=writes.length
 assert.equal((await request('/products',{name:'Synthetic product',min_amount:'NaN',max_amount:'100',interest_rate:'1'})).status,400)
 assert.equal((await request('/settings',{opening_cash:0.1},{method:'PUT'})).status,400)
 assert.equal(writes.length,count)
 role='finance_officer'
})
