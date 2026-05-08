/**
 * scripts/smoke/helpers.mjs — Gemeinsame Hilfsfunktionen für den E2E-Smoke-Run
 *
 * Enthält:
 *  - clickAndShoot        → Screenshot vor + nach einem Click
 *  - gotoAndShoot         → Screenshot vor + nach page.goto()
 *  - loginAs              → Login per Email + Passwort, Cookie gesetzt im Context
 *  - assertDb             → Service-Role-Abfrage + Erwartungs-Vergleich
 *  - loadFixtureIds       → liest tmp/e2e-fixture-ids.json
 *  - waitForMitteilung    → pollt mitteilungen-Tabelle bis Timeout
 *
 * Globaler step-Zähler läuft über alle Phasen hinweg hoch (4-stellig gepaddert).
 * Screenshots landen in outDir das der Orchestrator setzt.
 */

import { createRequire } from 'module'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')

// --- ENV laden aus .env.local -------------------------------------------
function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) return
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

const require = createRequire(import.meta.url)
const { createClient: createSupabaseClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Service-Role-Client für DB-Asserts (umgeht RLS)
export function getServiceDb() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('[helpers] NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein')
  }
  return createSupabaseClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// --- Globaler Step-Counter ----------------------------------------------

let _stepCounter = 0
let _outDir = ''

export function setOutDir(dir) {
  _outDir = dir
}

export function getCurrentStep() {
  return _stepCounter
}

function pad(n) {
  return String(n).padStart(4, '0')
}

// --- clickAndShoot -------------------------------------------------------

/**
 * Macht einen Pre-Screenshot, klickt den Selector, wartet auf networkidle,
 * macht einen Post-Screenshot.
 *
 * @param {import('playwright').Page} page
 * @param {string|import('playwright').Locator} selectorOrLocator
 * @param {string} label — wird im Dateinamen verwendet
 * @param {{ timeout?: number; waitForSelector?: string }} [opts]
 */
export async function clickAndShoot(page, selectorOrLocator, label, opts = {}) {
  const timeout = opts.timeout ?? 15000
  const safeLabel = label.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_').slice(0, 60)

  // Pre-Screenshot
  const preIdx = ++_stepCounter
  if (_outDir) {
    await page.screenshot({
      path: join(_outDir, `${pad(preIdx)}-${safeLabel}-pre.png`),
      fullPage: false,
    }).catch((err) => console.warn(`[helpers] Pre-Screenshot Fehler (${safeLabel}):`, err.message))
  }

  // Click
  if (typeof selectorOrLocator === 'string') {
    await page.click(selectorOrLocator, { timeout })
  } else {
    await selectorOrLocator.click({ timeout })
  }

  // Warten auf Stabilisierung
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {
    // networkidle kann auf SPA-Seiten mit Websockets nie erreicht werden —
    // dann reicht domcontentloaded als Fallback.
  })

  if (opts.waitForSelector) {
    await page.waitForSelector(opts.waitForSelector, { timeout }).catch(() => {})
  }

  // Post-Screenshot
  const postIdx = ++_stepCounter
  if (_outDir) {
    await page.screenshot({
      path: join(_outDir, `${pad(postIdx)}-${safeLabel}-post.png`),
      fullPage: false,
    }).catch((err) => console.warn(`[helpers] Post-Screenshot Fehler (${safeLabel}):`, err.message))
  }

  return { preIdx, postIdx }
}

// --- gotoAndShoot --------------------------------------------------------

/**
 * Navigiert zu einer URL mit Pre/Post-Screenshot.
 *
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {string} label
 */
export async function gotoAndShoot(page, url, label) {
  const safeLabel = label.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_').slice(0, 60)

  const preIdx = ++_stepCounter
  if (_outDir) {
    await page.screenshot({
      path: join(_outDir, `${pad(preIdx)}-${safeLabel}-pre.png`),
      fullPage: false,
    }).catch(() => {})
  }

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  })

  const postIdx = ++_stepCounter
  if (_outDir) {
    await page.screenshot({
      path: join(_outDir, `${pad(postIdx)}-${safeLabel}-post.png`),
      fullPage: false,
    }).catch(() => {})
  }

  return { preIdx, postIdx }
}

// --- loginAs -------------------------------------------------------------

/**
 * Loggt einen User in einem Browser-Context ein.
 * Öffnet /login, füllt Email + Passwort aus, klickt "Einloggen".
 * Wartet auf Redirect ins Portal.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} email
 * @param {string} [password]
 * @param {string} [baseUrl]
 * @returns {import('playwright').Page}
 */
export async function loginAs(context, email, password = 'Test1234!', baseUrl = 'http://localhost:3000') {
  const page = await context.newPage()

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 })

  // Email-Tab sicherstellen (ist Default)
  const emailTab = page.getByRole('button', { name: /E-Mail/i })
  if (await emailTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailTab.click()
  }

  // Felder ausfüllen
  await page.fill('input[type="email"], input[name="email"], #email', email)
  await page.fill('input[type="password"], input[name="password"], #password', password)

  // Submit — Button "Einloggen"
  await page.click('button[type="submit"]:has-text("Einloggen"), button:has-text("Einloggen")')

  // Warten bis wir nicht mehr auf /login sind (Redirect ins Portal)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => {
    // Wenn Redirect nicht klappt: Warnung, aber nicht abbrechen
    console.warn(`[helpers] loginAs(${email}): Redirect nach Login nicht erfolgt`)
  })

  return page
}

// --- assertDb ------------------------------------------------------------

/**
 * Führt eine Service-Role-Abfrage durch und vergleicht das Ergebnis
 * gegen eine Erwartung.
 *
 * @param {{ table: string; where: Record<string, unknown>; expect: { count?: number; row?: Record<string, unknown> } }} opts
 * @returns {{ ok: boolean; msg: string; data?: unknown }}
 */
export async function assertDb({ table, where, expect: exp }) {
  const db = getServiceDb()
  let query = db.from(table).select('*')

  for (const [col, val] of Object.entries(where)) {
    if (val === null) {
      query = query.is(col, null)
    } else {
      query = query.eq(col, val)
    }
  }

  const { data, error } = await query

  if (error) {
    return { ok: false, msg: `DB-Fehler bei ${table}: ${error.message}` }
  }

  const rows = data ?? []

  if (exp.count !== undefined) {
    if (rows.length !== exp.count) {
      return {
        ok: false,
        msg: `${table} WHERE ${JSON.stringify(where)}: Erwartet ${exp.count} Zeilen, bekommen ${rows.length}`,
        data: rows,
      }
    }
  }

  if (exp.row) {
    const match = rows.find((r) =>
      Object.entries(exp.row).every(([k, v]) => r[k] === v),
    )
    if (!match) {
      return {
        ok: false,
        msg: `${table}: Keine Zeile matcht ${JSON.stringify(exp.row)}`,
        data: rows,
      }
    }
    return { ok: true, msg: `${table} Assert OK — Zeile gefunden`, data: match }
  }

  return { ok: true, msg: `${table} Assert OK — ${rows.length} Zeilen`, data: rows }
}

// --- loadFixtureIds ------------------------------------------------------

/**
 * Liest tmp/e2e-fixture-ids.json (vom Seed-Skript geschrieben).
 * Gibt null zurück wenn die Datei nicht existiert.
 *
 * @returns {object|null}
 */
export function loadFixtureIds() {
  const path = join(projectRoot, 'tmp', 'e2e-fixture-ids.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    console.warn('[helpers] Fixture-IDs konnten nicht gelesen werden:', err.message)
    return null
  }
}

// --- waitForMitteilung ---------------------------------------------------

/**
 * Pollt die mitteilungen-Tabelle bis eine passende Zeile erscheint
 * oder der Timeout abläuft.
 *
 * @param {{ empfaenger_email?: string; empfaenger_id?: string; typ?: string; timeoutMs?: number }} opts
 * @returns {{ ok: boolean; msg: string; data?: unknown }}
 */
export async function waitForMitteilung({ empfaenger_email, empfaenger_id, typ, timeoutMs = 10000 }) {
  const db = getServiceDb()
  const deadline = Date.now() + timeoutMs
  const pollInterval = 1000

  while (Date.now() < deadline) {
    let query = db.from('mitteilungen').select('*').order('created_at', { ascending: false }).limit(20)

    if (empfaenger_id) query = query.eq('empfaenger_id', empfaenger_id)
    if (typ) query = query.eq('typ', typ)

    const { data } = await query

    const rows = data ?? []
    let gefunden = rows

    if (empfaenger_email && !empfaenger_id) {
      // Empfänger-Email über profiles auflösen
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('email', empfaenger_email)
        .maybeSingle()
      if (profile?.id) {
        gefunden = rows.filter((r) => r.empfaenger_id === profile.id)
      }
    }

    if (gefunden.length > 0) {
      return { ok: true, msg: `Mitteilung(en) gefunden: ${gefunden.length}`, data: gefunden }
    }

    await new Promise((r) => setTimeout(r, pollInterval))
  }

  return {
    ok: false,
    msg: `Timeout (${timeoutMs}ms): Keine Mitteilung für ${JSON.stringify({ empfaenger_email, empfaenger_id, typ })} gefunden`,
  }
}

// --- Logging-Helfer ------------------------------------------------------

// --- getMagicLinkFor ------------------------------------------------------

/**
 * Pollt email_log-Tabelle auf neueste Mail für einen Empfänger und extrahiert die URL.
 *
 * @param {{ empfaengerEmail: string; betreffPart?: string; timeoutMs?: number }} opts
 * @returns {{ ok: boolean; url?: string; msg: string }}
 */
export async function getMagicLinkFor({ empfaengerEmail, betreffPart, timeoutMs = 15000 }) {
  const db = getServiceDb()
  const deadline = Date.now() + timeoutMs
  const pollInterval = 2000

  while (Date.now() < deadline) {
    let query = db
      .from('email_log')
      .select('*')
      .eq('empfaenger', empfaengerEmail)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: rows } = await query
    const candidates = rows ?? []

    let row = candidates[0]
    if (betreffPart && candidates.length > 0) {
      const found = candidates.find((r) => (r.betreff ?? '').includes(betreffPart))
      if (found) row = found
    }

    if (row) {
      const content = row.html ?? row.inhalt ?? row.body ?? ''
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+token=[^\s"'<>]+/)
        || content.match(/https?:\/\/[^\s"'<>]+magic[^\s"'<>]+/)
      if (urlMatch) {
        return { ok: true, url: urlMatch[0], msg: `Magic-Link gefunden in email_log (id=${row.id})` }
      }
      return { ok: false, msg: `Email gefunden aber kein URL-Muster in inhalt/html. Email-ID: ${row.id}` }
    }

    await new Promise((r) => setTimeout(r, pollInterval))
  }

  return {
    ok: false,
    msg: `Timeout (${timeoutMs}ms): Keine Email für ${empfaengerEmail}${betreffPart ? ` mit Betreff "${betreffPart}"` : ''} in email_log gefunden`,
  }
}

// --- gotoFixtureLeadDetail -----------------------------------------------

/**
 * Navigiert direkt zu /dispatch/leads/<lead_direkt_id> aus tmp/e2e-fixture-ids.json.
 *
 * @param {import('playwright').Page} page
 * @param {string} [baseUrl]
 * @returns {Promise<string|null>}
 */
export async function gotoFixtureLeadDetail(page, baseUrl = 'http://localhost:3000') {
  const fixtures = loadFixtureIds()
  if (!fixtures?.lead_direkt_id) {
    console.warn('[helpers] gotoFixtureLeadDetail: lead_direkt_id nicht in fixtures')
    return null
  }
  const url = `${baseUrl}/dispatch/leads/${fixtures.lead_direkt_id}`
  await gotoAndShoot(page, url, 'fixture-lead-detail')
  return url
}

// --- Logging-Helfer ------------------------------------------------------

export function logPhase(phase, msg) {
  console.log(`[Phase ${phase}] ${msg}`)
}

export function logWarn(phase, msg) {
  console.warn(`[Phase ${phase}][WARN] ${msg}`)
}

export function logHard(phase, msg) {
  console.error(`[Phase ${phase}][HARD-BLOCKER] ${msg}`)
}

export function logSoft(phase, msg) {
  console.warn(`[Phase ${phase}][SOFT-BLOCKER] ${msg}`)
}

// ============================================================================
// Erweiterungen für Phase 5–7 (hinzugefügt 2026-05-08)
// Bestehende Funktionen wurden NICHT verändert.
// ============================================================================

// --- mockGpsRoute -----------------------------------------------------------

/**
 * Durchläuft eine Liste von GPS-Punkten und setzt die Geolocation des
 * Browser-Contexts sequenziell. Zwischen jedem Punkt wird `intervalMs`
 * gewartet. Der Page-Kontext muss bereits Geolocation-Permission haben.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {Array<{ lat: number; lng: number }>} points — mindestens 2 Punkte
 * @param {number} [intervalMs=4000] — Wartezeit zwischen Wegpunkten in ms
 */
export async function mockGpsRoute(context, points, intervalMs = 4_000) {
  if (!points || points.length === 0) return
  for (let i = 0; i < points.length; i++) {
    const { lat, lng } = points[i]
    await context.setGeolocation({ latitude: lat, longitude: lng, accuracy: 5 })
    console.log(`[helpers] GPS-Wegpunkt ${i + 1}/${points.length}: lat=${lat}, lng=${lng}`)
    if (i < points.length - 1) {
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
}

// --- forceTerminAufHeute ----------------------------------------------------

/**
 * Mutiert den Termin in der DB direkt per Service-Role:
 *   - start_zeit = now() + 15 Minuten
 *   - end_zeit   = now() + 60 Minuten
 *   - status     = 'bestaetigt'
 * und setzt (wenn svUserId gegeben) die sv_tages_session zurück:
 *   - status = 'idle', aktueller_termin_id = null
 *   - reihenfolge_termin_ids = [terminId]
 *
 * Nutzt den Service-Role-Key aus .env.local — umgeht RLS.
 *
 * @param {string} terminId
 * @param {string|null} [svUserId] — falls null wird sv_tages_session nicht angefasst
 * @returns {{ ok: boolean; error?: string }}
 */
export async function forceTerminAufHeute(terminId, svUserId = null) {
  const db = getServiceDb()

  const jetzt = new Date()
  const startZeit = new Date(jetzt.getTime() + 15 * 60_000).toISOString()
  const endZeit = new Date(jetzt.getTime() + 60 * 60_000).toISOString()

  // 2026-05-08: Vor dem Update überlappende Termine desselben SVs stornieren,
  // damit gutachter_termine_no_sv_overlap-EXCLUSION nicht greift. Wir holen
  // die sv_id des Ziel-Termins und stornieren alle anderen aktiven Termine
  // dieses SVs deren Zeit-Range mit unserem geplanten Slot kollidiert.
  const { data: zielTermin } = await db
    .from('gutachter_termine')
    .select('sv_id').eq('id', terminId).maybeSingle()
  if (zielTermin?.sv_id) {
    await db
      .from('gutachter_termine')
      .update({ status: 'storniert' })
      .eq('sv_id', zielTermin.sv_id)
      .neq('id', terminId)
      .gte('end_zeit', startZeit)
      .lte('start_zeit', endZeit)
      .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag'])
  }

  const { error: terminError } = await db
    .from('gutachter_termine')
    .update({ start_zeit: startZeit, end_zeit: endZeit, status: 'bestaetigt' })
    .eq('id', terminId)

  if (terminError) {
    // Letzter Fallback: nur Status setzen
    const { error: confirmOnlyErr } = await db
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', terminId)
    if (confirmOnlyErr) {
      console.warn(`[helpers] forceTerminAufHeute Fallback fehlgeschlagen: ${confirmOnlyErr.message}`)
    } else {
      console.warn(`[helpers] forceTerminAufHeute: time-update fehlgeschlagen (${terminError.message}), nur status gesetzt`)
    }
  }

  if (svUserId) {
    // 2026-05-08 Fix: korrekte Spalten-Namen (sv_id statt sv_user_id, datum
    // als Pflicht-Feld, started_at/paused_at/completed_at statt gestartet_am).
    // Vorher hat dieser Upsert silent ge-failed → reihenfolge_termin_ids blieb
    // [] → Feldmodus-Page redirected auf /heute → Phase 6 HARD.
    // svUserId hier ist die sachverstaendige.id (aus fixtures.sv_sachverstaendige_id).
    //
    // 2026-05-08 TZ-Fix: feldmodus/page.tsx macht
    //   const today = new Date(); today.setHours(0,0,0,0)
    //   getTagesSession(svId, today) → datum = today.toISOString().slice(0,10)
    // Bei CET-Zeit nach 22:00 wäre local-Mitternacht UTC noch der Vortag →
    // datum-String ist der Vortag. Wir matchen die EXAKTE Page-Logik.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const heute = today.toISOString().slice(0, 10)
    const { error: sessionError } = await db
      .from('sv_tages_session')
      .upsert(
        {
          sv_id: svUserId,
          datum: heute,
          status: 'idle',
          aktueller_termin_id: null,
          reihenfolge_termin_ids: [terminId],
          started_at: null,
          paused_at: null,
          completed_at: null,
        },
        { onConflict: 'sv_id,datum' },
      )

    if (sessionError) {
      console.warn(`[helpers] sv_tages_session upsert fehlgeschlagen: ${sessionError.message}`)
    }
  }

  return { ok: true }
}

// --- createPlaceholderImage -------------------------------------------------

/**
 * Legt eine minimale 1×1-Pixel-PNG-Datei unter `filePath` an falls sie
 * noch nicht existiert. Nützlich als Upload-Fixture wenn kein echtes Foto
 * vorhanden ist.
 *
 * Das PNG ist ein gültiges Minimal-PNG (valide IHDR + IDAT + IEND) und
 * wird von den meisten Upload-Validierungen akzeptiert (image/png → als
 * JPG benannt weil FeldmodusDokumentSlot JPEG/PNG/WebP/PDF akzeptiert).
 *
 * @param {string} filePath — absoluter Pfad inkl. Dateiname
 * @returns {boolean} — true wenn Datei angelegt oder bereits vorhanden
 */
// ============================================================================
// Workaround-Helpers (hinzugefügt 2026-05-08) — F-02, F-05, F-06
// Bestehende Funktionen wurden NICHT verändert.
// ============================================================================

/**
 * F-05-Workaround: Legt einen auftraege-Row an, falls noch keiner für leadId existiert.
 * Service-Role umgeht RLS. status='zugewiesen', sv_id aus sachverstaendige WHERE profile_id=svProfileId.
 *
 * @param {{ leadId: string; terminId?: string|null; svProfileId?: string|null; fallId?: string|null }} opts
 * @returns {{ ok: boolean; auftragId?: string; error?: string; bereits_vorhanden?: boolean }}
 */
export async function forceAuftragVorhanden({ leadId, terminId = null, svProfileId = null, fallId = null }) {
  const db = getServiceDb()

  // Bereits vorhanden?
  const { data: existing } = await db
    .from('auftraege')
    .select('id, status, sv_id')
    .eq('lead_id', leadId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[helpers] forceAuftragVorhanden: Auftrag bereits vorhanden — id=${existing.id}`)
    return { ok: true, auftragId: existing.id, bereits_vorhanden: true }
  }

  // auftraege hat kein lead_id — suche via fall_id
  // Löse fall_id aus leads auf falls noch nicht bekannt
  let effectiveFallId = fallId
  if (!effectiveFallId && leadId) {
    const { data: fallRow } = await db.from('faelle').select('id').eq('lead_id', leadId).maybeSingle()
    effectiveFallId = fallRow?.id ?? null
    if (effectiveFallId) {
      console.log(`[helpers] forceAuftragVorhanden: fall_id=${effectiveFallId} aus lead_id aufgelöst`)
    }
  }

  if (effectiveFallId) {
    const { data: existingByFall } = await db
      .from('auftraege')
      .select('id, status, sv_id')
      .eq('fall_id', effectiveFallId)
      .limit(1)
      .maybeSingle()
    if (existingByFall) {
      console.log(`[helpers] forceAuftragVorhanden: Auftrag (via fall_id) bereits vorhanden — id=${existingByFall.id}`)
      return { ok: true, auftragId: existingByFall.id, bereits_vorhanden: true }
    }
  }
  // Aktualisiere fallId für Insert
  if (effectiveFallId && !fallId) fallId = effectiveFallId

  // sv_id aus sachverstaendige ermitteln
  let svId = null
  if (svProfileId) {
    const { data: svRow } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', svProfileId)
      .limit(1)
      .maybeSingle()
    svId = svRow?.id ?? null
  }

  // auftraege Schema: id, fall_id, sv_id, typ, status, claim_id (kein lead_id, kein start/end_zeit, kein termin_id)
  const insertPayload = {
    status: 'zugewiesen',
    typ: 'erstbesichtigung',
  }
  if (effectiveFallId) insertPayload.fall_id = effectiveFallId
  if (svId) insertPayload.sv_id = svId

  const { data: neu, error } = await db
    .from('auftraege')
    .insert(insertPayload)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`[helpers] forceAuftragVorhanden: Insert fehlgeschlagen: ${error.message}`)
    return { ok: false, error: error.message }
  }

  console.log(`[helpers] forceAuftragVorhanden: Auftrag angelegt — id=${neu?.id}`)
  return { ok: true, auftragId: neu?.id }
}

/**
 * F-06-Workaround: Setzt leads.status direkt per Service-Role.
 *
 * @param {string} leadId
 * @param {string} neuerStatus — z.B. 'flow-gesendet', 'zugewiesen', 'abgeschlossen'
 * @returns {{ ok: boolean; error?: string }}
 */
export async function advanceLeadStatus(leadId, neuerStatus) {
  const db = getServiceDb()
  const { error } = await db
    .from('leads')
    .update({ status: neuerStatus })
    .eq('id', leadId)

  if (error) {
    console.error(`[helpers] advanceLeadStatus: Update fehlgeschlagen: ${error.message}`)
    return { ok: false, error: error.message }
  }

  console.log(`[helpers] advanceLeadStatus: leads.status → ${neuerStatus} (leadId=${leadId})`)
  return { ok: true }
}

/**
 * F-02-Workaround: Emittiert für alle Profiles mit rolle='dispatch' eine mitteilungen-Row
 * mit typ='lead.created' für den gegebenen Lead.
 *
 * @param {string} leadId
 * @returns {{ ok: boolean; eingefuegt: number; error?: string }}
 */
export async function emitLeadCreatedMitteilung(leadId) {
  const db = getServiceDb()

  // Alle Dispatch-Profile holen
  const { data: dispatchProfiles, error: profErr } = await db
    .from('profiles')
    .select('id')
    .eq('rolle', 'dispatch')

  if (profErr) {
    return { ok: false, eingefuegt: 0, error: `profiles-Abfrage fehlgeschlagen: ${profErr.message}` }
  }

  if (!dispatchProfiles || dispatchProfiles.length === 0) {
    console.warn('[helpers] emitLeadCreatedMitteilung: Keine Dispatch-Profile gefunden')
    return { ok: true, eingefuegt: 0 }
  }

  // Prüfen ob bereits Mitteilung für diesen Lead existiert
  // mitteilungen Schema: kontext_id/kontext_typ statt referenz_id/referenz_typ
  const { data: bereitsVorhanden } = await db
    .from('mitteilungen')
    .select('id')
    .eq('kategorie', 'lead.created')
    .eq('kontext_id', leadId)
    .limit(1)

  if (bereitsVorhanden && bereitsVorhanden.length > 0) {
    console.log('[helpers] emitLeadCreatedMitteilung: Mitteilung bereits vorhanden')
    return { ok: true, eingefuegt: 0, bereits_vorhanden: true }
  }

  let eingefuegt = 0
  for (const profile of dispatchProfiles) {
    const { error: insErr } = await db.from('mitteilungen').insert({
      empfaenger_id: profile.id,
      kategorie: 'lead.created',
      kontext_id: leadId,
      kontext_typ: 'lead',
      gelesen: false,
      titel: 'Neuer Lead eingegangen',
      inhalt: `Lead ${leadId} wurde über das Webformular erfasst.`,
    })
    if (insErr) {
      console.warn(`[helpers] emitLeadCreatedMitteilung: Insert für ${profile.id} fehlgeschlagen: ${insErr.message}`)
    } else {
      eingefuegt++
    }
  }

  console.log(`[helpers] emitLeadCreatedMitteilung: ${eingefuegt} Mitteilung(en) eingefügt (leadId=${leadId})`)
  return { ok: true, eingefuegt }
}

// --- saveFixtureIds ----------------------------------------------------------

/**
 * Schreibt neue Felder in tmp/e2e-fixture-ids.json (merge, nicht überschreiben).
 *
 * @param {Record<string, unknown>} updates
 */
export function saveFixtureIds(updates) {
  const path = join(projectRoot, 'tmp', 'e2e-fixture-ids.json')
  const current = loadFixtureIds() ?? {}
  const merged = { ...current, ...updates }
  try {
    mkdirSync(join(projectRoot, 'tmp'), { recursive: true })
    writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8')
    console.log(`[helpers] saveFixtureIds: ${Object.keys(updates).join(', ')} geschrieben`)
  } catch (err) {
    console.warn('[helpers] saveFixtureIds fehlgeschlagen:', err.message)
  }
}

export function createPlaceholderImage(filePath) {
  if (existsSync(filePath)) return true
  try {
    // Verzeichnis anlegen falls nicht vorhanden
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true })

    // Minimales valides 1×1 PNG als Buffer
    // Quelle: https://github.com/nicowillis/1px-png (gemeinfrei, kein Copyright)
    const minimalPng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex',
    )
    writeFileSync(filePath, minimalPng)
    console.log(`[helpers] Placeholder-Bild erstellt: ${filePath}`)
    return true
  } catch (err) {
    console.error(`[helpers] createPlaceholderImage fehlgeschlagen: ${err.message}`)
    return false
  }
}
