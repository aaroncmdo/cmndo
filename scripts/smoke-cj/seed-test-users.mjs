// Legt 3 Test-User für den CJ-Smoke an (Kunde, SV, Admin). Idempotent:
// wenn bereits vorhanden, werden Flags nachgezogen. Schreibt UUIDs nach .env.test.
//
// Usage:  node scripts/smoke-cj/seed-test-users.mjs
//
// Verwendet SERVICE_ROLE_KEY → bypassed RLS. Setzt twofa_aktiviert=false +
// twofa_email_aktiviert=false + force_password_change=false damit Playwright
// ohne 2FA-Flow durchkommt (siehe e2e_test_users-Memory).

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

loadEnv({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORT = 'Test1234!'  // Konvention aus e2e_test_users-Memory

const TEST_USERS = [
  {
    label: 'kunde',
    email: 'smoke-kunde@claimondo.test',
    rolle: 'kunde',
    anzeigename: 'Smoke Kunde',
    extra: {},
  },
  {
    label: 'sv',
    email: 'smoke-sv@claimondo.test',
    rolle: 'sachverstaendiger',
    anzeigename: 'Smoke SV',
    extra: { verifiziert: true },
  },
  {
    label: 'admin',
    email: 'smoke-admin@claimondo.test',
    rolle: 'admin',
    anzeigename: 'Smoke Admin',
    extra: {},
  },
]

async function findUserByEmailViaProfiles(email) {
  // Workaround: über profiles + auth.users JOIN geht nicht direkt — wir nutzen
  // den eingebauten getUserByEmail via getUser-API. Fallback: profile-Lookup.
  // Erste Variante: signInWithPassword als billigster Existenz-Check.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORT })
  if (data?.user) return { id: data.user.id, email: data.user.email }
  // Falsches Passwort = User existiert aber wir kennen die ID nicht über diesen Weg
  if (error?.message?.toLowerCase().includes('invalid login credentials')) return 'exists-unknown-id'
  return null
}

async function ensureUser({ label, email, rolle, anzeigename, extra }) {
  let user = null
  const existsCheck = await findUserByEmailViaProfiles(email)
  if (existsCheck && existsCheck !== 'exists-unknown-id') {
    user = existsCheck
    console.log(`  · ${label}: existiert (${user.id})`)
  } else {
    // createUser versuchen — bei Duplikat-Error wir geben auf
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORT,
      email_confirm: true,
      user_metadata: { rolle, anzeigename },
    })
    if (error) {
      if (String(error.message).toLowerCase().includes('already')) {
        console.error(`  ✗ ${label}: User existiert aber ID unermittelbar (listUsers/Login-API broken) — manuell setzen`)
        throw error
      }
      throw error
    }
    user = data.user
    console.log(`  ✓ ${label}: angelegt (${user.id})`)
  }

  // profiles-Zeile sicherstellen (Auth-Trigger sollte sie anlegen, aber wir setzen Flags hart)
  const profilePayload = {
    id: user.id,
    email,
    rolle,
    anzeigename,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
    force_password_change: false,
    ...extra,
  }
  const { error: pErr } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' })
  if (pErr) {
    console.warn(`  ⚠ profiles-upsert für ${label}: ${pErr.message}`)
  }
  return user
}

async function main() {
  console.log('Lege/aktualisiere Test-User…')
  const created = {}
  for (const def of TEST_USERS) {
    created[def.label] = await ensureUser(def)
  }

  // .env.test schreiben (Merge mit existierendem)
  const envPath = '.env.test'
  const existingLines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
  const keep = existingLines.filter((l) => l && !l.startsWith('SMOKE_TEST_'))
  const block = [
    '# CJ-Smoke Test-User (auto-generiert von seed-test-users.mjs)',
    `SMOKE_TEST_KUNDE_USER_ID=${created.kunde.id}`,
    `SMOKE_TEST_KUNDE_EMAIL=${created.kunde.email}`,
    `SMOKE_TEST_KUNDE_PASSWORT=${PASSWORT}`,
    `SMOKE_TEST_SV_USER_ID=${created.sv.id}`,
    `SMOKE_TEST_SV_EMAIL=${created.sv.email}`,
    `SMOKE_TEST_SV_PASSWORT=${PASSWORT}`,
    `SMOKE_TEST_ADMIN_USER_ID=${created.admin.id}`,
    `SMOKE_TEST_ADMIN_EMAIL=${created.admin.email}`,
    `SMOKE_TEST_ADMIN_PASSWORT=${PASSWORT}`,
    `SMOKE_TEST_PLZ=50667`,
  ]
  writeFileSync(envPath, [...keep, ...block, ''].join('\n'))
  console.log(`\n✓ ${envPath} aktualisiert (${block.length - 1} Variablen)`)
  console.log('\nFertig. Test-User stehen, .env.test ist gesetzt.')
}

main().catch((err) => {
  console.error('seed-test-users abgestürzt:', err)
  process.exit(1)
})
