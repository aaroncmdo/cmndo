#!/usr/bin/env node
// CMM-48-Diagnose: prüft welche der von PR #1320 hinzugefügten DIRECT_FIELDS-
// Spalten wirklich auf `faelle` existieren. Nutzt service-role + supabase-js.
//
// Run: node scripts/probe-faelle-columns.mjs

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local')
  process.exit(2)
}

const svc = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const candidates = [
  'hat_haftpflicht',
  'schuldfrage',
  'schaden_sichtbar',
  'fahrerflucht',
  'nutzungsausfall',
  'schadentyp',
  'bkat_unfallart',
  'fahrzeugschaden_beschreibung',
  'polizeibericht_status',
  'zb1_status',
  'unfall_uhrzeit',
  'unfallort_lat',
  'unfallort_lng',
  'auslandskennzeichen',
  // Sanity-Check: existing column (sollte ✓ liefern)
  'id',
  'kundenbetreuer_id',
]

console.log(`[probe] Test ${candidates.length} Kandidaten gegen faelle.\n`)

const results = []
for (const col of candidates) {
  const { error } = await svc.from('faelle').select(col).limit(1)
  if (error) {
    if (error.message.includes('column') || error.message.includes('schema cache')) {
      results.push({ col, exists: false, reason: error.message.slice(0, 100) })
    } else {
      results.push({ col, exists: '?', reason: error.message.slice(0, 100) })
    }
  } else {
    results.push({ col, exists: true })
  }
}

console.log('Ergebnis:')
for (const r of results) {
  const mark = r.exists === true ? '✓' : r.exists === false ? '✗' : '?'
  console.log(`  ${mark} ${r.col}${r.reason ? ` — ${r.reason}` : ''}`)
}

const missing = results.filter((r) => r.exists === false).map((r) => r.col)
console.log(`\nFehlend auf faelle: ${missing.length === 0 ? '(keine)' : missing.join(', ')}`)
