// A personal name: Unicode letters (covers Kinyarwanda, French and English
// names, including accented letters), combining marks, spaces, hyphens,
// apostrophes and periods. Never digits — a name is not a phone number, and
// mixed-in numbers only create dirty records staff then have to clean up.

export function stripInvalidNameChars(value) {
  return String(value ?? '').replace(/[^\p{L}\p{M} '.-]/gu, '')
}

export function isValidName(value) {
  const text = String(value ?? '').trim()
  return text.length > 0 && /^[\p{L}\p{M}][\p{L}\p{M} '.-]*$/u.test(text)
}