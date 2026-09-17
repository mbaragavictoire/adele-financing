export const RW_COUNTRY_CODE = '+250'
export const RW_LOCAL_LENGTH = 9

export function sanitizeLocalPhone(value) {
  let d = String(value ?? '').replace(/[^\d]/g, '')
  if (d.startsWith('250')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(0, RW_LOCAL_LENGTH)
}

export function rwPhoneFull(value) {
  const local = sanitizeLocalPhone(value)
  return local ? `${RW_COUNTRY_CODE}${local}` : ''
}

export function isValidRwPhone(value) {
  const local = sanitizeLocalPhone(value)
  return /^[78]\d{8}$/.test(local)
}