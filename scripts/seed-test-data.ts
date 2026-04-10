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

// Known user IDs from previous run
const USER_IDS = {
  kbAnna: 'dab47d30-23ab-4132-8cae-ab13fd69f5f8',
  kbBernd: '4f235326-ac0f-4ce9-8281-c9df6dd709dd',
  lukas: '09ab00d2-49ee-4cf4-b900-363db73de12b',
  sophie: '97bebff6-067e-437e-8c67-9310ac62fd2f',
  mehmet: '1f8f2413-6d2c-410d-8a50-ca174d08d7eb',
  annaK: '77b62925-f50a-4218-9b05-5e10a706308c',
  thomas: 'c9a63939-eb95-49b1-b7d0-46a3666307a6',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function ensureUser(email: string, password: string, vorname: string, nachname: string, rolle: string, knownId?: string) {
  // Check if already exists
  if (knownId) {
    const { data: existing } = await db.from('profiles').select('id').eq('id', knownId).maybeSingle()
    if (existing) {
      console.log(`  [SKIP] ${email} exists (${knownId})`)
      return knownId
    }
  }
  const { data: byEmail } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
  if (byEmail) {
    console.log(`  [SKIP] ${email} exists (${byEmail.id})`)
    return byEmail.id as string
  }

  const { data, error } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { vorname, nachname },
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)

  const userId = data.user.id
  const { error: profileErr } = await db.from('profiles').upsert({
    id: userId, email, vorname, nachname, rolle,
    auth_provider: 'email', aktiv: true,
  })
  if (profileErr) throw new Error(`profile ${email}: ${profileErr.message}`)

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

async function insertLead(data: Record<string, unknown>) {
  const { data: lead, error } = await db.from('leads').insert(data).select('id').single()
  if (error) throw new Error(`Lead insert: ${error.message} (${error.code})`)
  return lead.id as string
}

async function insertFall(data: Record<string, unknown>) {
  const { data: fall, error } = await db.from('faelle').insert(data).select('id').single()
  if (error) throw new Error(`Fall insert: ${error.message} (${error.code})`)
  return fall.id as string
}

async function insertTermin(data: Record<string, unknown>) {
  const { error } = await db.from('gutachter_termine').insert(data)
  if (error) throw new Error(`Termin insert: ${error.message} (${error.code})`)
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== KFZ-191: Test-Seed ===\n')

  // Phase 2: Test-User (skip if existing)
  console.log('--- Phase 2: Test-User ---')
  await ensureUser('test-kb-anna@claimondo.de', 'TestKB2026!', 'Anna', 'Mueller', 'kundenbetreuer', USER_IDS.kbAnna)
  await ensureUser('test-kb-bernd@claimondo.de', 'TestKB2026!', 'Bernd', 'Schmidt', 'kundenbetreuer', USER_IDS.kbBernd)
  await ensureUser('test-lukas.weber@example.com', 'TestKunde2026!', 'Lukas', 'Weber', 'kunde', USER_IDS.lukas)
  await ensureUser('test-sophie.klein@example.com', 'TestKunde2026!', 'Sophie', 'Klein', 'kunde', USER_IDS.sophie)
  await ensureUser('test-mehmet.yilmaz@example.com', 'TestKunde2026!', 'Mehmet', 'Yilmaz', 'kunde', USER_IDS.mehmet)
  await ensureUser('test-anna.schneider@example.com', 'TestKunde2026!', 'Anna', 'Schneider', 'kunde', USER_IDS.annaK)
  await ensureUser('test-thomas.bauer@example.com', 'TestKunde2026!', 'Thomas', 'Bauer', 'kunde', USER_IDS.thomas)

  // Phase 3: Check if data already exists
  console.log('\n--- Phase 3: Test-Daten ---')
  const { count: existingLeads } = await db.from('leads').select('*', { count: 'exact', head: true })
  if ((existingLeads ?? 0) >= 5) {
    console.log('  [SKIP] Leads already seeded (' + existingLeads + ')')
  } else {
    // LEAD 1: Lukas Weber — frischer Lead (kein Fall)
    const lead1Id = await insertLead({
      vorname: 'Lukas', nachname: 'Weber', telefon: '+4915111111111', email: 'test-lukas.weber@example.com',
      status: 'neu', schadenfall_typ: 'sf-01', zugewiesen_an: USER_IDS.kbAnna,
      schadens_adresse: 'Hohenzollernring 25', schadens_plz: '50672', schadens_ort: 'Köln',
      fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d', kennzeichen: 'K-LW 1234',
      gegner_versicherung: 'HUK-Coburg', gegner_bekannt: true,
    })
    console.log(`  [OK] Lead 1 (Lukas): ${lead1Id}`)

    // LEAD 2: Sophie Klein — FlowLink versendet
    const lead2Id = await insertLead({
      vorname: 'Sophie', nachname: 'Klein', telefon: '+4915122222222', email: 'test-sophie.klein@example.com',
      status: 'flow-gesendet', schadenfall_typ: 'sf-01', zugewiesen_an: USER_IDS.kbAnna,
      schadens_adresse: 'Severinstraße 100', schadens_plz: '50678', schadens_ort: 'Köln',
      fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf 8', kennzeichen: 'K-SK 5678',
      gegner_versicherung: 'Allianz', gegner_bekannt: true,
    })
    const fall2Id = await insertFall({
      lead_id: lead2Id, kunde_id: USER_IDS.sophie, sv_id: AARON_SV_ID,
      fall_nummer: 'F-2026-TEST-002', status: 'ersterfassung', schadens_ursache: 'Auffahrunfall',
      schadens_datum: daysAgo(3), besichtigungsort_adresse: 'Severinstraße 100, 50678 Köln',
      fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf 8', kennzeichen: 'K-SK 5678',
      kundenbetreuer_id: USER_IDS.kbAnna,
    })
    await insertTermin({ fall_id: fall2Id, sv_id: AARON_SV_ID, start_zeit: futureDate(2, 10), end_zeit: futureDate(2, 11), status: 'reserviert' })
    console.log(`  [OK] Lead 2 + Fall 2 (Sophie): ${lead2Id} / ${fall2Id}`)

    // LEAD 3: Mehmet Yilmaz — SA unterzeichnet
    const lead3Id = await insertLead({
      vorname: 'Mehmet', nachname: 'Yilmaz', telefon: '+4915133333333', email: 'test-mehmet.yilmaz@example.com',
      status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: USER_IDS.kbAnna,
      sa_unterschrieben: true, sa_datum: daysAgo(5),
      fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4', kennzeichen: 'K-MY 9999',
      gegner_versicherung: 'AXA', gegner_bekannt: true,
    })
    const fall3Id = await insertFall({
      lead_id: lead3Id, kunde_id: USER_IDS.mehmet, sv_id: AARON_SV_ID,
      fall_nummer: 'F-2026-TEST-003', status: 'sv-zugewiesen', schadens_ursache: 'Auffahrunfall',
      schadens_datum: daysAgo(7), besichtigungsort_adresse: 'Venloer Straße 250, 50823 Köln',
      fahrzeug_hersteller: 'Audi', fahrzeug_modell: 'A4', kennzeichen: 'K-MY 9999',
      vollmacht_status: 'offen', kundenbetreuer_id: USER_IDS.kbAnna,
    })
    await insertTermin({ fall_id: fall3Id, sv_id: AARON_SV_ID, start_zeit: futureDate(1, 14), end_zeit: futureDate(1, 15), status: 'bestaetigt' })
    console.log(`  [OK] Lead 3 + Fall 3 (Mehmet): ${lead3Id} / ${fall3Id}`)

    // LEAD 4: Anna Schneider — Gutachten in QC
    const lead4Id = await insertLead({
      vorname: 'Anna', nachname: 'Schneider', telefon: '+4915144444444', email: 'test-anna.schneider@example.com',
      status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: USER_IDS.kbBernd,
      sa_unterschrieben: true, sa_datum: daysAgo(12),
      fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse', kennzeichen: 'K-AS 4444',
      gegner_versicherung: 'ERGO', gegner_bekannt: true,
    })
    const fall4Id = await insertFall({
      lead_id: lead4Id, kunde_id: USER_IDS.annaK, sv_id: AARON_SV_ID,
      fall_nummer: 'F-2026-TEST-004', status: 'gutachten-eingegangen', schadens_ursache: 'Vorfahrt',
      schadens_datum: daysAgo(14), besichtigungsort_adresse: 'Bergisch Gladbacher Str. 50, 51065 Köln',
      fahrzeug_hersteller: 'Mercedes', fahrzeug_modell: 'C-Klasse', kennzeichen: 'K-AS 4444',
      gutachten_betrag: 7340.50, gutachten_eingegangen_am: daysAgo(3),
      vollmacht_status: 'unterschrieben', vollmacht_signiert_am: daysAgo(12),
      kanzlei_provision_status: 'berechtigt', kanzlei_honorar: 150,
      kundenbetreuer_id: USER_IDS.kbBernd,
    })
    await insertTermin({ fall_id: fall4Id, sv_id: AARON_SV_ID, start_zeit: daysAgo(5), end_zeit: daysAgo(5), status: 'abgeschlossen' })
    console.log(`  [OK] Lead 4 + Fall 4 (Anna S.): ${lead4Id} / ${fall4Id}`)

    // LEAD 5: Thomas Bauer — abgeschlossen
    const lead5Id = await insertLead({
      vorname: 'Thomas', nachname: 'Bauer', telefon: '+4915155555555', email: 'test-thomas.bauer@example.com',
      status: 'umgewandelt', schadenfall_typ: 'sf-01', zugewiesen_an: USER_IDS.kbBernd,
      sa_unterschrieben: true, sa_datum: daysAgo(58),
      fahrzeug_hersteller: 'Tesla', fahrzeug_modell: 'Model 3', kennzeichen: 'K-TB 7777',
      gegner_versicherung: 'HDI', gegner_bekannt: true,
    })
    const fall5Id = await insertFall({
      lead_id: lead5Id, kunde_id: USER_IDS.thomas, sv_id: AARON_SV_ID,
      fall_nummer: 'F-2026-TEST-005', status: 'abgeschlossen', schadens_ursache: 'Spurwechsel',
      schadens_datum: daysAgo(60), besichtigungsort_adresse: 'Frankfurter Str. 200, 51065 Köln',
      fahrzeug_hersteller: 'Tesla', fahrzeug_modell: 'Model 3', kennzeichen: 'K-TB 7777',
      gutachten_betrag: 12450, gutachten_eingegangen_am: daysAgo(52),
      regulierung_betrag: 12450, regulierung_am: daysAgo(40),
      zahlung_eingegangen_am: daysAgo(35), zahlung_betrag: 12450,
      vollmacht_status: 'unterschrieben', vollmacht_signiert_am: daysAgo(58),
      kanzlei_provision_status: 'ausgezahlt', kanzlei_provision_ausgezahlt_am: daysAgo(33),
      kanzlei_honorar: 150, kundenbetreuer_id: USER_IDS.kbBernd,
    })
    await insertTermin({ fall_id: fall5Id, sv_id: AARON_SV_ID, start_zeit: daysAgo(55), end_zeit: daysAgo(55), status: 'abgeschlossen' })
    console.log(`  [OK] Lead 5 + Fall 5 (Thomas): ${lead5Id} / ${fall5Id}`)
  }

  // Phase 4: Konsistenz-Checks (no .catch(), no .rpc())
  console.log('\n--- Phase 4: Konsistenz-Checks ---')
  const tableChecks: Array<{ table: string; filter?: Record<string, string>; expect: number; label: string }> = [
    { table: 'faelle', expect: 4, label: 'Faelle' },
    { table: 'leads', expect: 5, label: 'Leads' },
    { table: 'gutachter_termine', expect: 4, label: 'Termine' },
    { table: 'sachverstaendige', expect: 1, label: 'Gutachter' },
    { table: 'faelle', filter: { kanzlei_provision_status: 'berechtigt' }, expect: 1, label: 'Kanzlei berechtigt' },
    { table: 'faelle', filter: { kanzlei_provision_status: 'ausgezahlt' }, expect: 1, label: 'Kanzlei ausgezahlt' },
  ]
  for (const { table, filter, expect, label } of tableChecks) {
    let query = db.from(table).select('*', { count: 'exact', head: true })
    if (filter) {
      for (const [k, v] of Object.entries(filter)) {
        query = query.eq(k, v)
      }
    }
    const { count, error } = await query
    if (error) {
      console.log(`  ❌ ${label}: ERROR ${error.message}`)
      continue
    }
    const actual = count ?? 0
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
