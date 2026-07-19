#!/usr/bin/env node
// Authenticated-Write-Reachability-Ratchet (19.07.2026). Blockt NEUE PERMISSIVE authenticated-
// WRITE-Policies (INSERT/UPDATE/DELETE), deren reachability-relevanter Ausdruck einen top-level-
// OR-Zweig OHNE auth.uid()/Scoping-Helper hat -> jeder eingeloggte User kann fremde/beliebige
// Zeilen schreiben (cross-user/cross-tenant Write). Drei Modi:
//   (default)         --warn   : listet reachable Write-Policies, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes/Boy-Scout)
//
// Write-Gegenstueck zu check-anon-reachability (SELECT/true-anon-Achse). Ergaenzt die WURZEL
// (default-closed GRANT-Achse) um die POLICY-Reachability-Achse fuer Writes. Backing-RPC
// audit_authenticated_write_reachable() (service_role-only, read-only). Pure Heuristik:
// scripts/lib/authenticated-write-scan.mjs (reuse anon-reachability-scan.mjs) + AGENTS.md.
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// PR-Gate wie check-anon-reachability: Write-Reachability-Drift entsteht nur durch Migrations-
// SQL (neue/geaenderte Policy) -> im CI-Ratchet nur laufen, wenn supabase/** oder *.sql
// beruehrt wird (sonst saturiert der geteilte Prod-Pool bei vielen parallelen Sessions).

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rowsToWriteViolations, diffBaseline } from './lib/authenticated-write-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'authenticated-write-reachability-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function prTouchesSql() {
  const base = process.env.GITHUB_BASE_REF
  if (!base) return true // kein PR-Kontext (push/lokal) -> immer pruefen
  try {
    execSync(`git fetch --no-tags --depth=1 origin ${base}`, { stdio: 'ignore' })
    const out = execSync(`git diff --name-only origin/${base} HEAD -- supabase "*.sql"`, { encoding: 'utf8' })
    return out.trim().length > 0
  } catch {
    return true // fail-safe: lieber unnoetig pruefen als Drift verpassen
  }
}

if (mode === 'ratchet' && !prTouchesSql()) {
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Authenticated-Write-Reachability-Ratchet uebersprungen.')
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('❌ ENV fehlt: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function istTransient(err) {
  const m = String(err?.message ?? err)
  return /fetch failed|ECONNRESET|ETIMEDOUT|522|524|socket hang up/i.test(m)
}

async function audit() {
  const db = createClient(URL, SERVICE, { auth: { persistSession: false } })
  let letzterFehler
  for (let versuch = 0; versuch <= RETRY_DELAYS_MS.length; versuch++) {
    if (versuch > 0) {
      console.log(`   ↻ Retry ${versuch}/${RETRY_DELAYS_MS.length} in ${RETRY_DELAYS_MS[versuch - 1] / 1000}s …`)
      await sleep(RETRY_DELAYS_MS[versuch - 1])
    }
    const { data, error } = await db.rpc('audit_authenticated_write_reachable')
    if (!error) return data ?? []
    letzterFehler = error
    if (!istTransient(error)) break
  }
  throw new Error(`RPC audit_authenticated_write_reachable fehlgeschlagen: ${letzterFehler?.message ?? letzterFehler}`)
}

const rows = await audit()
const current = rowsToWriteViolations(rows)

if (mode === 'update') {
  const payload = { generatedAt: new Date().toISOString(), count: current.length, keys: current }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[auth-write-reach] Baseline aktualisiert: ${current.length} reachable authenticated-Write-Policies -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[auth-write-reach] FEHLER: keine Baseline. Erst `npm run check:auth-write-reachability -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(current, baseline.keys ?? [])
  if (added.length > 0) {
    console.error(`\n❌ [auth-write-reach] ${added.length} NEUE reachable authenticated-Write-Policy(s):`)
    for (const k of added) console.error(`  + ${k}`)
    console.error('\nEine PERMISSIVE authenticated-WRITE-Policy mit einem top-level-OR-Zweig OHNE auth.uid()')
    console.error('(oder einen Scoping-Helper) laesst JEDEN eingeloggten User fremde/beliebige Zeilen')
    console.error('schreiben (INSERT/UPDATE/DELETE) — cross-user/cross-tenant Write. Fix: den Zweig an')
    console.error('auth.uid()/einen is_*()/scoping-Helper binden (Muster: makler.user_id = auth.uid()),')
    console.error('ODER den authenticated-Write-Grant der Tabelle entziehen. Bewusster Broad-Write')
    console.error('(oeffentlicher Submit) -> Baseline via --update-baseline. Neuer uid-Helper fehlt ->')
    console.error('UID_GATE_TOKENS in scripts/lib/anon-reachability-scan.mjs ergaenzen. AGENTS.md §Write-Reachability-Gate.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[auth-write-reach] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:auth-write-reachability -- --update-baseline\``)
  }
  console.log(`[auth-write-reach] OK — ${current.length} bekannte reachable authenticated-Write-Policies (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[auth-write-reach] ${current.length} reachable authenticated-Write-Policies (Write-Reachability-Ratchet). Policy: AGENTS.md §Write-Reachability-Gate`)
for (const k of current) console.log(`  • ${k}`)
process.exit(0)
