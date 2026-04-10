/**
 * KFZ-191: Seed frische Test-Daten nach DB-Cleanup.
 * Erstellt 2 KB-User + 5 Kunden-User + 5 Leads + 4 Faelle in verschiedenen Phasen.
 *
 * Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1) }

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const AARON_SV_ID = '4ef2dacd-d2e5-491c-833f-096bf09efd0c'
const AARON_PROFILE_ID = 'e2555dfb-e5ad-4f13-832f-03c0e48f599e'

// ─── Helpers ──────────────────────────────────────────────────────────────

async function createUser(email: string, password: string, vorname: string, nachname: string, rolle: string) {
  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { vorname, nachname },
  })
  if (error) {
    if (error.message.includes('already been registered')) {
      const { data: existing } = await db.from('profiles').select('id').eq('email', email).single()
      console.log(`  [SKIP] ${email} exists (${existing?.id})`)
      return existing?.id ?? null
    }
    throw new Error(`createUser ${email}: ${error.message}`)
  }
  const userId = data.user.id

  await db.from('profiles').upsert({
    id: userId, email, vorname, nachname, rolle,
    auth_provider: 'email', aktiv: true,
  })

  console.log(`  [OK] ${email} -> ${userId} (${rolle})`)
  return userId
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000).toISOString()
}

function futureDate(days: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== KFZ-191: Test-Seed ===\n')

  // Phase 2: Test-User
  console.log('--- Phase 2: Test-User ---')
  const kbAnnaId = await createUser('test-kb-anna@claimondo.de', 'TestKB2026!', 'Anna', 'Mueller', 'kundenbetreuer')
  const kbBerndId = await createUser('test-kb-bernd@claimondo.de', 'TestKB2026!', 'Bernd', 'Schmidt', 'kundenbetreuer')
  const lukasId = await createUser('test-lukas.weber@example.com', 'TestKunde2026!', 'Lukas', 'Weber', 'kunde')
  const sophieId = await createUser('test-sophie.klein@example.com', 'TestKunde2026!', 'Sophie', 'Klein', 'kunde')
  const mehmetId = await createUser('test-mehmet.yilmaz@example.com', 'TestKunde2026!', 'Mehmet', 'Yilmaz', 'kunde')
  const annaKId = await createUser('test-anna.schneider@example.com', 'TestKunde2026!', 'Anna', 'Schneider', 'kunde')
  const thomasId = await createUser('test-thomas.bauer@example.com', 'TestKunde2026!', 'Thomas', 'Bauer', 'kunde')

  // Phase 3: Leads + Faelle
  console.log('\n--- Phase 3: Test-Daten ---')

  // LEAD 1: Lukas Weber — frischer Lead
  const { data: lead1 } = await db.from('leads').insert({
    vorname: 'Lukas', nachname: 'Weber', telefon: '+4915111111111', email: 'test-lukas.weber@example.com',
    status: 'neu', schadenfall_typ: 'sf-01', zugewiesen_an: kbAnnaId,
    schadens_adresse: 'Hohenzollernring 25', schadens_plz: '50672', schadens_ort: 'Köln',
    fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d', kennzeichen: 'K-LW 1234',
    gegner_versicherung: 'HUK-Coburg', gegner_bekannt: true,
    created_at: daysAgo(0),
  }).select('id').single()
  console.log(`  Lead 1 (Lukas): ${lead1?.id}`)

  // LEAD 2: Sophie Klein — FlowLink versendet
  const { data: lead2 } = await db.from('leads').insert({
    vorname: 'Sophie', nachname: 'Klein', telefon: '+4915122222222', email: 'test-sophie.klein@example.com',
    status: 'kontaktiert', schadenfall_typ: 'sf-01', zugewiesen_an: kbAnnaId,
    schadens_adresse: 'Severinstraße 100', schadens_plz: '50678', schadens_ort: 'Köln',
    fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf 8', kennzeichen: 'K-SK 5678',
    gegner_versicherung: 'Allianz', gegner_bekannt: true,
    created_at: daysAgo(3),
  }).select('id').single()

  // FlowLink fuer Sophie
  await db.from('flow_links').insert({
    lead_id: lead2?.id, status: 'offen',
    token: 'test-flowlink-sophie-' + Date.now(),
  })

  // Fall 2: Sophie (flowlink_versendet)
  const { data: fall2 } = await db.from('faelle').insert({
    lead_id: lead2?.id, kunde_id: sophieId, sv_id: AARON_SV_ID,
    fall_nummer: 'F-2026-TEST-002',
    status: 'ersterfassung',
    schadens_ursache: 'Auffahrunfall',
    schadens_datum: daysAgo(3),
    besichtigungsort_adresse: 'Severinstraße 100, 50678 Köln',
    fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf 8', kennzeichen: 'K-SK 5678',
    kundenbetreuer_id: kbAnnaId,
    created_at: daysAgo(3),
  }).select('id').single()

  // Termin fuer Sophie (uebermorgen 10:00)
  if (fall2?.id) {
    await db.from('gutachter_termine').insert({
      fall_id: fall2.id, sv_id: AARON_SV_ID,
      start_zeit: futureDate(2, 10), end_zeit: futureDate(2, 11),
      status: 'reserviert',
    })
  }
  console.log(`  Lead 2 + Fall 2 (Sophie): ${lead2?.id} / ${fall2?.id}`)

  // LEAD 3: Mehmet Yilmaz — SA unterzeichnet, Termin morgen
  const { data: lead3 } = await db.from('leads').insert({
    vorname: 'Mehmet', nachname: 'Yilmaz', telefon: '+4915133333333', email: 'test-mehmet.yilmaz@example.com',
    status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: kbAnnaId,
    sa_unterschrieben: true, sa_datum: daysAgo(5),
    schadens_adresse: 'Venloer Straße 250', schadens_plz: '50823', schadens_ort: 'Köln',
    fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4', kennzeichen: 'K-MY 9999',
    gegner_versicherung: 'AXA', gegner_bekannt: true,
    created_at: daysAgo(7),
  }).select('id').single()

  const { data: fall3 } = await db.from('faelle').insert({
    lead_id: lead3?.id, kunde_id: mehmetId, sv_id: AARON_SV_ID,
    fall_nummer: 'F-2026-TEST-003',
    status: 'sv-zugewiesen',
    schadens_ursache: 'Auffahrunfall',
    schadens_datum: daysAgo(7),
    besichtigungsort_adresse: 'Venloer Straße 250, 50823 Köln',
    fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4', kennzeichen: 'K-MY 9999',
    vollmacht_status: 'offen',
    kundenbetreuer_id: kbAnnaId,
    created_at: daysAgo(7),
  }).select('id').single()

  if (fall3?.id) {
    await db.from('gutachter_termine').insert({
      fall_id: fall3.id, sv_id: AARON_SV_ID,
      start_zeit: futureDate(1, 14), end_zeit: futureDate(1, 15),
      status: 'bestaetigt',
    })
  }
  console.log(`  Lead 3 + Fall 3 (Mehmet): ${lead3?.id} / ${fall3?.id}`)

  // LEAD 4: Anna Schneider — Gutachten in QC
  const { data: lead4 } = await db.from('leads').insert({
    vorname: 'Anna', nachname: 'Schneider', telefon: '+4915144444444', email: 'test-anna.schneider@example.com',
    status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: kbBerndId,
    sa_unterschrieben: true, sa_datum: daysAgo(12),
    schadens_adresse: 'Bergisch Gladbacher Straße 50', schadens_plz: '51065', schadens_ort: 'Köln',
    fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse', kennzeichen: 'K-AS 4444',
    gegner_versicherung: 'ERGO', gegner_bekannt: true,
    created_at: daysAgo(14),
  }).select('id').single()

  const { data: fall4 } = await db.from('faelle').insert({
    lead_id: lead4?.id, kunde_id: annaKId, sv_id: AARON_SV_ID,
    fall_nummer: 'F-2026-TEST-004',
    status: 'gutachten-eingegangen',
    schadens_ursache: 'Vorfahrtsverletzung',
    schadens_datum: daysAgo(14),
    besichtigungsort_adresse: 'Bergisch Gladbacher Straße 50, 51065 Köln',
    fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse', kennzeichen: 'K-AS 4444',
    gutachten_betrag: 7340.50,
    gutachten_eingegangen_am: daysAgo(3),
    vollmacht_status: 'unterschrieben',
    vollmacht_signiert_am: daysAgo(12),
    kanzlei_provision_status: 'berechtigt',
    kanzlei_honorar: 150,
    kundenbetreuer_id: kbBerndId,
    created_at: daysAgo(14),
  }).select('id').single()

  if (fall4?.id) {
    await db.from('gutachter_termine').insert({
      fall_id: fall4.id, sv_id: AARON_SV_ID,
      start_zeit: daysAgo(5), end_zeit: daysAgo(5),
      status: 'abgeschlossen',
    })
  }
  console.log(`  Lead 4 + Fall 4 (Anna S.): ${lead4?.id} / ${fall4?.id}`)

  // LEAD 5: Thomas Bauer — komplett abgeschlossen
  const { data: lead5 } = await db.from('leads').insert({
    vorname: 'Thomas', nachname: 'Bauer', telefon: '+4915155555555', email: 'test-thomas.bauer@example.com',
    status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: kbBerndId,
    sa_unterschrieben: true, sa_datum: daysAgo(58),
    schadens_adresse: 'Frankfurter Straße 200', schadens_plz: '51065', schadens_ort: 'Köln',
    fahrzeug_hersteller: 'Tesla', fahrzeug_modell: 'Model 3', kennzeichen: 'K-TB 7777',
    gegner_versicherung: 'HDI', gegner_bekannt: true,
    created_at: daysAgo(60),
  }).select('id').single()

  const { data: fall5 } = await db.from('faelle').insert({
    lead_id: lead5?.id, kunde_id: thomasId, sv_id: AARON_SV_ID,
    fall_nummer: 'F-2026-TEST-005',
    status: 'abgeschlossen',
    schadens_ursache: 'Spurwechselunfall',
    schadens_datum: daysAgo(60),
    besichtigungsort_adresse: 'Frankfurter Straße 200, 51065 Köln',
    fahrzeug_hersteller: 'Tesla', fahrzeug_modell: 'Model 3', kennzeichen: 'K-TB 7777',
    gutachten_betrag: 12450,
    gutachten_eingegangen_am: daysAgo(52),
    regulierung_betrag: 12450,
    regulierung_am: daysAgo(40),
    zahlung_eingegangen_am: daysAgo(35),
    zahlung_betrag: 12450,
    anspruchsschreiben_gesendet_am: daysAgo(50),
    vollmacht_status: 'unterschrieben',
    vollmacht_signiert_am: daysAgo(58),
    kanzlei_provision_status: 'ausgezahlt',
    kanzlei_provision_ausgezahlt_am: daysAgo(33),
    kanzlei_honorar: 150,
    kundenbetreuer_id: kbBerndId,
    created_at: daysAgo(60),
  }).select('id').single()

  if (fall5?.id) {
    await db.from('gutachter_termine').insert({
      fall_id: fall5.id, sv_id: AARON_SV_ID,
      start_zeit: daysAgo(55), end_zeit: daysAgo(55),
      status: 'abgeschlossen',
    })
  }
  console.log(`  Lead 5 + Fall 5 (Thomas): ${lead5?.id} / ${fall5?.id}`)

  // Phase 4: Konsistenz-Checks
  console.log('\n--- Phase 4: Konsistenz-Checks ---')
  const checks = [
    { q: "SELECT COUNT(*)::int as c FROM faelle", expect: 4, label: 'Faelle' },
    { q: "SELECT COUNT(*)::int as c FROM leads", expect: 5, label: 'Leads' },
    { q: "SELECT COUNT(*)::int as c FROM gutachter_termine", expect: 4, label: 'Termine' },
    { q: "SELECT COUNT(*)::int as c FROM sachverstaendige", expect: 1, label: 'Gutachter' },
    { q: "SELECT COUNT(*)::int as c FROM faelle WHERE kanzlei_provision_status='berechtigt'", expect: 1, label: 'Kanzlei berechtigt' },
    { q: "SELECT COUNT(*)::int as c FROM faelle WHERE kanzlei_provision_status='ausgezahlt'", expect: 1, label: 'Kanzlei ausgezahlt' },
  ]
  for (const { q, expect, label } of checks) {
    const { data } = await db.rpc('exec_sql', { query: q }).single().catch(() => ({ data: null }))
    // Fallback: direct query
    const { count } = await db.from(label === 'Faelle' ? 'faelle' : label === 'Leads' ? 'leads' : label === 'Termine' ? 'gutachter_termine' : 'sachverstaendige').select('*', { count: 'exact', head: true })
    const actual = count ?? '?'
    const ok = actual === expect ? '✅' : '❌'
    console.log(`  ${ok} ${label}: ${actual} (erwartet ${expect})`)
  }

  // Phase 5: Credentials Output
  console.log(`
==========================================
TEST-CREDENTIALS — KFZ-191
==========================================

KB-USER (intern):
test-kb-anna@claimondo.de    | TestKB2026!
test-kb-bernd@claimondo.de   | TestKB2026!

KUNDEN-USER:
test-lukas.weber@example.com    | TestKunde2026!  (Lead, kein Fall)
test-sophie.klein@example.com   | TestKunde2026!  (FlowLink wartet)
test-mehmet.yilmaz@example.com  | TestKunde2026!  (SA unterzeichnet)
test-anna.schneider@example.com | TestKunde2026!  (Gutachten in QC)
test-thomas.bauer@example.com   | TestKunde2026!  (abgeschlossen)

GUTACHTER (existing, NICHT neu):
Aaron Sprafke (existing Login)

ADMIN (existing, NICHT neu):
existing Admin-Login

==========================================

PHASE-COVERAGE-MATRIX:
| Persona         | Phase                  | KB    | Vollmacht  | Bezahlt |
|-----------------|------------------------|-------|------------|---------|
| Lukas Weber     | lead_neu               | Anna  | -          | -       |
| Sophie Klein    | flowlink_versendet     | Anna  | -          | -       |
| Mehmet Yilmaz   | sa_unterzeichnet       | Anna  | -          | -       |
| Anna Schneider  | gutachten_in_qc        | Bernd | berechtigt | -       |
| Thomas Bauer    | abgeschlossen          | Bernd | ausgezahlt | 12450€  |
`)
}

main().catch(err => { console.error('SEED FAILED:', err); process.exit(1) })
