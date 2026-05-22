// scripts/smoke-matelso-webhook.mjs
// Smoke: matelso-Webhook. Postet 4 Szenarien und verifiziert DB-Zeilen, self-cleaning.
// Run lokal:   npm run dev  (zweites Terminal), dann
//   node --env-file=.env.local scripts/smoke-matelso-webhook.mjs http://localhost:3000
// Run staging: node --env-file=.env.local scripts/smoke-matelso-webhook.mjs https://app.staging.claimondo.de
//   (Staging-Slot hat Basic-Auth -> BASIC_AUTH="user:pass" als Env mitgeben)
import { createClient } from '@supabase/supabase-js'

const base = process.argv[2] ?? 'http://localhost:3000'
const secret = process.env.MATELSO_WEBHOOK_SECRET
if (!secret) {
  console.error('MATELSO_WEBHOOK_SECRET fehlt in der Env. Abbruch.')
  process.exit(1)
}
const url = `${base}/api/webhooks/matelso/inbound?secret=${encodeURIComponent(secret)}`
const basicAuth = process.env.BASIC_AUTH
  ? { Authorization: 'Basic ' + Buffer.from(process.env.BASIC_AUTH).toString('base64') }
  : {}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function post(payload, { withSecret = true } = {}) {
  const target = withSecret ? url : `${base}/api/webhooks/matelso/inbound`
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...basicAuth },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function assert(cond, msg) {
  if (!cond) {
    console.error('  ✗ FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('  ✓', msg)
  }
}

const stamp = Date.now()
const answered = {
  call_id: `smoke-answered-${stamp}`,
  anrufer_nummer: `+4915100${String(stamp).slice(-6)}`,
  angerufene_nummer: '+4922125906530',
  anruf_status: 'answered',
  dauer_sekunden: '95',
  quelle: 'SMOKE Google Ads',
  zeitpunkt: new Date().toISOString(),
}

console.log(`\n== matelso smoke vs ${base} ==`)

console.log('\n[1] answered -> neuer Lead + Call-Record')
const r = await post(answered)
assert(r.status === 200 && r.json.ok, `200 ok (got ${r.status} ${JSON.stringify(r.json)})`)
assert(r.json.is_new_lead === true, 'is_new_lead=true')
assert(!!r.json.lead_id, 'lead_id gesetzt')

console.log('\n[2] retry (gleiche call_id) -> deduped, kein 2. Lead')
const r2 = await post(answered)
assert(r2.status === 200 && r2.json.deduped === true, `deduped=true (got ${JSON.stringify(r2.json)})`)
assert(r2.json.lead_id === r.json.lead_id, 'gleiche lead_id wie [1]')

console.log('\n[3] missed, unterdrueckte Nummer -> Call-Record, kein Lead')
const r3 = await post({ call_id: `smoke-missed-${stamp}`, anruf_status: 'no-answer', dauer_sekunden: '0', quelle: 'SMOKE direct' })
assert(r3.status === 200 && r3.json.ok, `200 ok (got ${r3.status})`)
assert(!r3.json.lead_id && !r3.json.fall_id, 'kein Lead/Fall (anonym)')

console.log('\n[4] falsches Secret -> 401')
const r4 = await post(answered, { withSecret: false })
assert(r4.status === 401, `401 (got ${r4.status})`)

console.log('\n[5] kaputtes JSON -> 400')
const r5 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...basicAuth }, body: '{not json' })
assert(r5.status === 400, `400 (got ${r5.status})`)

console.log('\n[DB] verifiziere matelso_calls-Zeilen')
const ids = [`matelso:smoke-answered-${stamp}`, `matelso:smoke-missed-${stamp}`]
const { data: rows } = await db.from('matelso_calls').select('external_call_id, status, lead_id, quelle').in('external_call_id', ids)
assert((rows ?? []).length === 2, `2 Call-Records gefunden (got ${(rows ?? []).length})`)

console.log('\n[cleanup] Smoke-Zeilen + Lead entfernen')
await db.from('matelso_calls').delete().in('external_call_id', ids)
if (r.json.lead_id) await db.from('leads').delete().eq('id', r.json.lead_id)

console.log(process.exitCode ? '\nSMOKE FAILED\n' : '\nSMOKE OK\n')
