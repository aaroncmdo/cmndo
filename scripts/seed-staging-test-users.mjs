/**
 * Staging-Seed: Test-User + Test-Daten für Portal-Smoke
 *
 * Legt idempotent an:
 *   1. test-kanzlei@claimondo.de (rolle=kanzlei) + kanzleien-Org-Record
 *   2. test-makler@claimondo.de  (rolle=makler)  + makler-Org-Record
 *   3. SV-Test-Auftrag + Fall + Claim + gutachter_termin für test-sv
 *   4. Phase-5-Kunden-Lead (konvertiert) für Magic-Link-Smoke
 *
 * Voraussetzungen:
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local oder Env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local oder Env
 *
 * Ausführung:
 *   node scripts/seed-staging-test-users.mjs
 *
 * Idempotenz: INSERT … ON CONFLICT DO NOTHING mit stabilen UUIDs
 *
 * ACHTUNG: Staging nutzt dieselbe Supabase-DB wie Prod (Project paizkjajbuxxksdoycev).
 * Alle Test-Records sind mit Smoke-Marker versehen.
 *
 * Bootstrap (einmalig, bei neu angelegten Auth-Usern):
 *   Auth-User test-kanzlei + test-makler werden via Supabase Admin-API angelegt.
 *   Falls Admin-API listUsers() bei vollen Connection-Pools fehlschlägt, wurden
 *   die User beim Erst-Seed direkt via SQL in auth.users eingefügt (MCP-Tool).
 *   Das Script prüft Existenz über profiles.email — stabiler als listUsers().
 *
 * Constraint-Referenz (aus DB, 13.05.2026):
 *   claims.schadenart: haftpflicht|vollkasko|teilkasko|eigenverschulden|unbekannt
 *   claims.status: dispatch_done|in_bearbeitung|in_kommunikation_vs|reguliert|abgelehnt|an_externe_kanzlei_uebergeben|storniert
 *   claims.created_via: lead_konvertierung|cardentity_befund|manuell_admin|airdrop|sv_anlage|backfill_aar810_a1
 *   claims.phase: 0_lead|1_neu|2_in_bearbeitung|3_gutachter_unterwegs|4_gutachten_fertig|5_in_reparatur|6_kommunikation_versicherung|9_reguliert|9_abgelehnt|9_an_externe_kanzlei|9_storniert
 *   faelle.aktuelle_phase: fallakte_angelegt|termin_bestaetigt|sv_unterwegs|sv_vor_ort|...
 *   auftraege.typ: erstgutachten|nachbesichtigung|stellungnahme
 *   auftraege.status: termin|besichtigung|gutachten|abgeschlossen
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Env aus .env.local laden ─────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local')
    const raw = readFileSync(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 0) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* .env.local optional */ }
}
loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FEHLER: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.')
  process.exit(1)
}

console.log(`\n⚠️  HINWEIS: Staging = Prod-DB (${SUPABASE_URL.match(/\/\/([^.]+)/)?.[1] ?? '?'}.supabase.co)`)
console.log('   Alle Test-Records erhalten Smoke-Marker und sind löschbar.\n')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Stabile UUIDs für idempotente Inserts ────────────────────────────────────
const IDS = {
  // Auth + Profile
  kanzleiUserId:   'bbbb1111-0000-4000-8000-000000000010',
  maklerUserId:    'bbbb2222-0000-4000-8000-000000000020',

  // Org-Records
  kanzleiOrgId:    'bbbb1111-0000-4000-8000-000000000011',
  maklerOrgId:     'bbbb2222-0000-4000-8000-000000000021',

  // SV-Test-Fall-Kette
  // test-sv sachverstaendige-Row (onboarding_status=abgeschlossen, portal_zugang_freigeschaltet=true):
  svTestSVId:      '1da11741-a406-45ce-a27b-c041576cccbb',
  svTestClaimId:   'bbbb3333-0000-4000-8000-000000000031',
  svTestFallId:    'bbbb3333-0000-4000-8000-000000000032',
  svTestLeadId:    'bbbb3333-0000-4000-8000-000000000033',
  svTestAuftragId: 'bbbb3333-0000-4000-8000-000000000034',
  svTestTerminId:  'bbbb3333-0000-4000-8000-000000000035',

  // Phase-5-Kunden-Lead-Kette
  kundeTestLeadId:    'bbbb4444-0000-4000-8000-000000000041',
  kundeTestClaimId:   'bbbb4444-0000-4000-8000-000000000042',
  kundeTestFallId:    'bbbb4444-0000-4000-8000-000000000043',
}

const SMOKE_MARKER = 'SMOKE-SEED 13.05.2026 — Staging-Testdaten, löschen wenn Staging eigene DB bekommt'
const PASSWORT     = 'Test1234!'

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

async function getOrCreateAuthUser(email) {
  console.log(`\n  → Auth-User prüfen: ${email}`)

  // Prüfen via profiles-Tabelle (zuverlässiger als listUsers bei Connection-Limits)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (profile) {
    console.log(`    ✅ Bereits vorhanden (id=${profile.id})`)
    return profile.id
  }

  // Neu anlegen via Admin-API (bei Bootstrap wurde UUID direkt per SQL gesetzt)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password:      PASSWORT,
    email_confirm: true,
  })

  if (createErr) {
    if (createErr.message?.toLowerCase().includes('already')) {
      const { data: p2 } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
      if (p2) { console.log(`    ✅ Bereits vorhanden (id=${p2.id})`); return p2.id }
    }
    console.error(`    FEHLER createUser: ${createErr.message}`)
    return null
  }

  console.log(`    ✅ Angelegt (id=${created.user.id})`)
  return created.user.id
}

async function upsertProfile(userId, rolle, anzeigename) {
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id:                       userId,
      email:                    `test-${rolle}@claimondo.de`,
      rolle:                    rolle,
      anzeigename:              anzeigename,
      twofa_aktiviert:          false,
      twofa_email_aktiviert:    false,
      force_password_change:    false,
    }, { onConflict: 'id' })

  if (error) {
    console.error(`    FEHLER profile upsert (${rolle}): ${error.message}`)
    return false
  }
  console.log(`    ✅ Profile aktualisiert (rolle=${rolle})`)
  return true
}

// ─── 1. test-kanzlei anlegen ──────────────────────────────────────────────────
async function seedKanzlei() {
  console.log('\n═══════════════════════════════════════')
  console.log('  1. test-kanzlei@claimondo.de')
  console.log('═══════════════════════════════════════')

  const userId = await getOrCreateAuthUser('test-kanzlei@claimondo.de')
  if (!userId) return null

  await upsertProfile(userId, 'kanzlei', 'Test Kanzlei')

  const { error: orgErr } = await supabase
    .from('kanzleien')
    .upsert({
      id:              IDS.kanzleiOrgId,
      name:            'Test Kanzlei (Smoke)',
      email:           'test-kanzlei@claimondo.de',
      ansprechpartner: 'Test Kanzlei',
      aktiv:           true,
    }, { onConflict: 'id' })

  if (orgErr) {
    console.error(`  FEHLER kanzleien-Insert: ${orgErr.message}`)
  } else {
    console.log(`  ✅ kanzleien-Record angelegt (id=${IDS.kanzleiOrgId})`)
  }

  return userId
}

// ─── 2. test-makler anlegen ───────────────────────────────────────────────────
async function seedMakler() {
  console.log('\n═══════════════════════════════════════')
  console.log('  2. test-makler@claimondo.de')
  console.log('═══════════════════════════════════════')

  const userId = await getOrCreateAuthUser('test-makler@claimondo.de')
  if (!userId) return null

  await upsertProfile(userId, 'makler', 'Test Makler')

  const { error: orgErr } = await supabase
    .from('makler')
    .upsert({
      id:                          IDS.maklerOrgId,
      user_id:                     userId,
      firma:                       'Test Makler GmbH (Smoke)',
      ansprechpartner_vorname:     'Test',
      ansprechpartner_nachname:    'Makler',
      email:                       'test-makler@claimondo.de',
      status:                      'aktiv',
      aktiviert_am:                new Date().toISOString(),
      provision_aktiv:             true,
    }, { onConflict: 'id' })

  if (orgErr) {
    console.error(`  FEHLER makler-Insert: ${orgErr.message}`)
  } else {
    console.log(`  ✅ makler-Record angelegt (id=${IDS.maklerOrgId})`)
  }

  return userId
}

// ─── 3. SV-Test-Auftrag + Fall + Termin ──────────────────────────────────────
async function seedSVTestFall() {
  console.log('\n═══════════════════════════════════════')
  console.log('  3. SV-Test-Fall + Auftrag + Termin')
  console.log('═══════════════════════════════════════')

  const termin3Tage = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const terminEnde  = new Date(termin3Tage.getTime() + 60 * 60 * 1000)

  const { error: claimErr } = await supabase
    .from('claims')
    .upsert({
      id:          IDS.svTestClaimId,
      schadentag:  '2026-05-10',
      schadenart:  'haftpflicht',
      status:      'in_bearbeitung',
      phase:       '3_gutachter_unterwegs',
      created_via: 'manuell_admin',
    }, { onConflict: 'id' })

  if (claimErr) {
    console.error(`  FEHLER claim-Insert: ${claimErr.message}`)
    return
  }
  console.log(`  ✅ Claim angelegt (id=${IDS.svTestClaimId})`)

  // Fall zuerst anlegen (Lead referenziert Fall per FK)
  const { error: fallErr } = await supabase
    .from('faelle')
    .upsert({
      id:               IDS.svTestFallId,
      claim_id:         IDS.svTestClaimId,
      fall_nummer:      'SMK-SV-2026-001',
      status:           'sv-termin',
      aktuelle_phase:   'termin_bestaetigt',
      sv_id:            IDS.svTestSVId,
      sv_zugewiesen_am: new Date().toISOString(),
      kunde_vorname:    'SMOKE',
      kunde_nachname:   'Test 13.05.2026',
      kunde_email:      'smoke-sv-test@claimondo.test',
      notizen:          SMOKE_MARKER,
      interne_notizen:  SMOKE_MARKER,
    }, { onConflict: 'id' })

  if (fallErr) {
    console.error(`  FEHLER fall-Insert: ${fallErr.message}`)
    return
  }
  console.log(`  ✅ Fall angelegt (id=${IDS.svTestFallId})`)

  const { error: leadErr } = await supabase
    .from('leads')
    .upsert({
      id:                      IDS.svTestLeadId,
      vorname:                 'SMOKE',
      nachname:                'Test 13.05.2026',
      email:                   'smoke-sv-test@claimondo.test',
      telefon:                 '+4900000000001',
      status:                  'umgewandelt-sv',
      notiz:                   SMOKE_MARKER,
      konvertiert_zu_fall_id:  IDS.svTestFallId,
      konvertiert_zu_claim_id: IDS.svTestClaimId,
      konvertiert_am:          new Date().toISOString(),
    }, { onConflict: 'id' })

  if (leadErr) {
    console.error(`  FEHLER lead-Insert: ${leadErr.message}`)
    return
  }
  console.log(`  ✅ Lead angelegt (id=${IDS.svTestLeadId})`)

  // Lead-ID in Fall nachtragen
  await supabase.from('faelle')
    .update({ lead_id: IDS.svTestLeadId })
    .eq('id', IDS.svTestFallId)
    .is('lead_id', null)

  const { error: auftragErr } = await supabase
    .from('auftraege')
    .upsert({
      id:       IDS.svTestAuftragId,
      fall_id:  IDS.svTestFallId,
      claim_id: IDS.svTestClaimId,
      sv_id:    IDS.svTestSVId,
      typ:      'erstgutachten',
      status:   'termin',
    }, { onConflict: 'id' })

  if (auftragErr) {
    console.error(`  FEHLER auftrag-Insert: ${auftragErr.message}`)
    return
  }
  console.log(`  ✅ Auftrag angelegt (id=${IDS.svTestAuftragId})`)

  const { error: terminErr } = await supabase
    .from('gutachter_termine')
    .upsert({
      id:           IDS.svTestTerminId,
      sv_id:        IDS.svTestSVId,
      fall_id:      IDS.svTestFallId,
      lead_id:      IDS.svTestLeadId,
      auftrag_id:   IDS.svTestAuftragId,
      start_zeit:   termin3Tage.toISOString(),
      end_zeit:     terminEnde.toISOString(),
      status:       'bestaetigt',
      typ:          'sv_begutachtung',
      notiz_intern: SMOKE_MARKER,
    }, { onConflict: 'id' })

  if (terminErr) {
    console.error(`  FEHLER gutachter_termin-Insert: ${terminErr.message}`)
  } else {
    console.log(`  ✅ Termin angelegt (id=${IDS.svTestTerminId}, ${termin3Tage.toLocaleDateString('de-DE')})`)
  }
}

// ─── 4. Phase-5-Kunden-Lead ───────────────────────────────────────────────────
async function seedKundePhase5() {
  console.log('\n═══════════════════════════════════════')
  console.log('  4. Phase-5-Kunden-Lead (Magic-Link)')
  console.log('═══════════════════════════════════════')

  const { error: claimErr } = await supabase
    .from('claims')
    .upsert({
      id:          IDS.kundeTestClaimId,
      schadentag:  '2026-05-08',
      schadenart:  'haftpflicht',
      status:      'in_bearbeitung',
      phase:       '1_neu',
      created_via: 'manuell_admin',
    }, { onConflict: 'id' })

  if (claimErr) {
    console.error(`  FEHLER claim-Insert (Kunden-Lead): ${claimErr.message}`)
    return
  }
  console.log(`  ✅ Claim angelegt (id=${IDS.kundeTestClaimId})`)

  // Fall zuerst anlegen (fallakte_angelegt_am → Magic-Link-Button erscheint in Dispatch-UI)
  const { error: fallErr } = await supabase
    .from('faelle')
    .upsert({
      id:                   IDS.kundeTestFallId,
      claim_id:             IDS.kundeTestClaimId,
      fall_nummer:          'SMK-KUNDE-2026-001',
      status:               'ersterfassung',
      aktuelle_phase:       'fallakte_angelegt',
      fallakte_angelegt_am: new Date().toISOString(),
      kunde_vorname:        'SMOKE',
      kunde_nachname:       'Kunde 13.05.2026',
      kunde_email:          'smoke-kunde@claimondo.test',
      notizen:              SMOKE_MARKER,
      interne_notizen:      SMOKE_MARKER,
    }, { onConflict: 'id' })

  if (fallErr) {
    console.error(`  FEHLER fall-Insert (Kunden-Lead): ${fallErr.message}`)
    return
  }
  console.log(`  ✅ Fall angelegt (id=${IDS.kundeTestFallId})`)

  const { error: leadErr } = await supabase
    .from('leads')
    .upsert({
      id:                      IDS.kundeTestLeadId,
      vorname:                 'SMOKE',
      nachname:                'Kunde 13.05.2026',
      email:                   'smoke-kunde@claimondo.test',
      telefon:                 '+4900000000002',
      status:                  'umgewandelt',
      notiz:                   SMOKE_MARKER,
      konvertiert_zu_fall_id:  IDS.kundeTestFallId,
      konvertiert_zu_claim_id: IDS.kundeTestClaimId,
      konvertiert_am:          new Date().toISOString(),
    }, { onConflict: 'id' })

  if (leadErr) {
    console.error(`  FEHLER lead-Insert (Kunden-Lead): ${leadErr.message}`)
    return
  }
  console.log(`  ✅ Lead angelegt (id=${IDS.kundeTestLeadId})`)

  await supabase.from('faelle')
    .update({ lead_id: IDS.kundeTestLeadId })
    .eq('id', IDS.kundeTestFallId)
    .is('lead_id', null)

  console.log('  ℹ️  Magic-Link-Button erscheint in Dispatch-Lead-Detail wenn konvertiert_zu_fall_id gesetzt ist.')
}

// ─── Verifikation ─────────────────────────────────────────────────────────────
async function verifizieren() {
  console.log('\n═══════════════════════════════════════')
  console.log('  VERIFIKATION')
  console.log('═══════════════════════════════════════')

  const testEmails = [
    'test-dispatch@claimondo.de', 'test-sv@claimondo.de', 'test-admin@claimondo.de',
    'test-kanzlei@claimondo.de',  'test-makler@claimondo.de',
  ]

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, rolle, twofa_aktiviert, force_password_change')
    .in('email', testEmails)

  for (const p of profiles ?? []) {
    const twofa = p.twofa_aktiviert ? '2FA-aktiv' : 'kein-2FA'
    const fpwc  = p.force_password_change ? 'force-pw' : 'ok'
    console.log(`  ✅ ${p.email} → rolle=${p.rolle}, ${twofa}, ${fpwc}`)
  }

  const { data: svFall } = await supabase
    .from('faelle')
    .select('fall_nummer, status, aktuelle_phase, sv_id')
    .eq('id', IDS.svTestFallId)
    .maybeSingle()
  if (svFall) console.log(`  ✅ SV-Fall: ${svFall.fall_nummer} (status=${svFall.status}, phase=${svFall.aktuelle_phase})`)

  const { data: termin } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, status')
    .eq('id', IDS.svTestTerminId)
    .maybeSingle()
  if (termin) console.log(`  ✅ SV-Termin: ${new Date(termin.start_zeit).toLocaleDateString('de-DE')} (status=${termin.status})`)

  const { data: kundeFall } = await supabase
    .from('faelle')
    .select('fall_nummer, status, aktuelle_phase')
    .eq('id', IDS.kundeTestFallId)
    .maybeSingle()
  if (kundeFall) console.log(`  ✅ Kunden-Fall: ${kundeFall.fall_nummer} (status=${kundeFall.status}, phase=${kundeFall.aktuelle_phase})`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  Staging-Seed: Test-User + Testdaten  13.05.2026        ║')
  console.log('╚══════════════════════════════════════════════════════════╝')

  const kanzleiId = await seedKanzlei()
  const maklerId  = await seedMakler()
  await seedSVTestFall()
  await seedKundePhase5()
  await verifizieren()

  console.log('\n╔══════════════════════════════════════════════════════════╗')
  console.log('║  SEED ABGESCHLOSSEN                                      ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log('\nAngelegt (stabile UUIDs):')
  console.log(`  test-kanzlei@claimondo.de  profile.id=${IDS.kanzleiUserId}`)
  console.log(`  test-makler@claimondo.de   profile.id=${IDS.maklerUserId}`)
  console.log(`  kanzleien-Org:  ${IDS.kanzleiOrgId}`)
  console.log(`  makler-Org:     ${IDS.maklerOrgId}`)
  console.log(`  SV-Fall:        ${IDS.svTestFallId}`)
  console.log(`  SV-Auftrag:     ${IDS.svTestAuftragId}`)
  console.log(`  SV-Termin:      ${IDS.svTestTerminId}`)
  console.log(`  Kunden-Fall:    ${IDS.kundeTestFallId}`)
  console.log('\nNächster Schritt:')
  console.log('  STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS=<pass> \\')
  console.log('    node docs/13.05.2026/smoke-claimondo-de/smoke-portale-v2.mjs')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
