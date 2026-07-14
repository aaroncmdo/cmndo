#!/usr/bin/env node
// RLS-Policy-Ratchet — blockt NEUE permissive Policies ohne explizite Rollen-Klausel.
//
//   (default)         --warn   : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf die aktuelle Menge
//
// REGEL: PERMISSIVE `CREATE POLICY` braucht ein explizites `TO <rolle>` (nicht `public`).
// Ohne `TO` ist der Postgres-Default `TO public` -> die Policy faechert ueber ALLE Cluster-Rollen
// auf, auch ueber die 4 ohne App-Traffic (authenticator/cli_login_postgres/dashboard_user/
// supabase_privileged_role). Der Supabase-Advisor zaehlt `multiple_permissive_policies` je
// (Tabelle x ROLLE x Action) -> jeder Overlap wird 4x doppelt gezaehlt. Das war das 49-%-Rauschen
// (313 Findings), das B2a (20260714171501) rausgeraeumt hat. `TO public` ist der Default, den man
// sich einfaengt, wenn man die Klausel schlicht vergisst — ohne Gate kommt das Rauschen zurueck.
//
// KEIN DB-/NETZ-ZUGRIFF: reiner Scan von supabase/migrations/*.sql (CI hat hier keine DB-Creds —
// deshalb laeuft check:rls-grants auch nicht in CI). Das Script liest nur Dateien; es kann per
// Konstruktion weder prod noch Daten anfassen.
//
// BASELINE = EINGEFRORENE HISTORIE, KEIN "Schuldenabbau".
// Anders als bei component-set/knip duerfen die Baseline-Files NICHT nachtraeglich editiert
// werden — applizierte Migrationen sind unveraenderlich (Regel 2). Der DB-Zustand dieser alten
// Policies wurde bereits von B2a korrigiert (ALTER POLICY ... TO anon, authenticated). Die
// Baseline sagt also nur: "diese historischen Files sind bekannt, nicht neu flaggen".
// --update-baseline ist daher der Ausnahmefall (bewusste, begruendete Neuaufnahme), nicht der
// Normalpfad.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanFiles, diffBaseline } from './lib/rls-policy-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')
const BASELINE_PATH = join(__dirname, 'rls-policy-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update-baseline'
    : 'warn'

if (!existsSync(MIGRATIONS_DIR)) {
  console.log('[rls-policies] keine supabase/migrations/ — skip.')
  process.exit(0)
}

const entries = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))

const findings = scanFiles(entries)
const violatingFiles = [...new Set(findings.map((f) => f.file))].sort()

function printFindings() {
  const byFile = new Map()
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file).push(f)
  }
  for (const [file, fs_] of byFile) {
    console.log(`  ${file}  (${fs_.length})`)
    for (const f of fs_.slice(0, 4)) {
      const why = f.kind === 'to-public' ? 'TO public' : 'keine TO-Klausel (Default = public)'
      console.log(`      - ${f.policy} on ${f.table}  -> ${why}`)
    }
    if (fs_.length > 4) console.log(`      … +${fs_.length - 4} weitere`)
  }
}

if (mode === 'update-baseline') {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: violatingFiles.length, statements: findings.length, files: violatingFiles },
      null,
      2,
    ) + '\n',
  )
  console.log(`[rls-policies] Baseline geschrieben: ${violatingFiles.length} Files / ${findings.length} Statements.`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[rls-policies] FEHLER: keine Baseline. Erst `npm run check:rls-policies -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(violatingFiles, baseline.files ?? [])

  if (added.length > 0) {
    console.error(`[rls-policies] ❌ ${added.length} NEUE Migration(en) mit permissiver Policy ohne explizite Rollen-Klausel:\n`)
    for (const file of added) {
      const fs_ = findings.filter((f) => f.file === file)
      console.error(`  ${file}`)
      for (const f of fs_) {
        const why = f.kind === 'to-public' ? 'TO public' : 'keine TO-Klausel (Postgres-Default = TO public)'
        console.error(`      - ${f.policy} on ${f.table}  -> ${why}`)
      }
    }
    console.error(`
  FIX: der Policy eine explizite Rollen-Klausel geben, z. B.

      CREATE POLICY x ON public.t FOR SELECT TO anon, authenticated USING (…);

  WARUM: ohne TO ist der Default \`TO public\` — die Policy gilt dann auch fuer
  authenticator / cli_login_postgres / dashboard_user / supabase_privileged_role
  (0 App-Traffic, 0 Grants). Der Advisor zaehlt je (Tabelle x ROLLE x Action), also
  wird jeder Overlap 4x doppelt gezaehlt = genau das Rauschen, das B2a entfernt hat.

  AUSNAHMEN (werden nicht geflaggt): \`AS RESTRICTIVE\` (dort ist TO public korrekt —
  verengen wuerde die Restriktion LOCKERN) und dynamisches SQL mit %I/%s-Platzhaltern.
`)
    process.exit(1)
  }

  if (removed.length > 0) {
    console.log(`[rls-policies] ${removed.length} Baseline-File(s) nicht mehr verletzend — Baseline kann gesenkt werden: \`npm run check:rls-policies -- --update-baseline\``)
  }
  console.log(`[rls-policies] OK — ${violatingFiles.length} bekannte Verletzer-Files (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
if (findings.length === 0) {
  console.log('[rls-policies] OK — keine permissive Policy ohne explizite Rollen-Klausel.')
  process.exit(0)
}
console.warn(`[rls-policies] ${findings.length} Statement(s) in ${violatingFiles.length} File(s) ohne explizite Rollen-Klausel:`)
printFindings()
console.warn('\n(nur Warnung — CI blockt via `-- --ratchet` nur NEUE Files)')
process.exit(0)
