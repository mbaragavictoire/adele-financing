// Temporary audit: verifies the translation files are complete and that every
// t('key') used in the source resolves to a real string in all three languages.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const messagesDir = join(root, 'src', 'i18n', 'messages')

const dicts = { en: {}, rw: {}, fr: {} }
const seenIn = {} // key -> [files]

const files = readdirSync(messagesDir).filter((f) => f.endsWith('.js'))
for (const file of files) {
  const mod = await import(pathToFileURL(join(messagesDir, file)).href)
  const data = mod.default || mod
  for (const lang of ['en', 'rw', 'fr']) {
    const block = data[lang]
    if (!block) {
      console.log(`MISSING LANGUAGE BLOCK ${lang} in ${file}`)
      continue
    }
    for (const key of Object.keys(block)) {
      if (seenIn[key] && !seenIn[key].includes(file)) {
        console.log(`DUPLICATE KEY "${key}" in ${file} (already in ${seenIn[key].join(', ')})`)
      }
      ;(seenIn[key] ||= []).push(file)
      dicts[lang][key] = block[key]
    }
  }
}

// Language parity
const enKeys = new Set(Object.keys(dicts.en))
for (const lang of ['rw', 'fr']) {
  for (const k of enKeys) if (!(k in dicts[lang])) console.log(`MISSING ${lang}: ${k}`)
  for (const k of Object.keys(dicts[lang])) if (!enKeys.has(k)) console.log(`EXTRA ${lang}: ${k}`)
}

// Scan source for t('...') usages
function walk(dir) {
  let out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out = out.concat(walk(p))
    else if (/\.(jsx|js)$/.test(entry.name) && !p.includes('i18n')) out.push(p)
  }
  return out
}

const srcFiles = walk(join(root, 'src'))
const used = new Map()
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8')
  const re = /\bt\(\s*['"]([A-Za-z0-9_.-]+)['"]/g
  let m
  while ((m = re.exec(text))) used.set(m[1], f.replace(root + '\\', ''))
}

console.log(`\nTotal keys: ${enKeys.size} | source files scanned: ${srcFiles.length}`)
let missing = 0
for (const [key, where] of used) {
  if (!(key in dicts.en)) {
    console.log(`UNRESOLVED t('${key}') in ${where}`)
    missing++
  }
}
console.log(missing === 0 ? 'OK: every referenced key exists.' : `${missing} unresolved keys.`)
