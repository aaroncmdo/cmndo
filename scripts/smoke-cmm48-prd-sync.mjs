#!/usr/bin/env node
// CMM-48 PR-D — Behavior-Smoke: beweist dass claims-Writes der PR-D-Duplikat-
// Spalten vom Sync-Trigger auf faelle gespiegelt werden (der Mechanismus, auf
// den updateFallField + saveKanzleiAnsprechpartner umgestellt wurden).
// Getestet: gegner_versicherungsnummer (updateFallField-Pfad) +
// kanzlei_ansprechpartner_name (kanzlei-paket-Pfad). Non-destruktiv.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
let exit = 0

const { data: rows, error: pErr } = await svc
  .from('faelle').select('id, claim_id').not('claim_id', 'is', null).limit(1)
if (pErr || !rows?.length) { console.error('FEHLER pick:', pErr?.message); process.exit(1) }
const fall = rows[0]
console.log(`Testfall: ${fall.id}  claim_id=${fall.claim_id}`)

for (const col of ['gegner_versicherungsnummer', 'kanzlei_ansprechpartner_name']) {
  const { data: cBefore } = await svc.from('claims').select(col).eq('id', fall.claim_id).single()
  const orig = cBefore[col]
  const TEST = `__SMOKE-PRD-${col}__`

  const { error: wErr } = await svc.from('claims').update({ [col]: TEST }).eq('id', fall.claim_id)
  if (wErr) { console.error(`[FAIL] claims-Write ${col}: ${wErr.message}`); exit = 1; continue }

  const { data: fAfter } = await svc.from('faelle').select(col).eq('id', fall.id).single()
  if (fAfter[col] === TEST) console.log(`[OK]   ${col}: Trigger spiegelt claims→faelle`)
  else { console.error(`[FAIL] ${col} nicht gespiegelt: ${fAfter[col]}`); exit = 1 }

  await svc.from('claims').update({ [col]: orig }).eq('id', fall.claim_id)
  const { data: fR } = await svc.from('faelle').select(col).eq('id', fall.id).single()
  if (fR[col] === orig) console.log(`[OK]   ${col}: Restore bestaetigt`)
  else { console.error(`[FAIL] ${col} Restore inkonsistent: ${fR[col]}`); exit = 1 }
}

console.log(exit === 0 ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(exit)
