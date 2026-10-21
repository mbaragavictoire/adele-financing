// Read-only audit. The historical value stays in process memory, never arguments or output.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function git(args) {
  const result = spawnSync('git', args, { maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Git inspection failed.')
  return result.stdout
}
const root = git(['rev-parse', '--show-toplevel']).toString().trim()
const legacySource = git(['show', 'master:adele-financing/scripts/temp-admin.mjs']).toString()
const match = legacySource.match(/const PASSWORD\s*=\s*(['"])([^'"\r\n]+)\1/)
if (!match) throw new Error('Historical fixture anchor missing; manual review required.')
const legacy = Buffer.from(match[2])
const names = [...new Set(
  git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean),
)]
const current = []
for (const relative of names) {
  const file = path.resolve(process.cwd(), relative)
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue
  const bytes = fs.readFileSync(file)
  if (bytes.includes(legacy)) current.push({ path: relative, containsLegacyValue: true })
}
const objects = git(['rev-list', '--objects', 'master', 'refs/remotes/origin/master'])
  .toString().split('\n').filter((line) => line.includes(' '))
  .map((line) => ({ oid: line.split(' ')[0], path: line.slice(line.indexOf(' ') + 1) }))
const batch = spawnSync('git', ['cat-file', '--batch'], {
  input: objects.map((object) => object.oid).join('\n') + '\n',
  maxBuffer: 64 * 1024 * 1024,
})
if (batch.status !== 0) throw new Error('Git object inspection failed.')
let offset = 0
const historical = []
for (const object of objects) {
  const newline = batch.stdout.indexOf(10, offset)
  const [, kind, length] = batch.stdout.subarray(offset, newline).toString().split(' ')
  offset = newline + 1
  const bytes = batch.stdout.subarray(offset, offset + Number(length))
  offset += Number(length) + 1
  if (kind === 'blob' && bytes.includes(legacy)) {
    historical.push({ path: object.path, object: object.oid, containsLegacyValue: true })
  }
}
console.log(JSON.stringify({
  currentWorkingSourceOccurrences: current,
  historicalBlobOccurrences: historical,
  scope: 'current worktree and master/origin-master reachable objects; no network or database access',
  remediation: 'Rotate the previously identified inactive account before reuse and revoke its sessions only after separate approval. Remove/review all known reused credentials in other environments. History is unchanged.',
}, null, 2))
process.exitCode = current.length ? 1 : 0
