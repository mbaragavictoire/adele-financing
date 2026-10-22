// Maps the selected UI language to an Intl locale used for date and number
// formatting. Kept in a plain module (no React) so non-component helpers such
// as the admin formatters can read it without creating an import cycle.
const LOCALES = {
  en: 'en-GB',
  rw: 'en-GB',
  fr: 'fr-FR',
}

let currentLang = 'en'

export function setFormatLanguage(lang) {
  currentLang = lang
}

export function formatLocale() {
  return LOCALES[currentLang] || 'en-GB'
}
