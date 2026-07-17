/**
 * e2e-reset.mjs — E2E-Smoke-Test Reset-Skript
 *
 * Setzt die Test-Umgebung auf einen sauberen Start-Zustand zurück.
 * Idempotent: mehrfaches Ausführen führt immer zum gleichen Ergebnis.
 *
 * Was dieses Skript tut:
 *  1. Lädt ENV-Variablen aus .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *  2. Ermittelt die UUIDs der 5 Test-User über auth.admin.listUsers
 *  3. Löscht alle abhängigen Daten dieser User (Leads, Aufträge, Fälle usw.)
 *  4. Setzt 2FA-Flags auf false, force_password_change auf false
 *  5. Setzt Standort-Defaults für SV (Mediapark Köln) und Profil-Koordinaten für Kunde
 *  6. Setzt sv_tages_session auf status=idle
 *
 * Wann ausführen:
 *  Vor jedem E2E-Full-Run: node scripts/e2e-reset.mjs
 *  Oder nach einem Hard-Blocker-Fix bevor der Run neu startet.
 *
 * Voraussetzung: .env.local enthält NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY
 */

import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

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

// --- Konfiguration -------------------------------------------------------

const TEST_EMAILS = [
  'test-kunde@claimondo.de',
  'test-sv@claimondo.de',
  'test-dispatch@claimondo.de',
  'test-admin@claimondo.de',
  'test-kb@claimondo.de',
]

// Standort: Mediapark Köln (SV-Origin)
const SV_STANDORT = { lat: 50.9522, lng: 6.9430, adresse: 'Mediapark, 50670 Köln' }

// Standort: Düsseldorf-Bilk (Kunde)
const KUNDE_STANDORT = { lat: 51.2024, lng: 6.7818 }

// --- Hilfsfunktionen -----------------------------------------------------

function log(msg) {
  console.log(`[reset] ${msg}`)
}

function logFehler(kontext, err) {
  console.error(`[reset][FEHLER] ${kontext}:`, err?.message ?? err)
}

async function holeTestUserIds() {
  // Über profiles-Tabelle ermitteln (auth.admin.listUsers braucht Admin-DB-Zugriff
  // der auf manchen Supabase-Plänen limitiert ist; profiles ist zuverlässiger)
  const { data, error } = await db
    .from('profiles')
    .select('id, email')
    .in('email', TEST_EMAILS)
  if (error) {
    logFehler('profiles-Abfrage für Test-User', error)
    process.exit(1)
  }
  const gefunden = data ?? []
  const ids = gefunden.map(u => u.id)
  const emailZuId = Object.fromEntries(gefunden.map(u => [u.email, u.id]))
  log(`Test-User gefunden: ${gefunden.length}/${TEST_EMAILS.length}`)
  const fehlend = TEST_EMAILS.filter(e => !emailZuId[e])
  if (fehlend.length > 0) {
    log(`WARNUNG: Test-User fehlen in profiles: ${fehlend.join(', ')}`)
    log('Nur vorhandene User werden resettet.')
  }
  return { ids, emailZuId }
}

async function leereTabellePerUserId(tabelle, spalte, ids) {
  if (ids.length === 0) return
  const { error, count } = await db
    .from(tabelle)
    .delete({ count: 'exact' })
    .in(spalte, ids)
  if (error) {
    // Tabelle existiert möglicherweise nicht oder Spalte heißt anders — nur warnen
    log(`WARNUNG ${tabelle}.${spalte}: ${error.message} (übersprungen)`)
    return 0
  }
  log(`${tabelle} geleert: ${count ?? '?'} rows`)
  return count ?? 0
}

async function leereTabellePerFallIds(tabelle, spalte, fallIds) {
  if (fallIds.length === 0) return
  const { error, count } = await db
    .from(tabelle)
    .delete({ count: 'exact' })
    .in(spalte, fallIds)
  if (error) {
    log(`WARNUNG ${tabelle}.${spalte}: ${error.message} (übersprungen)`)
    return 0
  }
  log(`${tabelle} (via Fall-IDs) geleert: ${count ?? '?'} rows`)
  return count ?? 0
}

// --- Haupt-Reset ---------------------------------------------------------

async function main() {
  log('=== E2E-Reset gestartet ===')

  const { ids: userIds, emailZuId } = await holeTestUserIds()
  if (userIds.length === 0) {
    log('Keine Test-User gefunden — nichts zu resetten.')
    process.exit(0)
  }

  const svId = emailZuId['test-sv@claimondo.de']
  const kundeId = emailZuId['test-kunde@claimondo.de']

  // --- 1. Claims + Leads der Test-User ermitteln (claim-native; `faelle` ist seit
  //        CMM-49 GEDROPPT — claims ist die SSoT, fall_id == claim_id). -----------
  // SV-Seite: claims.sv_id referenziert sachverstaendige.id (NICHT profile.id) — erst die
  // sachverstaendige-Rows der Test-SV-Profile aufloesen. Kunde-Seite: claims via lead_id der
  // Test-Kunde-Leads (claims hat kein kunde_id; der Kunde haengt am Lead).
  const { data: svRows } = await db
    .from('sachverstaendige')
    .select('id')
    .in('profile_id', userIds)
  const svSachvIds = (svRows ?? []).map(s => s.id)

  const { data: leads } = await db
    .from('leads')
    .select('id')
    .in('kunde_id', userIds)
  const leadIds = (leads ?? []).map(l => l.id)
  log(`Leads gefunden: ${leadIds.length}`)

  const claimOrFilter = []
  if (svSachvIds.length > 0) claimOrFilter.push(`sv_id.in.(${svSachvIds.join(',')})`)
  if (leadIds.length > 0) claimOrFilter.push(`lead_id.in.(${leadIds.join(',')})`)
  let claimIds = []
  if (claimOrFilter.length > 0) {
    const { data: claims } = await db.from('claims').select('id').or(claimOrFilter.join(','))
    claimIds = (claims ?? []).map(c => c.id)
  }
  log(`Claims gefunden: ${claimIds.length}`)

  // --- 2. Kind-Tabellen leeren — claim_id-nativ (praktisch alle Kind-Tabellen tragen
  //        claim_id; KEIN FK auf das gedroppte faelle -> explizit vor claims loeschen.
  //        task_reminders/claim_parties/claim_vehicle_involvements CASCADEn via FK). --
  if (claimIds.length > 0) {
    for (const tabelle of [
      'timeline', 'gutachter_termine', 'sla_tracking', 'webhook_events', 'vs_korrespondenz',
      'tasks', 'nachrichten', 'email_log', 'fall_read_state', 'fall_summaries', 'fall_dokumente',
      'gutachten_fotos', 'gutachten_positionen', 'phase_transitions', 'kanzlei_faelle', 'qc_checkliste',
    ]) {
      await leereTabellePerFallIds(tabelle, 'claim_id', claimIds)
    }
  }

  // Auftraege (claim-nativ) + deren Kinder
  let auftragIds = []
  if (claimIds.length > 0) {
    const { data: auftraege } = await db.from('auftraege').select('id').in('claim_id', claimIds)
    auftragIds = (auftraege ?? []).map(a => a.id)
  }
  log(`Auftraege gefunden: ${auftragIds.length}`)
  if (auftragIds.length > 0) {
    await leereTabellePerFallIds('pflichtdokumente', 'auftrag_id', auftragIds)
    await leereTabellePerFallIds('dokument_upload_anfragen', 'auftrag_id', auftragIds)
    await leereTabellePerFallIds('auftraege', 'id', auftragIds)
  }

  // --- 3. Claims + Bridge loeschen (claims = SSoT; claim_parties/_vehicle_involvements
  //        CASCADEn via FK auf claims). Bridge zuerst (claim_id-FK-Kind). ------------
  if (claimIds.length > 0) {
    await leereTabellePerFallIds('faelle_claim_bridge', 'claim_id', claimIds)
    const { error, count } = await db
      .from('claims')
      .delete({ count: 'exact' })
      .in('id', claimIds)
    if (error) log(`WARNUNG claims: ${error.message}`)
    else log(`claims geleert: ${count ?? '?'} rows`)
  }

  // Leads und abhängige Tabellen
  if (leadIds.length > 0) {
    await leereTabellePerFallIds('lead_historie', 'lead_id', leadIds)
    await leereTabellePerFallIds('gutachter_termine', 'lead_id', leadIds)
    await leereTabellePerFallIds('nachrichten', 'lead_id', leadIds)
    await leereTabellePerFallIds('email_log', 'lead_id', leadIds)
    await leereTabellePerFallIds('makler_provisionen', 'lead_id', leadIds)
    const { error, count } = await db
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', leadIds)
    if (error) log(`WARNUNG leads: ${error.message}`)
    else log(`leads geleert: ${count ?? '?'} rows`)
  }

  // Mitteilungen der Test-User
  await leereTabellePerUserId('mitteilungen', 'empfaenger_id', userIds)

  // Abrechnungen (empfaenger_id)
  await leereTabellePerUserId('abrechnungen', 'empfaenger_id', userIds)

  // Gutachter-Abrechnungen
  if (svId) {
    const { data: gutAbrech } = await db
      .from('gutachter_abrechnungen')
      .select('id')
      .eq('sv_id', svId)
    const gutAbrIds = (gutAbrech ?? []).map(r => r.id)
    if (gutAbrIds.length > 0) {
      await leereTabellePerFallIds('gutachter_abrechnungspositionen', 'abrechnung_id', gutAbrIds)
    }
    await leereTabellePerUserId('gutachter_abrechnungen', 'sv_id', [svId])
    await leereTabellePerUserId('gutachter_monatsabrechnungen', 'sv_id', [svId])
  }

  // SV-Tages-Session
  if (svId) {
    const { error: sesErr, count: sesCnt } = await db
      .from('sv_tages_session')
      .delete({ count: 'exact' })
      .eq('sv_id', svId)
    if (sesErr) log(`WARNUNG sv_tages_session: ${sesErr.message}`)
    else log(`sv_tages_session geleert: ${sesCnt ?? '?'} rows`)
  }

  // Lexdrive-Events (falls welche für Test-Fälle existierten)
  if (fallIds.length > 0) {
    await leereTabellePerFallIds('webhook_events', 'fall_id', fallIds)
  }

  // --- 4. 2FA-Flags zurücksetzen -----------------------------------------
  const { error: profErr, count: profCount } = await db
    .from('profiles')
    .update({
      twofa_aktiviert: false,
      twofa_email_aktiviert: false,
      force_password_change: false,
    }, { count: 'exact' })
    .in('id', userIds)
  if (profErr) logFehler('profiles 2FA-Reset', profErr)
  else log(`profiles 2FA-Flags zurückgesetzt: ${profCount ?? '?'} rows`)

  // --- 5. SV-Standort setzen (Mediapark Köln) ----------------------------
  if (svId) {
    // Sachverstaendige-Eintrag über profile_id finden und updaten
    const { data: svRow } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', svId)
      .maybeSingle()

    if (svRow) {
      const { error: svErr } = await db
        .from('sachverstaendige')
        .update({
          standort_lat: SV_STANDORT.lat,
          standort_lng: SV_STANDORT.lng,
          standort_adresse: SV_STANDORT.adresse,
        })
        .eq('id', svRow.id)
      if (svErr) logFehler('sachverstaendige Standort', svErr)
      else log(`SV-Standort gesetzt: ${SV_STANDORT.adresse} (${SV_STANDORT.lat}, ${SV_STANDORT.lng})`)

      // Frische SV-Tages-Session anlegen (idle, kein Termin)
      const heute = new Date().toISOString().slice(0, 10)
      const { error: sessErr } = await db
        .from('sv_tages_session')
        .upsert({
          sv_id: svRow.id,
          datum: heute,
          status: 'idle',
          aktueller_termin_id: null,
          reihenfolge_termin_ids: [],
          started_at: null,
          paused_at: null,
          completed_at: null,
        }, { onConflict: 'sv_id,datum' })
      if (sessErr) logFehler('sv_tages_session upsert', sessErr)
      else log(`sv_tages_session auf idle gesetzt (datum=${heute})`)
    } else {
      log('WARNUNG: Kein sachverstaendige-Eintrag für test-sv gefunden (noch kein Onboarding?)')
    }
  }

  // --- 6. Kunde-Koordinaten setzen (Düsseldorf-Bilk im Profil) -----------
  if (kundeId) {
    // Es gibt keine separate kunden-Tabelle — Koordinaten liegen in leads.kunde_lat/lng
    // und in kunden.standort_lat/lng falls die Tabelle existiert.
    // Sicherheitshalber prüfen ob 'kunden' als Tabelle existiert:
    const { error: kundenCheckErr } = await db
      .from('kunden')
      .select('id')
      .eq('profil_id', kundeId)
      .limit(1)
    if (!kundenCheckErr) {
      const { error: kundenUpdErr } = await db
        .from('kunden')
        .update({ standort_lat: KUNDE_STANDORT.lat, standort_lng: KUNDE_STANDORT.lng })
        .eq('profil_id', kundeId)
      if (kundenUpdErr) log(`WARNUNG kunden Standort: ${kundenUpdErr.message}`)
      else log(`Kunde-Standort gesetzt: Düsseldorf-Bilk (${KUNDE_STANDORT.lat}, ${KUNDE_STANDORT.lng})`)
    } else {
      log(`INFO: kunden-Tabelle nicht gefunden oder kein Eintrag für test-kunde (Koordinaten werden beim Seeding in leads gesetzt)`)
    }
  }

  // --- 7. Abschluss-Status ------------------------------------------------
  log('=== Reset abgeschlossen ===')
  process.exit(0)
}

main().catch(err => {
  console.error('[KRITISCH] Unerwarteter Fehler:', err?.message ?? err)
  process.exit(1)
})
