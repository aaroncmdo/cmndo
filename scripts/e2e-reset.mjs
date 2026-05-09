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

  // --- 1. Fälle der Test-User ermitteln (für kaskadierte Löschungen) -----
  const { data: faelle } = await db
    .from('faelle')
    .select('id')
    .or(`kunde_id.in.(${userIds.join(',')}),sv_id.in.(${userIds.join(',')})`)
  const fallIds = (faelle ?? []).map(f => f.id)
  log(`Fälle gefunden: ${fallIds.length}`)

  // --- 2. Leads der Test-User ermitteln -----------------------------------
  const { data: leads } = await db
    .from('leads')
    .select('id')
    .in('kunde_id', userIds)
  const leadIds = (leads ?? []).map(l => l.id)
  log(`Leads gefunden: ${leadIds.length}`)

  // --- 3. Tabelleninhalt leeren (Reihenfolge: erst Kinder, dann Eltern) --

  // Dokumente (FK auf Auftrag / Fall)
  if (fallIds.length > 0) {
    await leereTabellePerFallIds('dokumente', 'fall_id', fallIds)
    await leereTabellePerFallIds('timeline', 'fall_id', fallIds)
    await leereTabellePerFallIds('gutachter_termine', 'fall_id', fallIds)
    await leereTabellePerFallIds('sla_tracking', 'fall_id', fallIds)
    await leereTabellePerFallIds('webhook_events', 'fall_id', fallIds)
    await leereTabellePerFallIds('vs_korrespondenz', 'fall_id', fallIds)
    await leereTabellePerFallIds('task_reminders', 'fall_id', fallIds)
    await leereTabellePerFallIds('tasks', 'fall_id', fallIds)
    await leereTabellePerFallIds('nachrichten', 'fall_id', fallIds)
    await leereTabellePerFallIds('email_log', 'fall_id', fallIds)
    await leereTabellePerFallIds('fall_read_state', 'fall_id', fallIds)
    await leereTabellePerFallIds('fall_summaries', 'fall_id', fallIds)
    await leereTabellePerFallIds('fall_dokumente', 'fall_id', fallIds)
    await leereTabellePerFallIds('gutachten_fotos', 'fall_id', fallIds)
    await leereTabellePerFallIds('gutachten_positionen', 'fall_id', fallIds)
    await leereTabellePerFallIds('phase_transitions', 'fall_id', fallIds)
    await leereTabellePerFallIds('kanzlei_faelle', 'fall_id', fallIds)
    await leereTabellePerFallIds('qc_checkliste', 'fall_id', fallIds)
  }

  // Aufträge (per User-IDs)
  const { data: auftraege } = await db
    .from('auftraege')
    .select('id')
    .in('sv_id', userIds)
  const auftragIds = (auftraege ?? []).map(a => a.id)
  log(`Aufträge gefunden: ${auftragIds.length}`)
  if (auftragIds.length > 0) {
    await leereTabellePerFallIds('pflichtdokumente', 'auftrag_id', auftragIds)
    await leereTabellePerFallIds('dokument_upload_anfragen', 'auftrag_id', auftragIds)
  }
  await leereTabellePerUserId('auftraege', 'sv_id', userIds)

  // Fälle
  if (fallIds.length > 0) {
    const { error, count } = await db
      .from('faelle')
      .delete({ count: 'exact' })
      .in('id', fallIds)
    if (error) log(`WARNUNG faelle: ${error.message}`)
    else log(`faelle geleert: ${count ?? '?'} rows`)
  }

  // Leads und abhängige Tabellen
  if (leadIds.length > 0) {
    await leereTabellePerFallIds('lead_historie', 'lead_id', leadIds)
    await leereTabellePerFallIds('nachrichten', 'lead_id', leadIds)
    await leereTabellePerFallIds('email_log', 'lead_id', leadIds)
    await leereTabellePerFallIds('provisionen_maik', 'lead_id', leadIds)
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

      // Frische SV-Tages-Session anlegen (idle, kein Termin).
      // 2026-05-08: TZ-Fix — feldmodus/page.tsx liest datum als
      // Local-Mitternacht→toISOString→slice. Bei späten CET-Stunden
      // ergibt das einen Vortags-String. Wir matchen exakt diese Logik.
      const heuteDate = new Date()
      heuteDate.setHours(0, 0, 0, 0)
      const heute = heuteDate.toISOString().slice(0, 10)
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
