import { queryOne } from './db.js'
import { isPostgres, assertFinancialPolicy } from './databaseDriver.js'
const refs = {
  customers:['customer_id','CUS'],loan_applications:['application_id','APP'],loans:['loan_id','LON'],
  repayments:['repayment_id','RPT'],payments:['payment_id','PAY'],incomes:['income_id','INC'],expenses:['expense_id','EXP'],
}
export async function nextBusinessId(executor,table) {
  const pair=refs[table]
  if(!pair)throw new Error('Unreviewed business reference table')
  const [column,prefix]=pair
  const db=executor || {queryOne}
  if(isPostgres()) {
    assertFinancialPolicy()
    const result=await db.queryOne(`SELECT nextval('adele_private.business_${table}')::text AS next`)
    const n=String(result.next)
    if(!/^\d+$/.test(n) || n.length>16)throw new Error('Business reference exceeds VARCHAR(20) capacity')
    return `${prefix}-${n.padStart(5,'0')}`
  }
  const result=await db.queryOne(`SELECT COALESCE(MAX(CAST(SUBSTRING(${column}, 5) AS UNSIGNED)), 0) AS n FROM ${table}`)
  return `${prefix}-${String(Number(result.n)+1).padStart(5,'0')}`
}
