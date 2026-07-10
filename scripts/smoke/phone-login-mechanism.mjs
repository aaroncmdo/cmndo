// Mechanismus-Smoke fuer den Kunde-Telefon-Login (AAR-phone-login).
// Beweist gegen die REALE Supabase-Infra: (1) admin.updateUserById({phone,
// phone_confirm:true}) persistiert nach auth.users.phone; (2) auth.users.phone
// ist UNIQUE -> zweites Konto mit gleicher Nummer scheitert, erstes behaelt sie
// (fail-safe, klaut nie). Legt zwei Wegwerf-Auth-User an + raeumt sie wieder ab.
// NUR gegen Test-/Staging-Projekte oder bewusst gegen Prod mit Wegwerf-Usern.
//
// Run (env-file explizit, kein Default -> kein Versehen):
//   CLAIMONDO_ENV_FILE=/abs/pfad/zu/.env.local node scripts/smoke/phone-login-mechanism.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const envFile = process.env.CLAIMONDO_ENV_FILE
if (!envFile) {
  console.error('FAIL: CLAIMONDO_ENV_FILE (absoluter Pfad zur .env.local) ist Pflicht.')
  process.exit(1)
}
const env = loadEnv(envFile)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der env-Datei.')
  process.exit(1)
}
console.log(`[phone-login-smoke] Ziel-Projekt: ${url}`)

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// Eindeutige Test-Nummer + Emails je Lauf aus EINEM Zeitstempel (kein 1ms-Skew).
const stamp = Date.now()
const suffix = String(stamp).slice(-7)
const TEST_PHONE = `+49151${suffix}` // deutsches Mobil-Muster
const digits = (s) => (s || '').replace(/\D/g, '')
const emailA = `smoke-phone-a-${stamp}@claimondo.test`
const emailB = `smoke-phone-b-${stamp}@claimondo.test`

let idA = null
let idB = null
let failed = false
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} — ${msg}`); if (!cond) failed = true }

try {
  // 1. Zwei Wegwerf-User anlegen (email-only, wie createKundeAccount).
  const { data: a, error: aErr } = await admin.auth.admin.createUser({ email: emailA, email_confirm: true })
  if (aErr || !a?.user) throw new Error(`createUser A: ${aErr?.message}`)
  idA = a.user.id
  const { data: b, error: bErr } = await admin.auth.admin.createUser({ email: emailB, email_confirm: true })
  if (bErr || !b?.user) throw new Error(`createUser B: ${bErr?.message}`)
  idB = b.user.id

  // 2. A bekommt die Nummer -> muss greifen + persistent sein.
  const { error: setA } = await admin.auth.admin.updateUserById(idA, { phone: TEST_PHONE, phone_confirm: true })
  check(!setA, `A: updateUserById(phone) ohne Fehler (${setA?.message ?? 'ok'})`)
  const { data: readA } = await admin.auth.admin.getUserById(idA)
  check(digits(readA?.user?.phone) === digits(TEST_PHONE), `A: auth.users.phone == ${TEST_PHONE} (ist: ${readA?.user?.phone ?? 'leer'})`)

  // 3. B bekommt DIESELBE Nummer -> UNIQUE-Kollision, muss fehlschlagen.
  const { error: setB } = await admin.auth.admin.updateUserById(idB, { phone: TEST_PHONE, phone_confirm: true })
  check(!!setB, `B: Kollision schlaegt fehl (erwartet Fehler; ist: ${setB?.message ?? 'KEIN Fehler!'})`)
  const { data: readB } = await admin.auth.admin.getUserById(idB)
  check(!digits(readB?.user?.phone), `B: hat KEINE Nummer (klaut nicht; ist: ${readB?.user?.phone ?? 'leer'})`)

  // 4. A behaelt die Nummer (nicht gestohlen).
  const { data: reReadA } = await admin.auth.admin.getUserById(idA)
  check(digits(reReadA?.user?.phone) === digits(TEST_PHONE), `A: behaelt die Nummer nach der B-Kollision`)
} catch (err) {
  console.error('FAIL (Exception):', err.message)
  failed = true
} finally {
  // 5. Aufraeumen — immer.
  if (idA) await admin.auth.admin.deleteUser(idA).catch(() => {})
  if (idB) await admin.auth.admin.deleteUser(idB).catch(() => {})
  console.log('[phone-login-smoke] Wegwerf-User entfernt.')
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS')
process.exit(failed ? 1 : 0)
