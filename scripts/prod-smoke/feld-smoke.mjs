#!/usr/bin/env node
// Regel-4 Prod-Smoke: Feldmodus #4534 (Finished-Screen) + #4551 (Vor-Ort-Erfassung raus).
//
// Warum als CI-Job (.github/workflows/feld-smoke-prod.yml, workflow_dispatch):
// die direkten GoTrue/PostgREST-Endpoints (*.supabase.co) waren von der lokalen
// Entwickler-Maschine durchgehend unerreichbar (Cloudflare 522/Timeout), waehrend
// der VPS + CI den Edge normal erreichen. Der GitHub-Runner hat freien Egress.
//
// Ansatz (KEIN flakiges UI-Driving): Wegwerf-SV + Claim + Termin + sv_tages_session
// seeden, den Ziel-Status setzen, /gutachter/feldmodus als der SV laden + die
// SSR/Server-Action-gerenderte HTML asserten.
//   #4551: sv_tages_session.status='arrived' -> FeldmodusClient rendert SvFallakteView
//          -> assert: Fall-Info + Briefing + "Besichtigung abschließen" DA,
//                     Dokumente-Upload + Vor-Ort-Notizen WEG.
//   #4534: status='finished' -> page.tsx rendert Finished-Screen statt redirect()
//          -> assert: "Tagesmodus abgeschlossen" + "Zur Tagesübersicht", HTTP 200,
//                     keine Redirect auf /heute.
//
// Sicherheit: @claimondo.test-Email + telefon NULL (istTestKunde-Guard unterdrueckt
// jede Zustellung). try/finally-Teardown loescht ALLES (auch bei Assertion-Fail);
// IDs werden frueh in feld-smoke-ids.json geschrieben (Crash-Recovery).
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { sessionToCookies } from './cookie.mjs'

// --- env: CI liefert process.env; lokal Fallback auf .env.local ---
function env(key) {
  if (process.env[key]) return process.env[key]
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* keine .env.local (CI) */ }
  return undefined
}
const URL_SB = env('NEXT_PUBLIC_SUPABASE_URL')
const SR = env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!URL_SB || !SR || !ANON) { console.error('FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(2) }
const projectRef = new URL(URL_SB).hostname.split('.')[0]
const APP = process.env.PLAYWRIGHT_BASE_URL || 'https://app.claimondo.de'
const TS = Date.now()
const EMAIL = `smoke-feld-${TS}@claimondo.test`
const PW = (process.env.TEST_PASSWORT ?? '')
const berlinToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
const IDS_FILE = 'feld-smoke-ids.json'

const rest = (path, method, body, headers = {}) =>
  fetch(`${URL_SB}/rest/v1/${path}`, {
    method,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
const admin = (path, method, body) =>
  fetch(`${URL_SB}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

const ids = {}
const log = (...a) => console.log(...a)
let browser

async function main() {
  // 1) Wegwerf-SV auth user
  let r = await admin('users', 'POST', { email: EMAIL, password: PW, email_confirm: true })
  let j = await r.json()
  if (!j.id) throw new Error('auth user create fail: ' + JSON.stringify(j))
  ids.uid = j.id
  writeFileSync(IDS_FILE, JSON.stringify(ids))
  log('SV uid=', ids.uid)

  // 2) profiles -> rolle sachverstaendiger (Trigger legt Row an; wir PATCHen)
  r = await rest(`profiles?id=eq.${ids.uid}`, 'PATCH', {
    rolle: 'sachverstaendiger', vorname: 'SmokeFeld', nachname: 'Wegwerf', force_password_change: false,
  })
  if (!r.ok) throw new Error('profiles patch fail: ' + r.status + ' ' + (await r.text()))
  if (!(await r.json()).length) {
    r = await rest('profiles', 'POST', { id: ids.uid, email: EMAIL, rolle: 'sachverstaendiger', vorname: 'SmokeFeld', nachname: 'Wegwerf', force_password_change: false })
    if (!r.ok) throw new Error('profiles insert fail: ' + r.status + ' ' + (await r.text()))
  }
  log('profiles ok')

  // 3) sachverstaendige (portal frei + aktiv)
  r = await rest('sachverstaendige', 'POST', { profile_id: ids.uid, ist_aktiv: true, portal_zugang_freigeschaltet: true })
  if (!r.ok) throw new Error('sv insert fail: ' + r.status + ' ' + (await r.text()))
  ids.svId = (await r.json())[0].id
  writeFileSync(IDS_FILE, JSON.stringify(ids))
  log('sachverstaendige id=', ids.svId)

  // 4) claim (nur schadentag pflicht; Rest defaulted)
  r = await rest('claims', 'POST', {
    schadentag: berlinToday, sv_id: ids.svId, claim_nummer: `CLM-SMOKE-${TS}`,
    szenario: 'normalfall', created_via: 'manuell_admin',
    hergang_sv_text: 'Smoke-Fixture Feldmodus', onboarding_complete: true,
  })
  if (!r.ok) throw new Error('claim insert fail: ' + r.status + ' ' + (await r.text()))
  ids.claimId = (await r.json())[0].id
  writeFileSync(IDS_FILE, JSON.stringify(ids))
  log('claim id=', ids.claimId)

  // 5) gutachter_termine: dem SV zugewiesen, heute, ARRIVED
  const start = new Date(); start.setHours(10, 0, 0, 0)
  const end = new Date(); end.setHours(11, 0, 0, 0)
  r = await rest('gutachter_termine', 'POST', {
    claim_id: ids.claimId, fall_id: ids.claimId,
    assignee_typ: 'sachverstaendiger', assignee_id: ids.svId,
    start_zeit: start.toISOString(), end_zeit: end.toISOString(),
    status: 'bestaetigt', typ: 'sv_begutachtung',
    besichtigungsort_adresse: 'Teststrasse 1, 50667 Köln',
    besichtigungsort_lat: 50.9375, besichtigungsort_lng: 6.9603,
    sv_angekommen_am: new Date().toISOString(), besichtigung_gestartet_am: new Date().toISOString(),
  })
  if (!r.ok) throw new Error('termin insert fail: ' + r.status + ' ' + (await r.text()))
  ids.terminId = (await r.json())[0].id
  writeFileSync(IDS_FILE, JSON.stringify(ids))
  log('termin id=', ids.terminId)

  // 6) sv_tages_session: ARRIVED, mit dem Termin als aktueller Stop
  r = await rest('sv_tages_session', 'POST', {
    sv_id: ids.svId, datum: berlinToday, status: 'arrived',
    reihenfolge_termin_ids: [ids.terminId], aktueller_termin_id: ids.terminId,
    started_at: new Date().toISOString(),
  })
  if (!r.ok) throw new Error('session insert fail: ' + r.status + ' ' + (await r.text()))
  ids.sessionId = (await r.json())[0].id
  writeFileSync(IDS_FILE, JSON.stringify(ids))
  log('session id=', ids.sessionId)

  // 7) SV-Session (GoTrue password grant) -> cookies
  const authRes = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  })
  const sess = await authRes.json()
  if (!sess.access_token) throw new Error('SV login fail: ' + JSON.stringify(sess))
  log('SV session ok')

  // --- Playwright ---
  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 430, height: 900 } })
  await ctx.grantPermissions(['geolocation'], { origin: APP })
  await ctx.setGeolocation({ latitude: 50.9375, longitude: 6.9603 })
  await ctx.addCookies(sessionToCookies(sess, { projectRef, cookieDomain: '.claimondo.de' }))
  const page = await ctx.newPage()
  const pageErrors = []
  const badErrors = []
  page.on('pageerror', (e) => {
    const t = e.message || String(e); pageErrors.push(t)
    if (/server-only|Client Component|ChunkLoadError|Failed to (load|fetch).*chunk|Cannot find module|#(310|418|423)/i.test(t)) badErrors.push(t)
  })

  const results = {}

  // ===== #4551: arrived -> SvFallakteView OHNE Dokumente/Notizen =====
  let resp = await page.goto('/gutachter/feldmodus', { waitUntil: 'domcontentloaded', timeout: 45000 })
  // Auf den SvFallakteView-Abschluss-Button warten (immer im Footer) statt fixem Timeout — deterministisch.
  await page.getByRole('button', { name: /Besichtigung abschließen/ }).first().waitFor({ timeout: 20000 }).catch(() => {})
  // Auf die GELADENE Fallakte warten (Fall-Card) — im "Lade Fallakte…"-State zeigt
  // weder alte noch neue Version die Sektionen -> Negativ-Assertion waere vacuous.
  await page.getByText(/Fall #/i).first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const body1 = await page.evaluate(() => document.body?.innerText || '')
  const fileInputs = await page.locator('input[type=file]').count().catch(() => -1)
  results.p4551 = {
    http: resp?.status(), url: page.url(),
    fallLoaded: /Fall #/i.test(body1),
    fallakteRendered: /Besichtigung abschließen/i.test(body1) && /Vor Ort · Besichtigung/i.test(body1),
    hasNotizen: /Vor-Ort-Notizen|Was ist bei der Besichtigung aufgefallen|Notizen speichern/.test(body1),
    hasDokumentUpload: fileInputs > 0,
    bodyLen: body1.length, bodySnippet: body1.slice(0, 260),
  }
  log('\n#4551', JSON.stringify(results.p4551))

  // ===== #4534: session -> finished -> Finished-Screen statt redirect/500 =====
  const up = await rest(`sv_tages_session?id=eq.${ids.sessionId}`, 'PATCH', { status: 'finished', completed_at: new Date().toISOString() })
  if (!up.ok) throw new Error('session->finished fail: ' + up.status + ' ' + (await up.text()))
  resp = await page.goto('/gutachter/feldmodus', { waitUntil: 'domcontentloaded', timeout: 45000 })
  // Auf den Finished-Screen-Text warten statt fixem Timeout.
  await page.getByText(/Tagesmodus abgeschlossen/).first().waitFor({ timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const body2 = await page.evaluate(() => document.body?.innerText || '')
  results.p4534 = {
    http: resp?.status(), url: page.url(),
    onFeldmodus: /\/gutachter\/feldmodus/.test(page.url()),
    finishedScreen: /Tagesmodus abgeschlossen/.test(body2),
    hasCta: /Zur Tagesübersicht/.test(body2),
    bodyLen: body2.length, bodySnippet: body2.slice(0, 220),
  }
  log('#4534', JSON.stringify(results.p4534))

  const pass4551 = results.p4551.fallLoaded && results.p4551.fallakteRendered && !results.p4551.hasNotizen && !results.p4551.hasDokumentUpload
  const pass4534 = results.p4534.finishedScreen && results.p4534.hasCta && results.p4534.onFeldmodus && results.p4534.http === 200
  const noCrash = badErrors.length === 0
  log('\n=== VERDICT ===')
  log('pageErrors:', pageErrors.length, ' badErrors(server-only/chunk/#310):', badErrors.length)
  badErrors.slice(0, 5).forEach((t) => log('  ! ' + t.slice(0, 160)))
  log(`#4551 (SvFallakteView ohne Capture): ${pass4551 ? 'PASS' : 'FAIL'}`)
  log(`#4534 (Finished-Screen statt redirect): ${pass4534 ? 'PASS' : 'FAIL'}`)
  log(`no server-only/chunk crash: ${noCrash ? 'PASS' : 'FAIL'}`)
  log(`\nSMOKE: ${pass4551 && pass4534 && noCrash ? 'PASS' : 'FAIL'}`)
  global.__PASS = pass4551 && pass4534 && noCrash
}

async function teardown() {
  log('\n=== TEARDOWN ===')
  try {
    if (browser) await browser.close()
    if (ids.sessionId) log('del session', (await rest(`sv_tages_session?id=eq.${ids.sessionId}`, 'DELETE')).status)
    if (ids.terminId) log('del termin', (await rest(`gutachter_termine?id=eq.${ids.terminId}`, 'DELETE')).status)
    if (ids.claimId) log('del claim', (await rest(`claims?id=eq.${ids.claimId}`, 'DELETE')).status)
    if (ids.svId) log('del sachverstaendige', (await rest(`sachverstaendige?id=eq.${ids.svId}`, 'DELETE')).status)
    if (ids.uid) {
      log('del profile', (await rest(`profiles?id=eq.${ids.uid}`, 'DELETE')).status)
      log('del auth user', (await admin(`users/${ids.uid}`, 'DELETE')).status)
    }
  } catch (e) { log('teardown error:', e.message) }
}

try {
  await main()
} catch (e) {
  console.error('SMOKE ERROR:', e.message)
  global.__PASS = false
} finally {
  await teardown()
}
process.exit(global.__PASS ? 0 : 1)
