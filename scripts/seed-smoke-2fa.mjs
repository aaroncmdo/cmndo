// Dediziertes 2FA-Challenge-Fixture-Konto seeden: smoke-2fa@claimondo.de
// (dispatch-Rolle, verifizierter TOTP-Faktor). ANDERS als seed-test-2fa.mjs
// (das die 5 GETEILTEN Aaron-Konten faktorisierte und damit manuelle Logins
// aussperrte -> 08.07.-Lockout) faktorisiert dieses Script NUR ein isoliertes
// Konto, das ausschliesslich die opt-in 2FA-/Trusted-Device-Smokes nutzen.
// Aaron loggt sich NIE als smoke-2fa ein -> kein Lockout. Darum KEIN
// ALLOW_2FA_SEED-Guard noetig (im Gegensatz zu seed-test-2fa.mjs).
//
// Idempotent: legt das Konto an falls fehlend, setzt Passwort + dispatch-Profil,
// raeumt bestehende TOTP-Faktoren weg und enrollt frisch -> gibt IMMER ein
// bekanntes Secret aus (deterministisch, auch bei Re-Run).
//
// Lauf (lokal, .env.local per CLAIMONDO_ENV_FILE; in CI stehen die envs direkt):
//   CLAIMONDO_ENV_FILE=/pfad/zu/.env.local node scripts/seed-smoke-2fa.mjs
// Gibt SMOKE_2FA_TOTP_SECRET=... aus (als CI-Repo-Secret setzen + fuer lokale
// Smoke-Laeufe als env). Schreibt zusaetzlich playwright/.auth/totp-secrets.json.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { computeTotp } from '../tests/e2e/lib/totp.mjs'

// Env laden: process.env hat Vorrang (CI); sonst optional .env.local parsen.
function loadEnv() {
  const need = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
  if (need.every((k) => process.env[k])) return
  const file = process.env.CLAIMONDO_ENV_FILE
  if (!file) return
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* best-effort */
  }
}
loadEnv()

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error(
    'Fehlend: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY\n' +
      '(lokal per CLAIMONDO_ENV_FILE=/pfad/.env.local).',
  )
  process.exit(1)
}

const EMAIL = 'smoke-2fa@claimondo.de'
const PW = process.env.SMOKE_2FA_PASSWORD ?? ''

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

// 1. Auth-User anlegen (oder existierenden finden) + Passwort deterministisch setzen.
let userId
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PW,
  email_confirm: true,
  user_metadata: { vorname: 'Smoke', nachname: '2FA' },
})
if (created?.user) {
  userId = created.user.id
  console.log(`[create] neuer Auth-User ${userId}`)
} else {
  const { data: prof } = await admin.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
  if (!prof?.id) {
    console.error(`[create] User existiert (${createErr?.message}) aber kein profiles-Eintrag -> id unauffindbar. Abbruch.`)
    process.exit(1)
  }
  userId = prof.id
  await admin.auth.admin.updateUserById(userId, { password: PW })
  console.log(`[create] existierender User ${userId} (Passwort neu gesetzt)`)
}

// 2. dispatch-Profil (Portal-Zugang) sicherstellen.
const { error: profErr } = await admin.from('profiles').upsert({
  id: userId,
  email: EMAIL,
  vorname: 'Smoke',
  nachname: '2FA',
  rolle: 'dispatch',
  aktiv: true,
  auth_provider: 'email',
  force_password_change: false,
})
if (profErr) {
  console.error(`[profile] upsert fehlgeschlagen: ${profErr.message}`)
  process.exit(1)
}

// 3. TOTP frisch enrollen (User-Session). Bestehende TOTP-Faktoren vorher weg
//    -> Secret ist immer bekannt (deterministischer Output).
const user = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const { error: signErr } = await user.auth.signInWithPassword({ email: EMAIL, password: PW })
if (signErr) {
  console.error(`[signin] ${signErr.message}`)
  process.exit(1)
}
const { data: list } = await user.auth.mfa.listFactors()
for (const f of (list?.all ?? []).filter((f) => f.factor_type === 'totp')) {
  await user.auth.mfa.unenroll({ factorId: f.id })
}
const { data: enr, error: enrErr } = await user.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'smoke-2fa' })
if (enrErr || !enr) {
  console.error(`[enroll] ${enrErr?.message}`)
  process.exit(1)
}
const secret = enr.totp.secret
const { data: ch, error: chErr } = await user.auth.mfa.challenge({ factorId: enr.id })
if (chErr || !ch) {
  console.error(`[challenge] ${chErr?.message}`)
  process.exit(1)
}
const code = computeTotp(secret)
const { error: vErr } = await user.auth.mfa.verify({ factorId: enr.id, challengeId: ch.id, code })
if (vErr) {
  console.error(`[verify] ${vErr.message} (TOTP=${code}) — Clock-Skew?`)
  process.exit(1)
}
await admin.from('profiles').update({ twofa_aktiviert: true }).eq('id', userId)
await user.auth.signOut()

// 4. Secret ausgeben + persistieren.
mkdirSync('playwright/.auth', { recursive: true })
const path = 'playwright/.auth/totp-secrets.json'
let existing = {}
try {
  existing = JSON.parse(readFileSync(path, 'utf8'))
} catch {
  /* first run */
}
writeFileSync(path, JSON.stringify({ ...existing, SMOKE_2FA_TOTP_SECRET: secret }, null, 2))

console.log(`\n[ok] ${EMAIL} (dispatch) hat jetzt einen verifizierten TOTP-Faktor.`)
console.log(`Geschrieben -> ${path}`)
console.log(`\nFuer lokale Smokes + CI-Repo-Secret:\n  SMOKE_2FA_TOTP_SECRET=${secret}`)
