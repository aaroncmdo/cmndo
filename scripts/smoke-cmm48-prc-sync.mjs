#!/usr/bin/env node
// CMM-48 PR-C — Behavior-Smoke: beweist dass ein claims-Write von
// kanzlei_uebergeben_am / abgeschlossen_am vom DB-Trigger sync_claims_to_faelle
// auf faelle gespiegelt wird (genau der Mechanismus, auf den PR-C den Writer
// umstellt). Non-destruktiv: Originalwerte werden am Ende wiederhergestellt.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ENV_PATH = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local'
const env = readFileSync(ENV_PATH, 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const svc = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

const log = (...a) => console.log(...a)
let exitCode = 0

// 1. Einen Fall mit claim_id picken.
const { data: faelle, error: pickErr } = await svc
  .from('faelle')
  .select('id, claim_id, kanzlei_uebergeben_am, abgeschlossen_am')
  .not('claim_id', 'is', null)
  .limit(1)
if (pickErr || !faelle?.length) {
  console.error('FEHLER: kein Fall mit claim_id gefunden:', pickErr?.message)
  process.exit(1)
}
const fall = faelle[0]
const claimId = fall.claim_id
log(`Testfall: ${fall.id}  claim_id=${claimId}`)

// 2. Original-Claim-Werte sichern.
const { data: claimBefore } = await svc
  .from('claims')
  .select('kanzlei_uebergeben_am, abgeschlossen_am')
  .eq('id', claimId)
  .single()
const origKanzlei = claimBefore.kanzlei_uebergeben_am
const origAbg = claimBefore.abgeschlossen_am
log(`Original claims: kanzlei=${origKanzlei}  abgeschlossen=${origAbg}`)

// 3. Test-Timestamp auf claims schreiben (= was PR-C jetzt tut).
const TEST_TS = '2099-01-02T03:04:05.000Z'
const { error: wErr } = await svc
  .from('claims')
  .update({ kanzlei_uebergeben_am: TEST_TS })
  .eq('id', claimId)
if (wErr) {
  console.error('FEHLER beim claims-Write:', wErr.message)
  process.exit(1)
}

// 4. faelle zuruecklesen — Trigger muss gespiegelt haben.
const { data: faelleAfter } = await svc
  .from('faelle')
  .select('kanzlei_uebergeben_am')
  .eq('id', fall.id)
  .single()
const mirrored = faelleAfter.kanzlei_uebergeben_am
// timestamptz: Postgres liefert +00:00, JS-ISO .000Z — auf Date-Ebene vergleichen.
const sameTs = (a, b) => (a == null && b == null) || (a != null && b != null && new Date(a).getTime() === new Date(b).getTime())
if (sameTs(mirrored, TEST_TS)) {
  log(`[OK]   Trigger sync_claims_to_faelle hat gespiegelt: faelle.kanzlei_uebergeben_am=${mirrored}`)
} else {
  console.error(`[FAIL] faelle nicht gespiegelt: erwartet ${TEST_TS}, ist ${mirrored}`)
  exitCode = 1
}

// 5. Originalwert wiederherstellen.
const { error: rErr } = await svc
  .from('claims')
  .update({ kanzlei_uebergeben_am: origKanzlei })
  .eq('id', claimId)
if (rErr) {
  console.error(`[FAIL] Restore fehlgeschlagen — claim ${claimId} manuell pruefen:`, rErr.message)
  process.exit(1)
}
const { data: claimRestored } = await svc
  .from('claims')
  .select('kanzlei_uebergeben_am')
  .eq('id', claimId)
  .single()
const { data: faelleRestored } = await svc
  .from('faelle')
  .select('kanzlei_uebergeben_am')
  .eq('id', fall.id)
  .single()
if (sameTs(claimRestored.kanzlei_uebergeben_am, origKanzlei) && sameTs(faelleRestored.kanzlei_uebergeben_am, origKanzlei)) {
  log(`[OK]   Restore bestaetigt: claims + faelle wieder auf ${origKanzlei}`)
} else {
  console.error(`[FAIL] Restore inkonsistent: claim=${claimRestored.kanzlei_uebergeben_am} faelle=${faelleRestored.kanzlei_uebergeben_am}`)
  exitCode = 1
}

log(exitCode === 0 ? '\nSMOKE GRUEN' : '\nSMOKE ROT')
process.exit(exitCode)
