// Import every server module so a missing or renamed export is caught here
// rather than only when the server is restarted.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve('server')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

let failed = 0
for (const file of walk(root)) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, '/')
  try {
    await import(pathToFileURL(file).href)
    console.log(`ok    ${rel}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${rel}`)
    console.log(`      ${e.message}`)
  }
}
console.log(`\nfailures: ${failed}`)
process.exit(failed ? 1 : 0)