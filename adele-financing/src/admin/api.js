// When the frontend is hosted separately from the API (e.g. Vercel), set
// VITE_API_URL to the public API origin. Leave it empty when both are served
// from the same origin (local dev proxy or the API server itself).
import { formatLocale } from '../i18n/locale.js'

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
  return new Intl.NumberFormat(formatLocale(), {
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(formatLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Display labels are translated at render time. `label` is kept as the English
// fallback so any code that still reads it directly keeps working, while
// `labelKey` drives the translated text.
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  loan_officer: 'Loan Officer',
  finance_officer: 'Finance Officer',
  manager: 'Manager',
}

export const ROLE_LABEL_KEYS = {
  super_admin: 'role.super_admin',
  loan_officer: 'role.loan_officer',
  finance_officer: 'role.finance_officer',
  manager: 'role.manager',
}

export const ADMIN_NAVIGATION = [
  { to: '/admin/dashboard', label: 'Dashboard', labelKey: 'admin.nav.dashboard', icon: '📊' },
  { to: '/admin/messages', label: 'Messages', labelKey: 'admin.nav.messages', icon: '📨' },
  { to: '/admin/customers', label: 'Customers', labelKey: 'admin.nav.customers', icon: '👥' },
  { to: '/admin/loan-applications', label: 'Loan Applications', labelKey: 'admin.nav.loanApplications', icon: '📝' },
  { to: '/admin/loan-products', label: 'Loan Products', labelKey: 'admin.nav.loanProducts', icon: '🏷️' },
  { to: '/admin/loans', label: 'Loans', labelKey: 'admin.nav.loans', icon: '💰' },
  { to: '/admin/repayments', label: 'Repayments', labelKey: 'admin.nav.repayments', icon: '↩️' },
  { to: '/admin/payments', label: 'Payments', labelKey: 'admin.nav.payments', icon: '💳' },
  { to: '/admin/reports', label: 'Reports', labelKey: 'admin.nav.reports', icon: '📈' },
  { to: '/admin/finance', label: 'Finance', labelKey: 'admin.nav.finance', icon: '💹' },
  { to: '/admin/users', label: 'Staff / Users', labelKey: 'admin.nav.users', icon: '🛡️' },
  { to: '/admin/sessions', label: 'Sessions', labelKey: 'admin.nav.sessions', icon: '🔐' },
  { to: '/admin/settings', label: 'Settings', labelKey: 'admin.nav.settings', icon: '⚙️' },
  { to: '/admin/audit-logs', label: 'Audit Logs', labelKey: 'admin.nav.auditLogs', icon: '📋' },
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