#!/usr/bin/env node
// Claims-Spalten-Cap — Drift-Bremse (14.07.2026).
//
// Hintergrund: `authenticated` hatte einen TABELLEN-WEITEN SELECT-Grant auf claims. Zusammen
// mit der RLS-Policy claims__b1sel_au (geschaedigter_user_id = auth.uid(), sv_id, claim_party,
// is_kanzlei()) konnte damit jede Nicht-Staff-Rolle die internen Spalten ihres eigenen Falls
// per PostgREST direkt auslesen — interne_notizen, lead_preis_netto (Lead-Einkaufspreis),
// marketing_provision, kanzlei_honorar. Fix: Column-GRANT-Cap (Mig 20260714220455) +
// CASE-Maskierung in v_claim_base (Mig 20260714215721).
//
// Dieses Script haelt beide Schichten stabil. Es prueft via RPC audit_claims_column_grants():
//   LEAK        — interne Spalte wieder fuer authenticated/anon lesbar (Cap verloren)
//   NEUE_SPALTE — neue claims-Spalte ohne Grant und ohne Intern-Deklaration. Kehrseite des
//                 Caps: sie waere fuer User-Clients unsichtbar -> stiller PostgREST-Fehler.
//   VIEW_DRIFT  — interne Spalte laeuft wieder ROH durch v_claim_base (CASE-Maskierung weg;
//                 realistisch, weil v_claim_base oft per CREATE OR REPLACE neu geschrieben wird)
//
// Schliesst zugleich die Luecke, an der der personen-RLS-Bug (14.07.) durchrutschte:
// check-claim-table-rls.mjs prueft nur "sieht ein Nobody ZU VIEL" — nie "sieht die App
// ueberhaupt noch etwas" und nie die Spalten-Breite.
//
// Verwendung:  npm run check:claims-column-grants
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (RPC ist service_role-only).
//
// Retry-/PR-Gate-Muster identisch zu check-rls-function-grants.mjs (AAR-921): Grant-Drift
// entsteht nur durch Migrations-SQL -> in PR-Builds nur laufen, wenn supabase/** oder *.sql
// beruehrt wird (sonst saturiert der geteilte Prod-Pool bei vielen parallelen Sessions).

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

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

if (!prTouchesSql()) {
  console.log('⏭  PR beruehrt kein SQL/Migrations-File → Claims-Column-Grants-Check uebersprungen.')
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
    const { data, error } = await db.rpc('audit_claims_column_grants')
    if (!error) return data ?? []
    letzterFehler = error
    if (!istTransient(error)) break
  }
  throw new Error(`RPC audit_claims_column_grants fehlgeschlagen: ${letzterFehler?.message ?? letzterFehler}`)
}

const befunde = await audit()

if (befunde.length === 0) {
  console.log('✅ claims-Spalten-Cap intakt: keine internen Spalten lesbar, keine ungeklaerte neue Spalte, View-Maskierung sitzt.')
  process.exit(0)
}

const nach = (typ) => befunde.filter((b) => b.befund === typ)
console.error(`\n❌ claims-Spalten-Cap verletzt — ${befunde.length} Befund(e):\n`)

for (const [typ, titel] of [
  ['LEAK', '🔴 LEAK — interne Spalte ist wieder lesbar (Datenleck!)'],
  ['VIEW_DRIFT', '🔴 VIEW_DRIFT — Maskierung in v_claim_base verloren (Datenleck!)'],
  ['NEUE_SPALTE', '🟡 NEUE_SPALTE — ungeklaerte Spalte (waere fuer User-Clients unsichtbar)'],
]) {
  const treffer = nach(typ)
  if (treffer.length === 0) continue
  console.error(`${titel}`)
  for (const b of treffer) console.error(`   • ${b.spalte}: ${b.detail}`)
  console.error('')
}

console.error('Hintergrund: supabase/migrations/20260714220455_claims_column_grant_cap_interne_spalten.sql')
process.exit(1)
