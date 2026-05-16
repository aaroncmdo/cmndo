#!/usr/bin/env node
// CMM-54-Verify: beweist dass der GEFIXTE updateMietwagen-Schreibpfad
// (src/lib/mietwagen/actions.ts) schema-valide ist.
//
// Vorher (Bug): der Typ MietwagenUpdate enthielt nutzungsausfall_tage —
// von PR #1322 aus faelle gedroppt. MietwagenEditCard schickte das Feld
// immer mit -> jeder Mietwagen-Edit crasht mit PostgREST schema-cache-Error.
//
// Nachher (Fix): MietwagenUpdate hat nur noch die 6 mietwagen_*-Spalten;
// das manuelle nutzungsausfall_tage-Feld ist aus der Mietwagen-Domaene raus.
//
// Non-destruktiv: Update gegen nicht-existente id (0 Rows). PostgREST
// validiert die Spalten VOR dem Row-Match -> ein "schema cache"-Error
// wuerde trotzdem feuern. Der Call muss ohne Error zurueckkommen.
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

// updateMietwagen-Patch nach dem Fix: nur noch die 6 mietwagen_*-Spalten
const patch = {
  mietwagen_hat: false,
  mietwagen_seit_datum: null,
  mietwagen_limit_tage: null,
  mietwagen_limit_grund: null,
  mietwagen_vermieter: null,
  mietwagen_argumentations_puffer: 3,
}

const { error } = await svc.from('faelle').update(patch).eq('id', NONEXISTENT)
if (error) {
  console.log(`KAPUTT  updateMietwagen-Patch -> ${error.message}`)
  console.log('\nCMM-54-Fix NICHT verifiziert - siehe Fehler oben.')
  process.exitCode = 1
} else {
  console.log('OK      updateMietwagen-Patch -> alle 6 mietwagen_*-Spalten existieren')
  console.log('\nCMM-54-Fix verifiziert: der Schreibpfad ist schema-valide.')
}
// Kein process.exit() — das forcierte libuv-Teardown wirft auf Windows eine
// UV_HANDLE_CLOSING-Assertion, solange der undici-Keep-Alive-Socket noch
// schliesst. process.exitCode + natuerliches Event-Loop-Drain ist sauber.
