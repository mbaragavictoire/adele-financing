// Temporary audit (v2): flags likely untranslated user-visible English literals
// left in JSX, including text that sits next to {expressions}.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'src')

function walk(dir) {
  let out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'assets') continue
      out = out.concat(walk(p))
    } else if (entry.name.endsWith('.jsx')) out.push(p)
  }
  return out
}

// Words that are fine to leave in English (brand, data, identifiers, units).
const allow = [
  /^(ADELE|Adele)/i,
  /adele/i,
  /@/,
  /^https?:/,
  /^[+\d\s()/–-]+$/,
  /RWF|TIN|NDTFS|BNR/i,
  /^[A-Z_]{2,}$/,
  /^[a-z_]+$/,
  /^[\d.,%:]+$/,
]

function stripBraces(line) {
  let out = line
  for (let i = 0; i < 6; i++) out = out.replace(/\{[^{}]*\}/g, ' ')
  return out
}

const attrRe = /\b(placeholder|aria-label|title|alt)=["']([^"']{2,})["']/g
const textRe = />([^<>]*[A-Za-z]{2,}[^<>]*)</g

for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(root, file)
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    if (/^import\b/.test(trimmed)) return
    let m
    attrRe.lastIndex = 0
    while ((m = attrRe.exec(line))) {
      const v = m[2].trim()
      if (allow.some((r) => r.test(v))) continue
      console.log(`${rel}:${i + 1}  attr ${m[1]}="${v}"`)
    }
    const stripped = stripBraces(line)
    textRe.lastIndex = 0
    while ((m = textRe.exec(stripped))) {
      const v = m[1].trim().replace(/\s+/g, ' ')
      if (!v || allow.some((r) => r.test(v))) continue
      // Skip pure punctuation / arrows / separators.
      if (/^[^A-Za-z]+$/.test(v)) continue
      console.log(`${rel}:${i + 1}  text > ${v}`)
    }
  })
}
console.log('scan done')
