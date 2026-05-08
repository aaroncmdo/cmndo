/**
 * e2e-seed-fixtures.mjs — E2E-Smoke-Test Fixture-Seeder
 *
 * Erzeugt die fixen Test-Vorlagen die für jeden E2E-Run benötigt werden.
 * Idempotent: prüft vor jedem Insert ob bereits Daten existieren.
 *
 * Was dieses Skript erzeugt:
 *  1. Lead A — Direkter Webform-Lead (kein Partner, kein Makler)
 *  2. Lead B — Maik-Partner-Lead (source_channel='maik_partner'; Makler-Eintrag wird
 *              ggf. automatisch angelegt)
 *  3. tmp/e2e-lexdrive-payload.json — Sample-Payload für Phase 12
 *
 * Schema-Hinweis:
 *  - leads hat KEIN partner_id-Feld; der Maik-Pfad läuft über source_channel='maik_partner'
 *    und (optional) promotion_code_id aus der makler-Tabelle.
 *  - leads.status ist ein Enum: 'neu'|'rueckruf'|'quali-offen'|... 'neu' ist kein gültiger Wert!
 *    Wir verwenden 'quali-offen' als nächsten verarbeitbaren Status nach Lead-Eingang.
 *  - Kunde-Koordinaten werden direkt in leads.kunde_lat/lng gesetzt (keine separate kunden-Tabelle).
 *
 * Geo-Referenzpunkte:
 *  - Kunde-Wohnort:   Düsseldorf-Bilk       (51.2024, 6.7818)
 *  - Unfallort:       Köln-Innenstadt       (50.9375, 6.9603)
 *  - SV-Origin:       Mediapark Köln        (50.9522, 6.9430)
 *
 * Wann ausführen:
 *  Nach e2e-reset.mjs, vor dem Smoke-Run:
 *    node scripts/e2e-reset.mjs && node scripts/e2e-seed-fixtures.mjs
 */

import { createRequire } from 'module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// --- ENV laden aus .env.local -------------------------------------------
function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) {
    console.error('[FEHLER] .env.local nicht gefunden unter:', envPath)
    process.exit(1)
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

ladeEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FEHLER] NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// --- Geo-Konstanten -------------------------------------------------------

const GEO = {
  kunde: { lat: 51.2024, lng: 6.7818, stadt: 'Düsseldorf', plz: '40227', adresse: 'Friedrichstraße 40, 40217 Düsseldorf' },
  unfall: { lat: 50.9375, lng: 6.9603, adresse: 'Neumarkt, 50667 Köln', plz: '50667' },
  sv:     { lat: 50.9522, lng: 6.9430, adresse: 'Mediapark, 50670 Köln', plz: '50670' },
}

// --- Hilfsfunktionen ------------------------------------------------------

function log(msg) {
  console.log(`[seed] ${msg}`)
}

function logFehler(kontext, err) {
  console.error(`[seed][FEHLER] ${kontext}:`, err?.message ?? err)
}

async function holeTestUserId(email) {
  const { data, error } = await db
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  if (error) {
    logFehler(`profiles-Abfrage (${email})`, error)
    return null
  }
  return data?.id ?? null
}

// --- SV-Eintrag für test-sv ----------------------------------------------

async function seedSvEintrag(svProfileId) {
  if (!svProfileId) {
    log('WARNUNG: kein test-sv-Profile, sachverstaendige-Row wird übersprungen')
    return null
  }

  // Idempotenz: existiert schon ein sachverstaendige-Eintrag mit diesem profile_id?
  const { data: vorhanden } = await db
    .from('sachverstaendige')
    .select('id, profile_id, ist_aktiv')
    .eq('profile_id', svProfileId)
    .limit(1)
    .maybeSingle()

  if (vorhanden) {
    log(`SV-Eintrag bereits vorhanden: ${vorhanden.id} (profile_id=${svProfileId})`)
    // Sicherstellen dass aktiv + verifiziert
    await db
      .from('sachverstaendige')
      .update({
        ist_aktiv: true,
        verifiziert: true,
        verifizierung_status: 'verifiziert',
        portal_zugang_freigeschaltet: true,
        standort_lat: GEO.sv.lat,
        standort_lng: GEO.sv.lng,
        standort_adresse: GEO.sv.adresse,
        standort_plz: GEO.sv.plz,
      })
      .eq('id', vorhanden.id)
    return vorhanden.id
  }

  // Neu anlegen — minimale Pflicht-Felder
  const { data, error } = await db
    .from('sachverstaendige')
    .insert({
      profile_id: svProfileId,
      ist_aktiv: true,
      verifiziert: true,
      verifizierung_status: 'verifiziert',
      portal_zugang_freigeschaltet: true,
      standort_lat: GEO.sv.lat,
      standort_lng: GEO.sv.lng,
      standort_adresse: GEO.sv.adresse,
      standort_plz: GEO.sv.plz,
      gebiet_plz: ['50667', '50670', '50672', '50674'],
      paket: 'starter',
      gutachter_typ: 'kfz',
      kalender_typ: 'kein',
      kalender_sync_aktiv: false,
      ist_parent_account: true,
      onboarding_status: 'abgeschlossen',
      vertrag_unterschrieben: true,
      vertrag_unterschrieben_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    logFehler('SV-Eintrag Insert', error)
    return null
  }
  log(`SV-Eintrag neu angelegt: ${data.id}`)
  return data.id
}

// --- Lead A: Direkter Webform-Lead ---------------------------------------

async function seedLeadDirekt(kundeId) {
  // Idempotenz: Schauen ob schon ein Direkt-Test-Lead für diesen Smoke existiert
  const { data: vorhandene } = await db
    .from('leads')
    .select('id, quelle, source_channel')
    .eq('email', 'test-kunde@claimondo.de')
    .eq('source_channel', 'webform_direkt')
    .limit(1)

  if (vorhandene && vorhandene.length > 0) {
    log(`Lead A (Direkt-Webform) bereits vorhanden: ${vorhandene[0].id}`)
    return vorhandene[0].id
  }

  const { data, error } = await db
    .from('leads')
    .insert({
      // Kern-Felder
      vorname: 'Lisa',
      nachname: 'Mueller',
      email: 'test-kunde@claimondo.de',
      telefon: '+4915199990001',
      // Quelle-Markierung: source_channel ist das korrekte Feld in leads
      // (leads hat kein 'quelle'-Spalte — nur source_channel)
      source_channel: 'webform_direkt',
      // Status: 'quali-offen' = erster verarbeitbarer Status nach Lead-Eingang
      // Hinweis: 'neu' ist KEIN gültiger Enum-Wert in leads.status — wir nutzen 'quali-offen'
      status: 'quali-offen',
      // Kunde-Koordinaten (Düsseldorf-Bilk)
      kunde_lat: GEO.kunde.lat,
      kunde_lng: GEO.kunde.lng,
      kunde_adresse: GEO.kunde.adresse,
      kunde_plz: GEO.kunde.plz,
      kunde_stadt: GEO.kunde.stadt,
      // Unfall-Standort (Köln-Innenstadt) — in leads als besichtigungsort
      besichtigungsort_adresse: GEO.unfall.adresse,
      besichtigungsort_lat: GEO.unfall.lat,
      besichtigungsort_lng: GEO.unfall.lng,
      unfallort: GEO.unfall.adresse,
      unfallort_lat: GEO.unfall.lat,
      unfallort_lng: GEO.unfall.lng,
      // Schaden-Basics
      schadens_art: 'unfall',
      service_typ: 'nur_gutachter',
      sachschaden_flag: true,
      // 2026-05-08: Hard-Gate-Felder für Phase 2 (Dispatch-SV-Suche).
      // Dispatch-SV-Panel rendert den "Gutachter suchen"-Button nur wenn
      // qualification-engine q1+q2+q3 alle true sind:
      //   q1 = unfallhergang gesetzt + schuldfrage != eigenverantwortung
      //   q2 = schaden_sichtbar=true (oder ein Indikator-Flag)
      //   q3 = polizei_vor_ort explizit gesetzt (true oder false, nicht null)
      // Dazu setzen wir auch q4 (schadentyp) damit der Lead realistisch ist.
      unfallhergang: 'Auffahrunfall auf der Inneren Kanalstraße in Köln. Unfallgegner hat nicht rechtzeitig gebremst, Heck am Test-Fahrzeug stark beschädigt.',
      schuldfrage: 'gegner',
      schaden_sichtbar: true,
      polizei_vor_ort: false,
      schadentyp: 'auffahrunfall',
      // Kunden-ID setzen falls bekannt
      ...(kundeId ? { kunde_id: kundeId } : {}),
    })
    .select('id')
    .single()

  if (error) {
    logFehler('Lead A Insert', error)
    return null
  }
  log(`Lead A (Direkt-Webform) erstellt: ${data.id}`)
  return data.id
}

// --- Maik-Makler-Eintrag holen oder anlegen ------------------------------

async function holeMaikMakler() {
  // Suche nach bestehendem Test-Makler "Maik"
  const { data: vorhandene } = await db
    .from('makler')
    .select('id, firma, email')
    .eq('email', 'maik-test@claimondo-partner.de')
    .limit(1)

  if (vorhandene && vorhandene.length > 0) {
    log(`Makler "Maik" bereits vorhanden: ${vorhandene[0].id} (${vorhandene[0].firma})`)
    return vorhandene[0].id
  }

  // Neu anlegen
  const { data, error } = await db
    .from('makler')
    .insert({
      firma: 'Maik Reklame GmbH (Test)',
      ansprechpartner_vorname: 'Maik',
      ansprechpartner_nachname: 'TestPartner',
      email: 'maik-test@claimondo-partner.de',
      telefon: '+4915100000099',
      status: 'aktiv',
      provision_aktiv: true,
      provision_betrag_komplett_netto: 150,
      provision_betrag_nur_gutachter_netto: 80,
    })
    .select('id')
    .single()

  if (error) {
    logFehler('Makler "Maik" Insert', error)
    return null
  }
  log(`Makler "Maik" angelegt: ${data.id}`)
  return data.id
}

// --- Lead B: Maik-Partner-Lead ------------------------------------------

async function seedLeadMaik(kundeId, maikMaklerId) {
  // Idempotenz-Check
  const { data: vorhandene } = await db
    .from('leads')
    .select('id, source_channel')
    .eq('email', 'test-kunde@claimondo.de')
    .eq('source_channel', 'maik_partner')
    .limit(1)

  if (vorhandene && vorhandene.length > 0) {
    log(`Lead B (Maik-Partner) bereits vorhanden: ${vorhandene[0].id}`)
    return vorhandene[0].id
  }

  const { data, error } = await db
    .from('leads')
    .insert({
      // Kern-Felder
      vorname: 'Lisa',
      nachname: 'Mueller',
      email: 'test-kunde@claimondo.de',
      telefon: '+4915199990001',
      // Maik-Partner-Markierung: source_channel statt partner_id
      // (leads-Schema hat kein partner_id-Feld; Maik-Pfad über source_channel + makler-Tabelle)
      source_channel: 'maik_partner',
      // Status
      status: 'quali-offen',
      // Geo: Kunde Düsseldorf-Bilk
      kunde_lat: GEO.kunde.lat,
      kunde_lng: GEO.kunde.lng,
      kunde_adresse: GEO.kunde.adresse,
      kunde_plz: GEO.kunde.plz,
      kunde_stadt: GEO.kunde.stadt,
      // Unfall: Köln-Innenstadt
      besichtigungsort_adresse: GEO.unfall.adresse,
      besichtigungsort_lat: GEO.unfall.lat,
      besichtigungsort_lng: GEO.unfall.lng,
      unfallort: GEO.unfall.adresse,
      unfallort_lat: GEO.unfall.lat,
      unfallort_lng: GEO.unfall.lng,
      // Schaden-Basics
      schadens_art: 'unfall',
      service_typ: 'komplett',
      sachschaden_flag: true,
      // Hard-Gate-Felder (siehe Lead A) — derselbe Realismus für Lead B
      unfallhergang: 'Auffahrunfall auf der Inneren Kanalstraße in Köln. Unfallgegner hat nicht rechtzeitig gebremst, Heck am Test-Fahrzeug stark beschädigt.',
      schuldfrage: 'gegner',
      schaden_sichtbar: true,
      polizei_vor_ort: false,
      schadentyp: 'auffahrunfall',
      // Kunden-ID
      ...(kundeId ? { kunde_id: kundeId } : {}),
    })
    .select('id')
    .single()

  if (error) {
    logFehler('Lead B (Maik) Insert', error)
    return null
  }
  log(`Lead B (Maik-Partner) erstellt: ${data.id}`)

  // Provisions-Eintrag in provisionen_maik anlegen (Smoke-Prüfpunkt Phase 11)
  if (maikMaklerId) {
    const heute = new Date()
    const monat = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-01`
    const { error: provErr } = await db
      .from('provisionen_maik')
      .insert({
        lead_id: data.id,
        monat,
        basis_provision: 150,
        source_channel: 'maik_partner',
        // Gültige Werte laut DB-Constraint: 'pending' | 'paid' | 'reversed'
        status: 'pending',
      })
    if (provErr) log(`WARNUNG provisionen_maik Insert: ${provErr.message}`)
    else log(`Provisions-Eintrag (Maik, 150 EUR) für Lead B angelegt`)
  }

  return data.id
}

// --- LexDrive-Webhook-Payload als JSON-Datei erstellen ------------------

function erstelleLexDrivePayload(fallNrPlatzhalter) {
  // Shape entspricht ProcessEventInput aus src/lib/lexdrive/process-event.ts
  const payload = {
    _hinweis: 'Beispiel-Payload für Phase 12. fallId + fallNr VOR Ausführung ersetzen.',
    // ProcessEventInput-Felder:
    fallId: 'BITTE_ERSETZEN_MIT_ECHTER_FALL_ID',
    fallNr: fallNrPlatzhalter ?? 'CLM-2026-E2E-001',
    eventType: 'vollmacht_bestaetigt',
    payload: {
      datum: new Date().toISOString(),
      beschreibung: 'E2E-Smoke-Test: Vollmacht über LexDrive-Webhook bestätigt',
    },
    // Idempotenz-Key: bei echtem Webhook von LexDrive vergeben; bei Test eigener Key
    externalEventId: `e2e-smoke-${randomUUID()}`,
    source: 'webhook',
  }

  // Alternative Payloads für weitere Event-Typen die in Phase 12 gebraucht werden:
  const alternativeEvents = [
    {
      label: 'as_versendet',
      eventType: 'as_versendet',
      payload: { datum: new Date().toISOString(), beschreibung: 'Anschlussschreiben versandt (Smoke-Test)' },
    },
    {
      label: 'zahlung_eingegangen',
      eventType: 'zahlung_eingegangen',
      payload: {
        datum: new Date().toISOString(),
        betrag: 3500,
        zahlungsweg: 'ueberweisung',
        beschreibung: 'Vollständige Zahlung eingegangen (Smoke-Test)',
      },
    },
    {
      label: 'vs_kuerzt',
      eventType: 'vs_kuerzt',
      payload: {
        datum: new Date().toISOString(),
        kuerzungs_betrag: 800,
        anerkannt_betrag: 2700,
        grund: 'Technische Einwendung zu Schaden-Position 3',
        vs_kuerzungs_typ: 'technisch',
      },
    },
    {
      label: 'fall_geschlossen',
      eventType: 'fall_geschlossen',
      payload: {
        datum: new Date().toISOString(),
        grund: 'Regulierung abgeschlossen — E2E-Smoke',
      },
    },
  ]

  return { primary: payload, alternativeEvents }
}

async function schreibeLexDrivePayload() {
  const tmpDir = join(projectRoot, 'tmp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const outPath = join(tmpDir, 'e2e-lexdrive-payload.json')
  const data = erstelleLexDrivePayload('CLM-2026-E2E-001')
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8')
  log(`LexDrive-Payload geschrieben: tmp/e2e-lexdrive-payload.json`)
  log(`  -> eventType: ${data.primary.eventType}`)
  log(`  -> ${data.alternativeEvents.length} Alternative Events enthalten`)
  return outPath
}

// --- Zusammenfassung in tmp/e2e-fixture-ids.json speichern -------------

async function schreibeFixtureIds(ids) {
  const tmpDir = join(projectRoot, 'tmp')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const outPath = join(tmpDir, 'e2e-fixture-ids.json')
  writeFileSync(outPath, JSON.stringify(ids, null, 2), 'utf-8')
  log(`Fixture-IDs gespeichert: tmp/e2e-fixture-ids.json`)
}

// --- Haupt-Seeder -------------------------------------------------------

async function main() {
  log('=== E2E-Seeder gestartet ===')

  // Test-User IDs ermitteln
  const kundeId = await holeTestUserId('test-kunde@claimondo.de')
  if (!kundeId) {
    log('WARNUNG: test-kunde@claimondo.de nicht in auth.users gefunden — Leads werden ohne kunde_id erstellt')
  } else {
    log(`Kunde-ID: ${kundeId}`)
  }

  // SV-Profile holen + sachverstaendige-Eintrag sicherstellen
  const svProfileId = await holeTestUserId('test-sv@claimondo.de')
  if (svProfileId) {
    log(`SV-Profile-ID: ${svProfileId}`)
    await seedSvEintrag(svProfileId)
  } else {
    log('WARNUNG: test-sv@claimondo.de nicht in profiles gefunden')
  }

  // Makler "Maik" holen oder anlegen
  const maikId = await holeMaikMakler()

  // Leads erstellen
  const leadAId = await seedLeadDirekt(kundeId)
  const leadBId = await seedLeadMaik(kundeId, maikId)

  // LexDrive-Payload schreiben
  await schreibeLexDrivePayload()

  // Fixture-IDs für nachfolgende Skripte speichern
  await schreibeFixtureIds({
    erzeugt_am: new Date().toISOString(),
    kunde_user_id: kundeId,
    maik_makler_id: maikId,
    lead_direkt_id: leadAId,
    lead_maik_id: leadBId,
    geo: GEO,
    hinweis_status: [
      'leads.status=quali-offen (nicht neu — Enum erlaubt nur: neu|rueckruf|quali-offen|flow-gesendet|umgewandelt|umgewandelt-sv|disqualifiziert|kalt)',
      'Maik-Pfad über source_channel=maik_partner (kein partner_id-Feld in leads)',
      'kunden-Tabelle existiert nicht separat — Koordinaten in leads.kunde_lat/lng',
    ],
  })

  log('')
  log('=== Seed abgeschlossen ===')
  log(`Lead A (Direkt):  ${leadAId ?? 'FEHLER'}`)
  log(`Lead B (Maik):    ${leadBId ?? 'FEHLER'}`)
  log(`Makler Maik-ID:   ${maikId ?? 'FEHLER'}`)
  log('LexDrive-Payload: tmp/e2e-lexdrive-payload.json')
  log('Fixture-IDs:      tmp/e2e-fixture-ids.json')
  process.exit(0)
}

main().catch(err => {
  console.error('[KRITISCH] Unerwarteter Fehler:', err?.message ?? err)
  process.exit(1)
})
