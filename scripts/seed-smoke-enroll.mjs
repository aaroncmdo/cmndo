// smoke-enroll@claimondo.de (dispatch, FAKTORFREI) anlegen/zuruecksetzen — das
// dedizierte Konto fuer den 2fa-enroll-smoke (simuliert einen frisch registrierten
// User, der seine 2FA erst einrichtet). Idempotent: create-or-reset + alle Faktoren
// weg -> faktorfreier Startzustand.
//
// VOR jedem 2fa-enroll-smoke-Lauf ausfuehren: der Test enrollt einen Faktor, dieses
// Script setzt den Account wieder faktorfrei. Isoliert von den 5 geteilten Test-
// Accounts + von smoke-2fa@ (das bewusst faktorisiert ist) -> KEIN Lockout-Risiko.
//
// Lauf (lokal .env.local via CLAIMONDO_ENV_FILE; in CI stehen die envs direkt):
//   CLAIMONDO_ENV_FILE=/pfad/zu/.env.local node scripts/seed-smoke-enroll.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function loadEnv() {
  const need = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('Fehlend: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (lokal per CLAIMONDO_ENV_FILE).')
  process.exit(1)
}

const EMAIL = 'smoke-enroll@claimondo.de'
const PW = process.env.SMOKE_ENROLL_PASSWORD ?? ''

// Ohne Passwort NICHT weiterlaufen. Seit der Klartext-Bereinigung (#5797) ist der
// Fallback leer statt hartkodiert — und ein leeres `password` ginge ungeprueft in
// createUser/updateUserById. Beide Aufrufe lasen ihren Fehler bisher nicht aus, das
// Script meldete also „Passwort neu gesetzt", ohne dass eines gesetzt wurde. Genau
// diese Kombination (leeres Secret + stiller Auth-Write) macht aus einem fehlenden
// Secret einen beschaedigten Account.
if (!PW) {
  console.error(
    'Fehlend: SMOKE_ENROLL_PASSWORD. Ohne Passwort wuerde dieses Script dem Konto ' +
      'smoke-enroll@ ein LEERES Passwort zuweisen — Abbruch. In CI als GitHub-Secret ' +
      'hinterlegen und im Workflow durchreichen, lokal in .env.local setzen.',
  )
  process.exit(1)
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

let userId
const { data: created } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PW,
  email_confirm: true,
  user_metadata: { vorname: 'Smoke', nachname: 'Enroll' },
})
if (created?.user) {
  userId = created.user.id
  console.log(`[create] neuer User ${userId}`)
} else {
  const { data: prof } = await admin.from('profiles').select('id').eq('email', EMAIL).maybeSingle()
  if (!prof?.id) {
    console.error('[create] User existiert aber kein profiles-Eintrag -> id unauffindbar. Abbruch.')
    process.exit(1)
  }
  userId = prof.id
  // Fehler auslesen: `updateUserById` wirft nicht. Ohne die Pruefung meldete das
  // Script auch dann Erfolg, wenn GoTrue das Passwort abgelehnt hat — und der
  // nachfolgende Smoke scheitert dann am Login statt an der Ursache.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password: PW })
  if (pwErr) {
    console.error(`[reset] Passwort konnte nicht gesetzt werden: ${pwErr.message}`)
    process.exit(1)
  }
  console.log(`[reset] existierender User ${userId} (Passwort neu gesetzt)`)
}

const { error: profErr } = await admin.from('profiles').upsert({
  id: userId,
  email: EMAIL,
  vorname: 'Smoke',
  nachname: 'Enroll',
  rolle: 'dispatch',
  aktiv: true,
  auth_provider: 'email',
  force_password_change: false,
})
if (profErr) {
  console.error(`[profile] upsert fehlgeschlagen: ${profErr.message}`)
  process.exit(1)
}

// FAKTORFREI (frisch-registriert-Zustand)
const { data: list } = await admin.auth.admin.mfa.listFactors({ userId })
for (const f of list?.factors ?? []) {
  await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId })
}
await admin.from('profiles').update({ twofa_aktiviert: false, twofa_telefon: null }).eq('id', userId)

const after = await admin.auth.admin.mfa.listFactors({ userId })
console.log(`smoke-enroll@ bereit (dispatch, ${(after.data?.factors ?? []).length} Faktoren)`)
