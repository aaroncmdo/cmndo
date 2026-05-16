#!/usr/bin/env node
// CMM-48 PR-E — Behavior-Smoke: beweist dass ein claims-Write von
// polizei_aktenzeichen vom Sync-Trigger auf faelle gespiegelt wird (der
// Mechanismus, auf den #1 gutachter/termine umgestellt wurde). Prueft
// zusaetzlich dass brn (#9) auf beiden Tabellen existiert. Non-destruktiv.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
let exit = 0

// brn (#9) — Spalten-Existenz auf beiden Tabellen.
for (const t of ['claims', 'faelle']) {
  const { error } = await svc.from(t).select('brn').limit(1)
  if (error) { console.error(`[FAIL] ${t}.brn: ${error.message}`); exit = 1 }
  else console.log(`[OK]   ${t}.brn existiert`)
}

// polizei_aktenzeichen (#1) — claims-Write → Trigger → faelle-Spiegelung.
const { data: rows, error: pErr } = await svc
  .from('faelle').select('id, claim_id, polizei_aktenzeichen')
  .not('claim_id', 'is', null).limit(1)
if (pErr || !rows?.length) { console.error('FEHLER pick:', pErr?.message); process.exit(1) }
const fall = rows[0]
const { data: cBefore } = await svc.from('claims')
  .select('polizei_aktenzeichen').eq('id', fall.claim_id).single()
const orig = cBefore.polizei_aktenzeichen
const TEST = '__SMOKE-CMM48-PRE__'

const { error: wErr } = await svc.from('claims')
  .update({ polizei_aktenzeichen: TEST }).eq('id', fall.claim_id)
if (wErr) { console.error(`[FAIL] claims-Write: ${wErr.message}`); process.exit(1) }

const { data: fAfter } = await svc.from('faelle')
  .select('polizei_aktenzeichen').eq('id', fall.id).single()
if (fAfter.polizei_aktenzeichen === TEST) {
  console.log(`[OK]   Trigger spiegelt polizei_aktenzeichen claims→faelle`)
} else {
  console.error(`[FAIL] faelle nicht gespiegelt: ${fAfter.polizei_aktenzeichen}`)
  exit = 1
}

// Restore.
await svc.from('claims').update({ polizei_aktenzeichen: orig }).eq('id', fall.claim_id)
const { data: fRestored } = await svc.from('faelle')
  .select('polizei_aktenzeichen').eq('id', fall.id).single()
if (fRestored.polizei_aktenzeichen === orig) console.log('[OK]   Restore bestaetigt')
else { console.error(`[FAIL] Restore inkonsistent: ${fRestored.polizei_aktenzeichen}`); exit = 1 }

console.log(exit === 0 ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(exit)
