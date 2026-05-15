#!/usr/bin/env node
// CMM-48-Verify: beweist empirisch ob faelle-Writes auf vermeintlich
// gedroppte Spalten crashen. Non-destruktiv — .eq('id', <nonexistent uuid>)
// matcht keine Row, aber PostgREST validiert die Spalten-Namen VOR dem
// Row-Match → ein „schema cache"-Error beweist dass die Spalte weg ist.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NONEXISTENT = '00000000-0000-0000-0000-000000000000'

// Jedes Element = ein behaupteter kaputter Write. payload = exakt die
// Spalten die der reale Code-Pfad schreibt.
const probes = [
  {
    name: 'ocr-gutachten/route.ts:145 — Gutachten-OCR-Update',
    payload: { restwert: 1, wiederbeschaffungswert: 1, nutzungsausfall_tage: 1, totalschaden: false },
  },
  {
    name: 'mietwagen/actions.ts:59 — updateMietwagen patch',
    payload: { nutzungsausfall_tage: 1 },
  },
  {
    name: 'KONTROLLE — Write auf existierende Spalte (muss OK sein)',
    payload: { updated_at: new Date().toISOString() },
  },
]

let anyBroken = false
for (const p of probes) {
  const { error } = await svc.from('faelle').update(p.payload).eq('id', NONEXISTENT)
  if (error) {
    const isSchema = /column|schema cache|does not exist/i.test(error.message)
    console.log(`${isSchema ? '💥 KAPUTT' : '⚠ FEHLER'}  ${p.name}`)
    console.log(`         → ${error.message}`)
    if (isSchema) anyBroken = true
  } else {
    console.log(`✓ OK      ${p.name} (Spalten existieren, Update valide)`)
  }
}
console.log(`\n${anyBroken ? 'Mindestens ein Write ist kaputt — Audit-§0 bestätigt.' : 'Keine kaputten Writes — Annahme war falsch.'}`)
process.exit(anyBroken ? 1 : 0)
