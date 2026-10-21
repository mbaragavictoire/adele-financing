import Decimal from 'decimal.js'
import { isPostgres, assertFinancialPolicy } from './databaseDriver.js'
const D = Decimal.clone({ precision: 512, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -1000, toExpPos: 1000 })
function invalid(message) { const e = new Error(message); e.statusCode = 400; return e }
function decimal(value) {
  if (value instanceof Exact) return value.decimal
  const d = new D(value)
  if (!d.isFinite() || d.sd() > 100 || Math.abs(d.e) > 100) throw invalid('Amount exceeds the reviewed decimal domain.')
  return d
}
export class Exact {
  constructor(value) { this.decimal = decimal(value) }
  toString() { return this.decimal.toFixed() }
  toJSON() { return this.toString() }
  toPostgres() { return this.toString() }
  valueOf() { throw new Error('Implicit financial Number coercion is forbidden.') }
}
export function money(value) {
  if (!isPostgres()) return Number(value)
  if (value instanceof Exact) return value
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw invalid('Send fractional financial values as decimal strings, not JSON numbers.')
  if (!['string', 'number', 'bigint'].includes(typeof value) || !/^[+-]?\d+(?:\.\d+)?$/.test(String(value))) throw invalid('Use a finite decimal string for financial values.')
  return new Exact(value)
}
export const parsedMoney = value => isPostgres() ? money(value ?? '0') : parseFloat(value)
export const finite = value => value instanceof Exact ? value.decimal.isFinite() : Number.isFinite(value)
export function binary(op, a, b) {
  if (a instanceof Exact || b instanceof Exact) {
    const x = decimal(a), y = decimal(b)
    if (['<','<=','>','>=','===','!==','==','!='].includes(op)) {
      const c = x.cmp(y)
      return ({ '<':c<0, '<=':c<=0, '>':c>0, '>=':c>=0, '===':c===0, '!==':c!==0, '==':c===0, '!=':c!==0 })[op]
    }
    let result
    if (op === '+') result = x.plus(y)
    else if (op === '-') result = x.minus(y)
    else if (op === '*') result = x.times(y)
    else if (op === '/') {
      if (y.isZero()) throw invalid('Financial division by zero.')
      const fraction = d => { const [a,b=''] = d.abs().toFixed().split('.');return [BigInt(a+b),10n**BigInt(b.length)] }
      const [xn,xd] = fraction(x), [yn,yd] = fraction(y)
      const numerator=xn*yd
      let denominator=yn*xd
      let a=numerator,b=denominator
      while(b){const r=a%b;a=b;b=r}
      denominator/=a
      while(denominator%2n===0n)denominator/=2n
      while(denominator%5n===0n)denominator/=5n
      if(denominator!==1n) throw invalid('Non-terminating decimal division requires an explicit accounting allocation policy.')
      result = x.div(y)
      if (!result.times(y).eq(x)) throw invalid('Non-terminating decimal division requires an explicit accounting allocation policy.')
    } else throw new Error('Unsupported decimal operator')
    return new Exact(result.toFixed())
  }
  switch (op) {
    case '+': return a + b
    case '-': return a - b
    case '*': return a * b
    case '/': return a / b
    case '%': return a % b
    case '<': return a < b
    case '<=': return a <= b
    case '>': return a > b
    case '>=': return a >= b
    case '===': return a === b
    case '!==': return a !== b
    // Existing routes only use strict comparisons; reject accidental coercive ones.
    default: throw new Error('Unsupported numeric operator')
  }
}
export function math(name, ...values) {
  if (!values.some(v => v instanceof Exact)) return Math[name](...values)
  const d = values.map(decimal)
  if (name === 'abs') return new Exact(d[0].abs().toFixed())
  if (name === 'max') return new Exact(D.max(...d).toFixed())
  if (name === 'min') return new Exact(D.min(...d).toFixed())
  if (name === 'round') {
    assertFinancialPolicy()
    // Math.round's tie direction is +Infinity, including negative values.
    return new Exact(d[0].toDecimalPlaces(0, D.ROUND_HALF_CEIL).toFixed())
  }
  throw new Error('Unsupported exact decimal Math operation')
}
export function installments(total, duration) {
  if (!isPostgres()) return Array(duration).fill(Math.round(total / duration * 100) / 100)
  if (!Number.isInteger(duration) || duration < 1 || duration > 120) throw invalid('Invalid installment duration.')
  assertFinancialPolicy()
  const value = decimal(total)
  if (value.decimalPlaces() > 2 || value.isNegative()) throw invalid('Schedule requires approved values with at most two decimal places.')
  const units = BigInt(value.times(100).toFixed())
  const count = BigInt(duration), base = units / count, remainder = units % count
  // Proposed reviewed-v1 rule: residual cents go to the earliest installments.
  return Array.from({ length:duration }, (_,i) => new Exact(new D((base + (BigInt(i)<remainder ? 1n:0n)).toString()).div(100).toFixed()))
}
export function financialWriteGuard(req, res, next) {
  try {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) assertFinancialPolicy()
    next()
  } catch (error) { res.status(error.statusCode || 503).json({ error:error.message }) }
}
