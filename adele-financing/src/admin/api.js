// When the frontend is hosted separately from the API (e.g. Vercel), set
// VITE_API_URL to the public API origin. Leave it empty when both are served
// from the same origin (local dev proxy or the API server itself).
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// The signed-in staff member is identified by an HttpOnly session cookie that
// the browser attaches on its own. There is deliberately no token in
// localStorage or sessionStorage: script cannot read an HttpOnly cookie, so a
// cross-site-script injection cannot steal the session the way it could steal a
// stored bearer token. 'include' is what makes the browser send the cookie.
export const CREDENTIALS = 'include'

// Set by AuthContext so an expired or revoked session can clear the UI.
// Declared here to avoid a circular import between the two modules.
let sessionExpiredHandler = null
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler
}

export function apiUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}/api${suffix}`
}

/**
 * Clears the JWT left behind by the previous authentication scheme. Sessions are
 * now server-side and HttpOnly, so any leftover value is dead weight that would
 * only mislead a future reader into thinking tokens are still in use.
 */
export function purgeLegacyToken() {
  try {
    localStorage.removeItem('adele_lms_token')
    sessionStorage.removeItem('adele_lms_token')
  } catch {
    // Private-mode browsers can refuse storage access. Nothing depends on it.
  }
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const res = await fetch(apiUrl(path), {
    ...options,
    credentials: CREDENTIALS,
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
    // A 401 can arrive on any request once the session has expired, been
    // revoked, or been timed out. Notifying the app here stops the UI from
    // continuing to look signed in.
    if (res.status === 401 && sessionExpiredHandler) {
      sessionExpiredHandler(data?.error || 'Your session has ended. Please sign in again.')
    }
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
  { to: '/admin/messages', label: 'Messages', icon: '📨' },
  { to: '/admin/customers', label: 'Customers', icon: '👥' },
  { to: '/admin/loan-applications', label: 'Loan Applications', icon: '📝' },
  { to: '/admin/loan-products', label: 'Loan Products', icon: '🏷️' },
  { to: '/admin/loans', label: 'Loans', icon: '💰' },
  { to: '/admin/repayments', label: 'Repayments', icon: '↩️' },
  { to: '/admin/payments', label: 'Payments', icon: '💳' },
  { to: '/admin/reports', label: 'Reports', icon: '📈' },
  { to: '/admin/finance', label: 'Finance', icon: '💹' },
  { to: '/admin/users', label: 'Staff / Users', icon: '🛡️' },
  { to: '/admin/sessions', label: 'Sessions', icon: '🔐' },
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
    '/admin/messages',
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