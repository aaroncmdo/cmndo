// F3-Test-Infra (AAR-audit-2fa): TOTP-Faktoren fuer automatisierte interne
// Test-Accounts seeden, damit sie nach der 2FA-Pflicht (F3) im e2e/Smoke
// automatisiert durch den 2FA-Challenge kommen (kein SMS/Authenticator-App).
//
// Nutzt den regulaeren mfa.enroll-API-Flow (GoTrue managt das Vault-verschluesselte
// Secret; enroll gibt das base32-Secret zurueck). Der Login-Helper (fixtures.ts)
// rechnet daraus per computeTotp den Code.
//
// Lauf (einmalig, mutiert prod-Test-Accounts):
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//     node scripts/seed-test-2fa.mjs [email ...]
// Ohne email-Args: alle. Schreibt playwright/.auth/totp-secrets.json (gitignored)
// + druckt die Secrets fuer CI-Repo-Secrets.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { computeTotp } from '../tests/e2e/lib/totp.mjs'

// 2FA-Optional-Guard (08.07.2026): 2FA ist auf prod OPTIONAL geworden
// (Mandatory-Umkehr; istZweiFaktorPflicht = nur noch weicher Nudge).
// entscheideMfaGate fordert weiterhin JEDEN Account MIT Faktor -> TOTP-Seeding
// auf den Test-Accounts sperrt damit MANUELLE Logins (Aaron/Debugging) aus und
// stellt exakt den Lockout wieder her, der am 08.07. entfernt wurde
// (siehe memory reference-internal-test-account-logins). Darum nur noch mit
// explizitem Opt-in laufen lassen — und die Faktoren nach dem Seed via
// clearTwoFa/Admin-API wieder entfernen, sonst bleiben die Accounts gesperrt.
if (process.env.ALLOW_2FA_SEED !== '1') {
  console.error(
    '\nAbbruch: 2FA ist prod-optional — TOTP-Seeding sperrt manuelle Logins aus\n' +
      '  (recreated den Lockout vom 08.07.). Bewusst gewollt? Dann mit ALLOW_2FA_SEED=1\n' +
      '  laufen lassen und die Faktoren danach wieder entfernen.\n',
  )
  process.exit(0)
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY muessen gesetzt sein.')
  process.exit(1)
}

const ALL = [
  // test-admin: Passwort NUR aus CI-env (nicht <PASSWORT: GitHub-Secret>) — Aaron/CI setzt TEST_ADMIN_PASSWORD.
  { email: 'test-admin@claimondo.de', pw: process.env.TEST_ADMIN_PASSWORD ?? '', env: 'TEST_ADMIN_TOTP_SECRET' },
  { email: 'test-dispatch@claimondo.de', pw: process.env.TEST_DISPATCH_PASSWORD ?? '', env: 'TEST_DISPATCH_TOTP_SECRET' },
  // test-sv: starkes Passwort NUR aus env (Supabase lehnt <PASSWORT: GitHub-Secret> als schwach ab).
  { email: 'test-sv@claimondo.de', pw: process.env.TEST_SV_PASSWORD ?? '', env: 'TEST_SV_TOTP_SECRET' },
  // AAR-2fa-blast-radius: kanzlei + kundenbetreuer sind ebenfalls Pflicht-2FA-Rollen
  // (istZweiFaktorPflicht) und werden von e2e genutzt (golden-path-prod, onboarding-
  // pflichtdok) — nach #3745 sonst im Enroll-Wall. Passwoerter aus CI-env.
  { email: 'test-kanzlei@claimondo.de', pw: process.env.TEST_KANZLEI_PASSWORD ?? '', env: 'TEST_KANZLEI_TOTP_SECRET' },
  { email: 'test-kb@claimondo.de', pw: process.env.TEST_KB_PASSWORD ?? '', env: 'TEST_KB_TOTP_SECRET' },
]
const filter = process.argv.slice(2)
const accounts = filter.length ? ALL.filter((a) => filter.includes(a.email)) : ALL

const results = {}
for (const acc of accounts) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: signErr } = await sb.auth.signInWithPassword({ email: acc.email, password: acc.pw })
  if (signErr) {
    console.error(`[${acc.email}] Login fehlgeschlagen: ${signErr.message}`)
    continue
  }

  const { data: list } = await sb.auth.mfa.listFactors()
  const existing = (list?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified')
  if (existing) {
    console.log(`[${acc.email}] hat bereits verifizierten TOTP-Faktor — SKIP (Secret aus env; Re-Seed: vorher clearTwoFa).`)
    await sb.auth.signOut()
    continue
  }
  // stale unverifizierte TOTP-Faktoren wegraeumen (abgebrochene Enrolls)
  for (const f of (list?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
    await sb.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data: enr, error: enrErr } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e-totp' })
  if (enrErr || !enr) {
    console.error(`[${acc.email}] enroll: ${enrErr?.message}`)
    await sb.auth.signOut()
    continue
  }
  const secret = enr.totp.secret
  const { data: ch, error: chErr } = await sb.auth.mfa.challenge({ factorId: enr.id })
  if (chErr || !ch) {
    console.error(`[${acc.email}] challenge: ${chErr?.message}`)
    await sb.auth.signOut()
    continue
  }
  const code = computeTotp(secret)
  const { error: vErr } = await sb.auth.mfa.verify({ factorId: enr.id, challengeId: ch.id, code })
  if (vErr) {
    console.error(`[${acc.email}] verify: ${vErr.message} (TOTP=${code}) — Clock-Skew?`)
    await sb.auth.signOut()
    continue
  }

  results[acc.env] = secret
  console.log(`[${acc.email}] OK — verifiziert mit TOTP=${code}. ${acc.env} erfasst.`)
  await sb.auth.signOut()
}

if (Object.keys(results).length) {
  mkdirSync('playwright/.auth', { recursive: true })
  const path = 'playwright/.auth/totp-secrets.json'
  let existing = {}
  try {
    existing = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    /* first run */
  }
  writeFileSync(path, JSON.stringify({ ...existing, ...results }, null, 2))
  console.log(`\nGeschrieben -> ${path}`)
  console.log('Fuer CI als Repo-Secrets setzen:')
  for (const [k, v] of Object.entries(results)) console.log(`  ${k}=${v}`)
}
