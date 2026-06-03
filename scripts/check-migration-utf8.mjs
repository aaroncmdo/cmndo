// CI-Gate: jedes supabase/migrations/*.sql muss valides UTF-8 sein.
// Verhindert die Wiederkehr Latin-1-kodierter Migrations (Incident 2026-05-29: 139
// placeholder-Stubs in Windows-1252 brachen die Supabase-Preview fuer alle Migrations-PRs).
// Siehe docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const decoder = new TextDecoder('utf-8', { fatal: true })
const files = readdirSync(DIR).filter((n) => n.endsWith('.sql'))
const bad = []
for (const name of files) {
  try {
    decoder.decode(readFileSync(join(DIR, name)))
  } catch {
    bad.push(name)
  }
}
if (bad.length) {
  console.error(`Ungueltiges UTF-8 in ${bad.length} Migration(en):\n` + bad.join('\n'))
  console.error('\nFix: node scripts/fix-migration-utf8.mjs')
  process.exit(1)
}
console.log(`OK: ${files.length} Migrations alle valides UTF-8`)
