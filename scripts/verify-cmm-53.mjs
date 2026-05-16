#!/usr/bin/env node
// CMM-53-Verify: beweist dass der GEFIXTE Schreibpfad von
// src/app/api/ocr-gutachten/route.ts schema-valide ist.
//
// Vorher (Bug): ein einziger faelle-Update inkl. der von PR #1322 gedroppten
// Spalten restwert/wiederbeschaffungswert/nutzungsausfall_tage/totalschaden
// -> PostgREST schema-cache-Error, der gesamte Write scheitert (auch die
// legitimen Felder).
//
// Nachher (Fix): faelle-Update nur noch mit existierenden OCR-Spalten + die
// 4 G-Werte via RPC apply_gutachten_ocr in die gutachten-Sub-Tabelle.
//
// Non-destruktiv: faelle-Update gegen nicht-existente id (0 Rows), RPC gegen
// nicht-existente claim_id (apply_gutachten_ocr macht dann ein early RETURN).
// PostgREST validiert Spalten/Argumente VOR dem Row-Match -> ein "schema
// cache"-Error wuerde trotzdem feuern. Beide Calls muessen ohne Error
// zurueckkommen.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(root, '.env.local'), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NONEXISTENT = '00000000-0000-0000-0000-000000000000'
let failed = false

// 1) faelle-Update mit dem gefixten Spalten-Set (nur noch existierende Spalten)
const faellePayload = {
  ocr_extrahiert_am: new Date().toISOString(),
  ocr_rohdaten: { text_length: 0, extracted: {} },
  schadens_hoehe_netto: 1,
  nutzungsausfall_tagessatz: 1,
  reparaturdauer_tage: 1,
  gutachter_honorar: 1,
  fin_vin: 'WVWZZZ1KZAW000000',
}
{
  const { error } = await svc
    .from('faelle')
    .update(faellePayload)
    .eq('id', NONEXISTENT)
    .select('claim_id')
  if (error) {
    console.log(`KAPUTT  faelle-Update (Fix-Spalten) -> ${error.message}`)
    failed = true
  } else {
    console.log('OK      faelle-Update -> alle 7 OCR-Spalten existieren')
  }
}

// 2) RPC apply_gutachten_ocr mit den 4 G-Werten -> gutachten-Sub-Tabelle
{
  const { error } = await svc.rpc('apply_gutachten_ocr', {
    p_claim_id: NONEXISTENT,
    p_values: {
      restwert: 1,
      wiederbeschaffungswert: 1,
      nutzungsausfall_tage: 1,
      totalschaden: false,
    },
  })
  if (error) {
    console.log(`KAPUTT  apply_gutachten_ocr (G-Werte) -> ${error.message}`)
    failed = true
  } else {
    console.log('OK      apply_gutachten_ocr akzeptiert das G-Werte-Payload')
  }
}

console.log(
  `\n${failed ? 'CMM-53-Fix NICHT verifiziert - siehe Fehler oben.' : 'CMM-53-Fix verifiziert: beide Schreibpfade sind schema-valide.'}`,
)
process.exit(failed ? 1 : 0)
