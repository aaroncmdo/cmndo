/**
 * Seed-Script: Erstellt Test-Users, Leads und Fälle für Claimondo-v2.
 * Idempotent — kann mehrfach ausgeführt werden.
 *
 * Ausfuehren: npx tsx src/scripts/seed-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein.')
  console.error('Tipp: npx dotenv -e .env.local -- npx tsx src/scripts/seed-test-data.ts')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_PHONE = '+4915562740016'
const TEST_PW = 'Claimondo2024!'

type TestUser = { email: string; rolle: string; vorname: string; nachname: string; userId?: string }

const USERS: TestUser[] = [
  { email: 'test-kb@claimondo.de', rolle: 'kundenbetreuer', vorname: 'Anna', nachname: 'Weber' },
  { email: 'test-dispatch@claimondo.de', rolle: 'dispatch', vorname: 'Max', nachname: 'Fischer' },
  { email: 'test-sv@claimondo.de', rolle: 'sachverstaendiger', vorname: 'Thomas', nachname: 'Schmidt' },
  { email: 'test-kunde@claimondo.de', rolle: 'kunde', vorname: 'Lisa', nachname: 'Mueller' },
  { email: 'julia.hoffmann@test.de', rolle: 'kunde', vorname: 'Julia', nachname: 'Hoffmann' },
  { email: 'markus.braun@test.de', rolle: 'kunde', vorname: 'Markus', nachname: 'Braun' },
]

async function ensureUser(u: TestUser): Promise<string> {
  // Try to create — if duplicate, look up existing
  const { data: created, error } = await db.auth.admin.createUser({
    email: u.email,
    password: TEST_PW,
    email_confirm: true,
    user_metadata: { rolle: u.rolle },
    app_metadata: { rolle: u.rolle },
  })

  if (error && error.message.includes('already been registered')) {
    // User existiert — ID aus profiles holen
    const { data: profile } = await db.from('profiles').select('id').eq('email', u.email).maybeSingle()
    if (profile) {
      console.log(`  [SKIP] ${u.email} existiert (${profile.id})`)
      u.userId = profile.id
      return profile.id
    }
    // Fallback: direct SQL via service role
    const { data: authRows } = await db.rpc('exec_sql', { query: `SELECT id::text FROM auth.users WHERE email = '${u.email}' LIMIT 1` })
    if (authRows?.[0]?.id) {
      u.userId = authRows[0].id
      await db.from('profiles').upsert({ id: authRows[0].id, email: u.email, vorname: u.vorname, nachname: u.nachname, telefon: TEST_PHONE, rolle: u.rolle }, { onConflict: 'id' })
      console.log(`  [SKIP+PROFILE] ${u.email} (${authRows[0].id})`)
      return authRows[0].id
    }
    // Last resort: listUsers (all pages)
    let page = 1
    while (page <= 20) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 50 })
      const found = list?.users?.find(x => x.email === u.email)
      if (found) {
        u.userId = found.id
        await db.from('profiles').upsert({ id: found.id, email: u.email, vorname: u.vorname, nachname: u.nachname, telefon: TEST_PHONE, rolle: u.rolle }, { onConflict: 'id' })
        console.log(`  [SKIP+PROFILE] ${u.email} (${found.id})`)
        return found.id
      }
      if ((list?.users?.length ?? 0) < 50) break
      page++
    }
    throw new Error(`User ${u.email} existiert aber ID nicht gefunden`)
  }

  if (error) throw new Error(`User ${u.email}: ${error.message}`)

  console.log(`  [CREATE] ${u.email} → ${created.user.id}`)
  u.userId = created.user.id

  await db.from('profiles').upsert({
    id: created.user.id, email: u.email, vorname: u.vorname, nachname: u.nachname,
    telefon: TEST_PHONE, rolle: u.rolle,
  }, { onConflict: 'id' })

  return created.user.id
}

async function main() {
  console.log('\n=== SEED TEST-DATEN ===\n')

  // 1. Users erstellen
  console.log('1. Users...')
  for (const u of USERS) {
    await ensureUser(u)
  }

  const kbId = USERS.find(u => u.email === 'test-kb@claimondo.de')!.userId!
  const svUserId = USERS.find(u => u.email === 'test-sv@claimondo.de')!.userId!
  const kundeId = USERS.find(u => u.email === 'test-kunde@claimondo.de')!.userId!
  const juliaId = USERS.find(u => u.email === 'julia.hoffmann@test.de')!.userId!
  const markusId = USERS.find(u => u.email === 'markus.braun@test.de')!.userId!

  // 2. SV anlegen
  console.log('\n2. Sachverstaendiger...')
  const { data: existingSv } = await db.from('sachverstaendige').select('id').eq('profile_id', svUserId).maybeSingle()
  let svId: string
  if (existingSv) {
    svId = existingSv.id
    console.log(`  [SKIP] SV existiert (${svId})`)
  } else {
    const { data: newSv, error: svErr } = await db.from('sachverstaendige').insert({
      profile_id: svUserId,
      standort_lat: 50.9375,
      standort_lng: 6.9603,
      radius_km: 40,
      paket: 'pro',
      onboarding_status: 'abgeschlossen',
      portal_zugang_freigeschaltet: true,
      vertrag_unterschrieben: true,
      ist_aktiv: true,
    }).select('id').single()
    if (svErr) throw new Error(`SV: ${svErr.message}`)
    svId = newSv.id
    console.log(`  [CREATE] SV ${svId}`)
  }

  // 3. Leads erstellen
  console.log('\n3. Leads...')
  const leads = [
    {
      vorname: 'Peter', nachname: 'Becker', telefon: TEST_PHONE, email: 'peter.becker@test.de',
      qualifizierungs_phase: 'neu',
      gegner_versicherung: 'Allianz', gegner_bekannt: true,
      zugewiesen_an: kbId,
    },
    {
      vorname: 'Sandra', nachname: 'Klein', telefon: TEST_PHONE, email: 'sandra.klein@test.de',
      qualifizierungs_phase: 'in-qualifizierung',
      gegner_versicherung: 'HUK-COBURG', gegner_bekannt: true,
      ist_fahrzeughalter: false, halter_vorname: 'Michael', halter_nachname: 'Klein',
      zugewiesen_an: kbId,
    },
    {
      vorname: 'Ahmed', nachname: 'Yilmaz', telefon: TEST_PHONE, email: 'ahmed.yilmaz@test.de',
      qualifizierungs_phase: 'flow-versendet',
      gegner_versicherung: 'AXA', gegner_bekannt: true,
      service_typ: 'komplett',
      zugewiesen_an: kbId,
    },
  ]

  for (const l of leads) {
    const { data: exists } = await db.from('leads').select('id').eq('email', l.email).maybeSingle()
    if (exists) {
      console.log(`  [SKIP] Lead ${l.email} existiert`)
      continue
    }
    const { error } = await db.from('leads').insert(l)
    if (error) console.error(`  [FAIL] Lead ${l.email}: ${error.message}`)
    else console.log(`  [CREATE] Lead ${l.vorname} ${l.nachname}`)
  }

  // 4. Fälle erstellen
  console.log('\n4. Faelle...')
  const morgen = new Date(Date.now() + 86400000).toISOString()
  const vor3Tagen = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
  const vor16Tagen = new Date(Date.now() - 16 * 86400000).toISOString()

  const faelle = [
    {
      fall_nummer: 'TEST-001',
      status: 'sv-termin' as const,
      kunde_id: kundeId,
      sv_id: svId,
      kundenbetreuer_id: kbId,
      kennzeichen: 'K-AB 1234',
      fahrzeug_hersteller: 'BMW', fahrzeug_modell: '3er',
      schadens_datum: vor3Tagen,
      schadens_ort: 'Koeln, Aachener Str.',
      versicherung_name: 'Allianz',
      sv_termin: morgen,
    },
    {
      fall_nummer: 'TEST-002',
      status: 'gutachten-eingegangen' as const,
      kunde_id: juliaId,
      sv_id: svId,
      kundenbetreuer_id: kbId,
      kennzeichen: 'K-CD 5678',
      fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf',
      schadens_datum: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
      versicherung_name: 'HUK-COBURG',
      ist_totalschaden: false,
      gutachten_eingegangen_am: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      fall_nummer: 'TEST-003',
      status: 'anschlussschreiben' as const,
      kunde_id: markusId,
      sv_id: svId,
      kundenbetreuer_id: kbId,
      kennzeichen: 'K-EF 9012',
      fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse',
      schadens_datum: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
      versicherung_name: 'AXA',
      anschlussschreiben_am: vor16Tagen,
      schadenhoehe_netto: 15000,
      hat_vorschaeden: true,
      vorschaeden_beschreibung: 'Leichte Delle an Fahrerseite (repariert 2024)',
      service_typ: 'komplett',
    },
  ]

  for (const f of faelle) {
    const { data: exists } = await db.from('faelle').select('id').eq('fall_nummer', f.fall_nummer).maybeSingle()
    if (exists) {
      console.log(`  [SKIP] Fall ${f.fall_nummer} existiert`)
      continue
    }
    const { error } = await db.from('faelle').insert(f)
    if (error) console.error(`  [FAIL] Fall ${f.fall_nummer}: ${error.message}`)
    else console.log(`  [CREATE] Fall ${f.fall_nummer} (${f.status})`)
  }

  console.log('\n=== SEED ABGESCHLOSSEN ===\n')
  console.log('TEST-USERS:')
  console.log('  Admin:    lupus.674music@gmail.com (bestehend)')
  console.log(`  KB:       test-kb@claimondo.de / ${TEST_PW}`)
  console.log(`  Dispatch: test-dispatch@claimondo.de / ${TEST_PW}`)
  console.log(`  SV:       test-sv@claimondo.de / ${TEST_PW}`)
  console.log(`  Kunde:    test-kunde@claimondo.de / ${TEST_PW}`)
  console.log('')
  console.log('TEST-DATEN:')
  console.log('  3 Leads: Peter Becker (neu), Sandra Klein (quali-offen), Ahmed Yilmaz (flow-gesendet)')
  console.log('  3 Faelle: TEST-001 (sv-termin), TEST-002 (gutachten-eingegangen), TEST-003 (as-gesendet)')
  console.log('  1 SV: Thomas Schmidt, Koeln, Pro-Paket, 40km Radius')
  console.log('')
}

main().catch(err => {
  console.error('SEED FAILED:', err)
  process.exit(1)
})
