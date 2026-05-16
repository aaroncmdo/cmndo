#!/usr/bin/env node
// CMM-58 — Behavior-Smoke: beweist dass der Trigger
// sync_gutachter_termine_claim_id claim_id aus fall_id ableitet.
// Setzt bei einer fall_id=NULL-Termin-Row testweise ein fall_id mit Claim →
// erwartet, dass der Trigger claim_id automatisch fuellt. Non-destruktiv.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
let exit = 0

const { data: all, error } = await svc
  .from('gutachter_termine').select('id, fall_id, claim_id')
if (error) { console.error('FEHLER:', error.message); process.exit(1) }

// Quelle: eine Row mit fall_id + claim_id (backfilled).
const src = all.find((r) => r.fall_id && r.claim_id)
// Testobjekt: eine Row mit fall_id=NULL.
const target = all.find((r) => !r.fall_id && !r.claim_id)
if (!src || !target) { console.error('FEHLER: kein passendes Row-Paar'); process.exit(1) }
console.log(`Quelle: fall_id=${src.fall_id} → claim_id=${src.claim_id}`)
console.log(`Testrow: ${target.id} (fall_id=NULL)`)

// 1. fall_id auf der Testrow setzen → Trigger soll claim_id ableiten.
const { error: wErr } = await svc
  .from('gutachter_termine').update({ fall_id: src.fall_id }).eq('id', target.id)
if (wErr) { console.error(`[FAIL] update: ${wErr.message}`); process.exit(1) }

const { data: after } = await svc
  .from('gutachter_termine').select('claim_id').eq('id', target.id).single()
if (after.claim_id === src.claim_id) {
  console.log(`[OK]   Trigger hat claim_id abgeleitet: ${after.claim_id}`)
} else {
  console.error(`[FAIL] claim_id nicht abgeleitet: erwartet ${src.claim_id}, ist ${after.claim_id}`)
  exit = 1
}

// 2. Restore — fall_id + claim_id zuruecksetzen.
const { error: rErr } = await svc
  .from('gutachter_termine').update({ fall_id: null, claim_id: null }).eq('id', target.id)
if (rErr) { console.error(`[FAIL] Restore: ${rErr.message} — Row ${target.id} pruefen`); process.exit(1) }
const { data: restored } = await svc
  .from('gutachter_termine').select('fall_id, claim_id').eq('id', target.id).single()
if (!restored.fall_id && !restored.claim_id) console.log('[OK]   Restore bestaetigt')
else { console.error(`[FAIL] Restore inkonsistent: ${JSON.stringify(restored)}`); exit = 1 }

console.log(exit === 0 ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(exit)
