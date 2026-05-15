#!/usr/bin/env node
// AAR-925: Diff-Report zwischen System A (`gutachter_monatsabrechnungen`)
// und System B (`abrechnungen` mit empfaenger_typ='sv').
//
// Verwendung:
//   node scripts/diff-abrechnung-crons.mjs [--monat YYYY-MM]
//
// Default: aktueller Monat. Mit --monat 2026-04 ein spezifischer Monat.
//
// Read-only. Zeigt:
//   - Nur in System A (Drift, Daten gefangen in alter Tabelle)
//   - Nur in System B (Daten korrekt migriert, ist OK)
//   - In beiden (Beleg dass Shadow-Mode konsistent ist)
//
// ENV-Vars: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY aus .env.local

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadEnv() {
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Fehlt NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const monatArg = args.includes('--monat') ? args[args.indexOf('--monat') + 1] : null
const now = new Date()
const monat = monatArg ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const [jahr, mo] = monat.split('-').map(Number)
const monthStart = new Date(jahr, mo - 1, 1).toISOString().slice(0, 10)
const monthEnd = new Date(jahr, mo, 0).toISOString().slice(0, 10)

const db = createClient(url, key, { auth: { persistSession: false } })

console.log(`\n→ Vergleiche Cron-Output fuer Monat ${monat} (${monthStart} bis ${monthEnd})\n`)

// System A
const { data: systemA } = await db
  .from('gutachter_monatsabrechnungen')
  .select('id, sv_id, monat, brutto_endbetrag, anzahl_faelle')
  .gte('monat', monthStart)
  .lte('monat', monthEnd)

// System B
const { data: systemB } = await db
  .from('abrechnungen')
  .select('id, empfaenger_id, summe_brutto, abrechnungs_nr, positionen')
  .eq('empfaenger_typ', 'sv')
  .gte('abrechnungs_zeitraum_start', monthStart)
  .lte('abrechnungs_zeitraum_ende', monthEnd)

const aBySv = new Map((systemA ?? []).map(a => [a.sv_id, a]))
const bBySv = new Map((systemB ?? []).map(b => [b.empfaenger_id, b]))

const onlyA = []
const onlyB = []
const both = []

for (const [svId, a] of aBySv) {
  const b = bBySv.get(svId)
  if (!b) onlyA.push({ sv_id: svId, system_a_brutto: a.brutto_endbetrag, system_a_faelle: a.anzahl_faelle })
  else both.push({
    sv_id: svId,
    a_brutto: Number(a.brutto_endbetrag ?? 0),
    b_brutto: Number(b.summe_brutto ?? 0),
    drift: Math.abs(Number(a.brutto_endbetrag ?? 0) - Number(b.summe_brutto ?? 0)),
    a_faelle: a.anzahl_faelle,
    b_faelle: Array.isArray(b.positionen) ? b.positionen.length : 0,
  })
}
for (const [svId, b] of bBySv) {
  if (!aBySv.has(svId)) onlyB.push({ sv_id: svId, system_b_brutto: b.summe_brutto, abrechnungs_nr: b.abrechnungs_nr })
}

console.log(`System A Total : ${systemA?.length ?? 0} Rows`)
console.log(`System B Total : ${systemB?.length ?? 0} Rows`)
console.log(`Nur in A       : ${onlyA.length}`)
console.log(`Nur in B       : ${onlyB.length}`)
console.log(`In beiden      : ${both.length}\n`)

if (onlyA.length > 0) {
  console.log('⚠ Nur in System A (Drift — Aaron sollte schauen):')
  for (const e of onlyA) console.log(`  sv=${e.sv_id} brutto=${e.system_a_brutto} faelle=${e.system_a_faelle}`)
  console.log()
}

if (both.length > 0) {
  const driftRows = both.filter(b => b.drift > 0.01)
  if (driftRows.length > 0) {
    console.log(`⚠ Betragsdifferenz zwischen System A und B in ${driftRows.length} Rows:`)
    for (const e of driftRows) console.log(`  sv=${e.sv_id} a_brutto=${e.a_brutto} b_brutto=${e.b_brutto} diff=${e.drift.toFixed(2)}`)
    console.log()
  } else {
    console.log('✓ Alle ueberlappenden Eintraege haben gleiche Brutto-Summen.\n')
  }
}

if (onlyA.length === 0 && both.every(b => b.drift <= 0.01)) {
  console.log('✓ Shadow-Mode-OK: System B faengt alles ab, kein Drift. Bereit fuer System A Abschalten.')
  process.exit(0)
} else {
  console.log('✗ Noch nicht bereit zum Abschalten. Erst Drift adressieren.')
  process.exit(1)
}
