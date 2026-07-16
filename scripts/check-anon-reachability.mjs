#!/usr/bin/env node
// Reachability-Ratchet (16.07.2026). Blockt NEUE anon-SELECT-Policies mit einem OR-Zweig,
// der OHNE auth.uid() (true-anon) Zeilen durchlaesst, auf Tabellen mit Kontakt-PII. Drei Modi:
//   (default)         --warn   : listet reachable PII-Policies, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes/Boy-Scout)
//
// Ergaenzt den Anon-Grant-Ratchet (check-anon-sensitive-grants: Spalten-NAMEN-Achse) um die
// Policy-REACHABILITY-Achse. Backing-RPC audit_anon_reachable_pii() (service_role-only,
// read-only). Pure Heuristik: scripts/lib/anon-reachability-scan.mjs + AGENTS.md.
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// PR-Gate wie check-anon-sensitive-grants: Reachability-Drift entsteht nur durch Migrations-
// SQL (neue/geaenderte Policy) -> im CI-Ratchet nur laufen, wenn supabase/** oder *.sql
// beruehrt wird (sonst saturiert der geteilte Prod-Pool bei vielen parallelen Sessions).

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rowsToViolations, diffBaseline } from './lib/anon-reachability-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'anon-reachability-baseline.json')

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
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Reachability-Ratchet uebersprungen.')
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
    const { data, error } = await db.rpc('audit_anon_reachable_pii')
    if (!error) return data ?? []
    letzterFehler = error
    if (!istTransient(error)) break
  }
  throw new Error(`RPC audit_anon_reachable_pii fehlgeschlagen: ${letzterFehler?.message ?? letzterFehler}`)
}

const rows = await audit()
const current = rowsToViolations(rows)

if (mode === 'update') {
  const payload = { generatedAt: new Date().toISOString(), count: current.length, keys: current }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[anon-reach] Baseline aktualisiert: ${current.length} anon-reachable PII-Policies -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[anon-reach] FEHLER: keine Baseline. Erst `npm run check:anon-reachability -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const { added, removed } = diffBaseline(current, baseline.keys ?? [])
  if (added.length > 0) {
    console.error(`\n❌ [anon-reach] ${added.length} NEUE anon-reachable PII-Policy(s):`)
    for (const k of added) console.error(`  + ${k}`)
    console.error('\nEine anon-SELECT-Policy mit einem OR-Zweig OHNE auth.uid() laesst true-anon (uid NULL)')
    console.error('echte Zeilen sehen — auf einer Tabelle mit Kontakt-PII (email/telefon/kennzeichen/…) ist')
    console.error('das ein AKTIVES Leck (RLS schuetzt nur ueber die qual). Vgl. gutachter_finder_anfragen')
    console.error('(Mig 20260716200848). Fix: den Zweig an auth.uid()/einen is_*()-Helper binden ODER den')
    console.error('anon-SELECT-Grant der Tabelle entziehen. Echter uid-Helper fehlt -> UID_GATE_TOKENS in')
    console.error('scripts/lib/anon-reachability-scan.mjs ergaenzen. Siehe AGENTS.md §Reachability-Gate.')
    process.exit(1)
  }
  if (removed.length > 0) {
    console.log(`[anon-reach] ${removed.length} Verletzer behoben — Baseline senken: \`npm run check:anon-reachability -- --update-baseline\``)
  }
  console.log(`[anon-reach] OK — ${current.length} bekannte anon-reachable PII-Policies (Baseline ${baseline.count}), 0 neue.`)
  process.exit(0)
}

// warn (default)
console.log(`[anon-reach] ${current.length} anon-reachable PII-Policies (Reachability-Ratchet). Policy: AGENTS.md §Reachability-Gate`)
for (const k of current) console.log(`  • ${k}`)
process.exit(0)
