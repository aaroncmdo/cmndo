#!/usr/bin/env node
// Anon-Grant-Drift-Bremse (Grant-Audit-Ratchet, 15.07.2026). Drei Modi:
//   (default)         --warn   : listet anon-lesbare sensible Spalten, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes/Boy-Scout)
//
// Hintergrund + Muster: scripts/lib/anon-grant-scan.mjs + AGENTS.md §Anon-Grant-Gate.
// Backing-RPC audit_anon_sensitive_grants() (service_role-only, read-only, pg_catalog-Scan).
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// PR-Gate wie check-claims-column-grants (AAR-921): Grant-Drift entsteht nur durch Migrations-
// SQL -> im CI-Ratchet nur laufen, wenn supabase/** oder *.sql beruehrt wird (sonst saturiert
// der geteilte Prod-Pool bei vielen parallelen Sessions).

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rowsToKeys, diffBaseline } from './lib/anon-grant-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'anon-sensitive-grants-baseline.json')

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

// Nur im CI-Ratchet ohne SQL-Diff ueberspringen (Pool-Schonung). Lokal/update laufen immer.
if (mode === 'ratchet' && !prTouchesSql()) {
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Anon-Grant-Ratchet uebersprungen.')
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

// Nur transiente Netzwerk-/Edge-Fehler retryen (CF 522/524, fetch failed). Echte RPC-Fehler
// (Function fehlt, permission denied) sind hart-fatal — die sollen den Build sofort stoppen.
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
    const { data, error } = await db.rpc('audit_anon_sensitive_grants')
    if (!error) return data ?? []
    letzterFehler = error
    if (!istTransient(error)) break
  }
  throw new Error(`RPC audit_anon_sensitive_grants fehlgeschlagen: ${letzterFehler?.message ?? letzterFehler}`)
}

const rows = await audit()
const current = rowsToKeys(rows)

if (mode === 'update') {
  const payload = { generatedAt: new Date().toISOString(), count: current.length, keys: current }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[anon-grant] Baseline aktualisiert: ${current.length} anon-lesbare sensible Spalten -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[anon-grant] FEHLER: keine Baseline. Erst `npm run check:anon-sensitive-grants -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(current, baseline.keys ?? [])
  if (added.length > 0) {
    console.error(`\n❌ [anon-grant] ${added.length} NEUE(r) anon-SELECT-Grant(s) auf sensible Spalte(n):`)
    for (const k of added) console.error(`  + ${k}`)
    console.error('\nanon darf sensible Spalten (Bank/Steuer/OAuth-Token/Secret/Passwort/Provision/Honorar/Notiz)')
    console.error('nicht lesen — RLS schuetzt nur ZEILEN; ein spaeterer anon-Policy-Zweig legt die Spalte offen.')
    console.error('Fix: in der Migration den table-weiten anon-SELECT-Grant entziehen + nur benigne Spalten neu')
    console.error('granten (Muster Mig 20260715120651). Echter Nicht-Geheimnis-Fall -> SEMANTIC_ALLOWLIST in')
    console.error('scripts/lib/anon-grant-scan.mjs (mit Begruendung). Siehe AGENTS.md §Anon-Grant-Gate.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[anon-grant] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:anon-sensitive-grants -- --update-baseline\``)
  }
  console.log(`[anon-grant] OK — ${current.length} bekannte anon-lesbare sensible Spalten (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[anon-grant] ${current.length} anon-lesbare sensible Spalten (Grant-Audit-Ratchet). Policy: AGENTS.md §Anon-Grant-Gate`)
for (const k of current) console.log(`  • ${k}`)
process.exit(0)
