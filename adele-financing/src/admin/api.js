const TOKEN_KEY = 'adele_lms_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const error = new Error(data?.error || 'Request failed.')
    error.status = res.status
    error.data = data
    throw error
  }

  return data
}

export const apiGet = (path, params) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return api(path + qs)
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  loan_officer: 'Loan Officer',
  finance_officer: 'Finance Officer',
  manager: 'Manager',
}

export const ADMIN_NAVIGATION = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
  { to: '/admin/loan-applications', label: 'Loan Applications', icon: '📝' },
  { to: '/admin/loan-products', label: 'Loan Products', icon: '🏷️' },
  { to: '/admin/loans', label: 'Loans', icon: '💰' },
  { to: '/admin/repayments', label: 'Repayments', icon: '↩️' },
  { to: '/admin/payments', label: 'Payments', icon: '💳' },
  { to: '/admin/reports', label: 'Reports', icon: '📈' },
  { to: '/admin/finance', label: 'Finance', icon: '💹' },
  { to: '/admin/users', label: 'Staff / Users', icon: '🛡️' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙️' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: '📋' },
]

export const ADMIN_PERMISSIONS = {
  super_admin: ADMIN_NAVIGATION.map((n) => n.to),
  loan_officer: [
    '/admin/dashboard',
    '/admin/customers',
    '/admin/loan-applications',
    '/admin/loans',
  ],
  finance_officer: [
    '/admin/dashboard',
    '/admin/payments',
    '/admin/repayments',
    '/admin/reports',
    '/admin/finance',
  ],
  manager: [
    '/admin/dashboard',
    '/admin/loan-applications',
    '/admin/loans',
    '/admin/reports',
    '/admin/finance',
  ],
}

export function canAccess(role, path) {
  const access = ADMIN_PERMISSIONS[role] || []
  return access.includes(path)
}

export function navItemsFor(role) {
  const access = ADMIN_PERMISSIONS[role] || []
  return ADMIN_NAVIGATION.filter((item) => access.includes(item.to))
}