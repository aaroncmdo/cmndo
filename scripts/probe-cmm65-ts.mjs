// CMM-65 timestamp-sweep verification probe (read-only).
//
// Confirms that moving `faelle.created_at` reads onto `claims` — via the
// `claims:claim_id!inner(created_at)` embed-filter (Pattern 1) — is
// behavior-preserving, by checking the invariants and comparing the old vs new
// filter counts on live data.
//
// Usage:  node scripts/probe-cmm65-ts.mjs
//
// NOTE: node `fetch`/undici hangs against Supabase in this environment (IPv6),
// so we shell out to `curl -4` (forces IPv4), which works reliably. Reads the
// service-role key from .env.local; nothing is mutated.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const envVal = (re) => {
  const line = env.split(/\r?\n/).find((l) => re.test(l) && !l.trimStart().startsWith('#'))
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined
}
const URL_ = envVal(/^NEXT_PUBLIC_SUPABASE_URL\s*=/)
const KEY = envVal(/^SUPABASE_SERVICE_ROLE_KEY\s*=/) || envVal(/SERVICE_ROLE\w*\s*=/)
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SERVICE_ROLE key in .env.local')
  process.exit(1)
}

/** Exact row count for a PostgREST query path, via curl -4 + count header. */
function count(path) {
  const out = execFileSync('curl', [
    '-4', '-s', '-m', '25', '-D', '-', '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
    `${URL_}/rest/v1/${path}&limit=0`,
    '-H', `apikey: ${KEY}`,
    '-H', `Authorization: Bearer ${KEY}`,
    '-H', 'Prefer: count=exact',
    '-H', 'Range: 0-0',
  ], { encoding: 'utf8' })
  const m = out.match(/content-range:\s*[^/]*\/(\d+)/i)
  return m ? Number(m[1]) : `??? (${(out.match(/^HTTP\S* (\d+)/m) || [])[1] ?? 'no status'})`
}

console.log('== Invariants (Pattern 1 / !inner is loss-free) ==')
console.log('faelle total                 :', count('faelle?select=id'))
console.log('faelle WHERE claim_id IS NULL:', count('faelle?select=id&claim_id=is.null'), '  (must be 0)')
console.log('faelle WHERE created_at NULL :', count('faelle?select=id&created_at=is.null'), '  (must be 0)')
console.log('claims WHERE created_at NULL :', count('claims?select=id&created_at=is.null'), '  (must be 0)')
console.log('claims total                 :', count('claims?select=id'), '  (>= faelle: faelle is a subset of claims)')

console.log('\n== Behavior-preservation: old faelle.created_at vs new claims.created_at (!inner) ==')
for (const d of ['2000-01-01', '2026-05-01', '2026-05-15', '2026-05-24']) {
  const oldC = count(`faelle?select=id&created_at=gte.${d}`)
  const newC = count(`faelle?select=id,claims:claim_id!inner(created_at)&claims.created_at=gte.${d}`)
  console.log(`gte ${d}: old=${oldC}  new=${newC}  -> ${oldC === newC ? 'OK' : 'MISMATCH'}`)
}
