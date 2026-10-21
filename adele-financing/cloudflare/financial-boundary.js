const WRITE_METHODS = new Set(['POST','PUT','PATCH','DELETE'])
const FINANCIAL_PATH = /^\/api\/(?:customers|loan-products|loan-applications|loans|repayment-schedules|repayments|payments|finance|settings|public-applications|applications|apply|incomes|expenses)(?:\/|$)/i
export const blockedFinancialWrite = (method, pathname) => WRITE_METHODS.has(method) && FINANCIAL_PATH.test(pathname)
