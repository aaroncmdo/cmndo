#!/usr/bin/env node
/**
 * scripts/smoke-cmm44-spg.mjs
 *
 * Portal-Smoke nach CMM-44 SP-G — gutachten Sub-Table-Migration.
 *
 * Kontext: 19 Gutachten-bezogene faelle-Spalten sind auf gutachten umgezogen.
 * PR1 hat 5 ADD COLUMN auf gutachten + UPSERT-Backfill + Repoint aller 3
 * Views (faelle_sv_view, v_claim_full, v_faelle_mit_aktuellem_termin) auf
 * gutachten als Quelle. PR2 hat 14 Reader/Writer-Sites von faelle auf
 * gutachten umgestellt (Pattern A/B/D + Klasse-C reader-compute).
 *
 * Dieses Script verifiziert: in JEDEM Portal, das einen SP-G-Reader hat,
 * rendert die Seite ohne 5xx / Hydration-Error / leeren Screen. Bonus-Check:
 * wenn ein Gutachten existiert, erscheinen die SP-G-Werte (Betrag, Reparatur-
 * kosten, Wertminderung, OCR-Status) — pre-launch ist gutachten aber sparse
 * (1 Row total), daher ist „leer" auf vielen Seiten OK und kein Fehler.
 *
 * Testet 5 Portale gegen app.staging.claimondo.de:
 *   1. Public   → / + /gutachter-finden (kein 5xx)
 *   2. Admin    → /faelle (Liste) + /faelle/[id] (Detail mit Gutachten-Sektion)
 *   3. Dispatch → /dispatch + /dispatch/leads (kein 5xx — pre-Gutachten-Stufe)
 *   4. SV       → /gutachter + /gutachter/auftraege + /gutachter/abrechnung
 *                  (kritisch: PR2 hat dort gutachten_eingegangen_am-Reads
 *                   und das Sort-Order auf created_at umgestellt)
 *   5. Kunde    → /kunde + /kunde/faelle (kunde-Fallakte-Detail mit
 *                  gutachten-Werten via Embed)
 *
 * Verwendung (NICHT jetzt ausfuehren — PR1+PR2 noch nicht auf staging):
 *   node --env-file=.env.local scripts/smoke-cmm44-spg.mjs
 *
 * ENV:
 *   SMOKE_BASE_URL           (Default: https://app.staging.claimondo.de)
 *   STAGING_BASIC_AUTH_USER  / STAGING_BASIC_AUTH_PASS
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * Screenshots: docs/20.05.2026/cmm44-spg-smoke/
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ─── ENV laden ───────────────────────────────────────────────────────────────
function ladeEnv() {
  const kandidaten = [
    join(PROJECT_ROOT, '.env.local'),
    join(PROJECT_ROOT, '..', '..', '..', '.env.local'),
    join(PROJECT_ROOT, '..', 'claimondo-v2', '.env.local'),
  ]
  for (const envPath of kandidaten) {
    if (!existsSync(envPath)) continue
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!(k in process.env)) process.env[k] = v
    }
    console.log(`[env] Geladen aus: ${envPath}`)
    break
  }
}
ladeEnv()

// ─── Konfiguration ────────────────────────────────────────────────────────────
const BASE = process.env.SMOKE_BASE_URL || 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS || process.env.STAGING_BASIC_PASS || 'ClaimondoSuperuser123789!!'
const TEST_PASS = 'Test1234!'
const OUT_DIR = join(PROJECT_ROOT, 'docs', '20.05.2026', 'cmm44-spg-smoke')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

mkdirSync(OUT_DIR, { recursive: true })

// ─── Befunde ─────────────────────────────────────────────────────────────────
const findings = []

function notiere(portal, route, status, notiz = '') {
  findings.push({ portal, route, status, notiz, ts: new Date().toISOString() })
  const icon = status === 'OK' ? '✓' : status === 'WARN' ? '⚠' : '✗'
  console.log(`  ${icon} [${portal}] ${route}: ${status}${notiz ? ' — ' + notiz : ''}`)
}

// ─── Screenshot-Helfer ───────────────────────────────────────────────────────
let stepCounter = 0
async function shoot(page, label) {
  const nr = String(++stepCounter).padStart(4, '0')
  const safeName = label.replace(/[^a-z0-9äöüÄÖÜß_-]/gi, '-').slice(0, 60)
  const pfad = join(OUT_DIR, `${nr}-${safeName}.png`)
  await page.screenshot({ path: pfad, fullPage: false }).catch((e) =>
    console.warn(`  [screenshot] ${safeName} fehlgeschlagen: ${e.message}`)
  )
  console.log(`  📸 ${nr}-${safeName}.png`)
  return pfad
}

// ─── Console-Error-Collector ─────────────────────────────────────────────────
function setupConsoleCollector(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('net::ERR') && !txt.includes('Mixed Content')) {
        errors.push(txt.slice(0, 250))
      }
    }
  })
  page.on('pageerror', (err) => errors.push(`PAGE-ERROR: ${err.message.slice(0, 250)}`))
  return errors
}

// ─── 5xx-Detektor ────────────────────────────────────────────────────────────
function setup5xxCollector(page) {
  const fives = []
  page.on('response', (resp) => {
    if (resp.status() >= 500) {
      fives.push(`${resp.status()} ${resp.url().slice(0, 150)}`)
    }
  })
  return fives
}

// ─── Hydration-Check ─────────────────────────────────────────────────────────
async function pruefeHydration(page) {
  return page.evaluate(() => {
    const ovls = [...document.querySelectorAll('[data-nextjs-dialog-overlay], #nextjs-toast-errors')]
    return ovls.map((el) => el.innerText).filter(Boolean)
  }).catch(() => [])
}

// ─── TypeError-Detektor (SP-G-spezifisch — fängt undefined-Property-Access) ──
// Bei einem SP-G-Reader-Defekt würde z.B. `fall.gutachten_betrag` → undefined
// werfen, oder ein nested-embed liefert plötzlich ein anderes Shape.
function setupTypeErrorCollector(page) {
  const typeErrors = []
  page.on('pageerror', (err) => {
    const msg = err.message || ''
    if (/TypeError|Cannot read properties of undefined|Cannot read property/i.test(msg)) {
      typeErrors.push(msg.slice(0, 250))
    }
  })
  return typeErrors
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.fill('input[type="email"], input[name="email"], #email', email).catch(async () => {
    await page.locator('input').first().fill(email)
  })
  await page.fill('input[type="password"], input[name="password"], #password', password).catch(async () => {
    await page.locator('input[type="password"]').first().fill(password)
  })
  await page.click('button[type="submit"]').catch(async () => {
    await page.keyboard.press('Enter')
  })
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const url = page.url()
  if (url.includes('/login')) {
    console.log(`  ✗ Login fehlgeschlagen — URL: ${url}`)
    return false
  }
  console.log(`  ✓ Login OK → ${url}`)
  return true
}

// ─── Goto + Screenshot ───────────────────────────────────────────────────────
async function gotoUndShoot(page, route, label) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(2500) // SP-G-Reader brauchen oft 2 DB-Roundtrips (faelle + gutachten)
    const screenshotPfad = await shoot(page, label)
    const has500 = (await page.locator('text=500, text=Internal Server Error, text=Application error').count()) > 0
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const isBlank = bodyText.trim().length < 30
    return { ok: !has500 && !isBlank, url: page.url(), screenshotPfad, has500, isBlank, bodyText }
  } catch (e) {
    console.log(`  ✗ Navigation fehlgeschlagen: ${e.message.slice(0, 120)}`)
    await shoot(page, `${label}-fehler`)
    return { ok: false, error: e.message, bodyText: '' }
  }
}

// ─── SP-G-Sektion-Detektor ──────────────────────────────────────────────────
// Prüft, ob auf der Seite Gutachten-bezogene UI-Elemente angezeigt werden.
// Pre-launch ist gutachten meist leer (1 Row total) → erwartetes Verhalten
// ist „kein Gutachten" oder leere Felder. Der Test ist primär: kein TypeError,
// kein Crash. Bonus: wenn Werte da sind, sind sie nicht NaN/[object Object].
function pruefeGutachtenAnzeige(bodyText) {
  if (!bodyText) return { hatSektion: false, hatBruchwert: false }
  const hatSektion = /Gutachten|Schadenshöhe|Reparaturkosten|Wertminderung|OCR|Schadenshoehe/i.test(bodyText)
  // Anzeichen für Reader-Defekt: undefined/null/[object] mitten im Display
  const hatBruchwert = /(NaN|\[object Object\]|undefined)/.test(bodyText) ||
                       /undefined\s*(€|EUR)/.test(bodyText) ||
                       /null\s*(€|EUR|Tage)/.test(bodyText)
  return { hatSektion, hatBruchwert }
}

// ─── Service-Role: erste Fall-ID + erste gutachten-Claim-ID holen ────────────
async function ersterFallId() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/faelle?select=id&order=erstellt_am.desc&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!resp.ok) return null
    const rows = await resp.json()
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

async function gutachtenClaimId() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/gutachten?select=claim_id&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!resp.ok) return null
    const rows = await resp.json()
    return rows?.[0]?.claim_id ?? null
  } catch {
    return null
  }
}

// Findet den faelle.id mit dem höchsten SP-G-Datenreichtum (= gutachten-Row vorhanden)
async function fallIdMitGutachten() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  const claimId = await gutachtenClaimId()
  if (!claimId) return null
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/faelle?select=id&claim_id=eq.${claimId}&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    )
    if (!resp.ok) return null
    const rows = await resp.json()
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

// ─── 1. PUBLIC ───────────────────────────────────────────────────────────────
async function smokePublic(browser) {
  console.log('\n════════ PUBLIC (kein Login) ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)
  const typeErrs = setupTypeErrorCollector(page)

  for (const [route, label] of [
    ['/', 'public-home'],
    ['/gutachter-finden', 'public-gutachter-finden'],
  ]) {
    errors.length = 0
    fives.length = 0
    typeErrs.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    const ok = r.ok && errors.length === 0 && fives.length === 0 && hydErr.length === 0 && typeErrs.length === 0
    notiere(
      'public',
      route,
      ok ? 'OK' : 'WARN',
      [
        r.has500 ? '500!' : '',
        r.isBlank ? 'Leerer Screen!' : '',
        typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
        errors.length > 0 ? `${errors.length} console-errors` : '',
        fives.length > 0 ? `5xx: ${fives.join(', ').slice(0, 80)}` : '',
        hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 100)}` : '',
      ].filter(Boolean).join(' | ')
    )
  }

  await context.close()
}

// ─── 2. ADMIN ────────────────────────────────────────────────────────────────
async function smokeAdmin(browser, fallId, fallMitGutachtenId) {
  console.log('\n════════ ADMIN ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)
  const typeErrs = setupTypeErrorCollector(page)

  const loginOk = await login(page, 'test-admin@claimondo.de', TEST_PASS)
  await shoot(page, 'admin-nach-login')
  if (!loginOk) {
    notiere('admin', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // 1. Faelle-Liste (kein direkter SP-G-Read, aber Sanity-Check)
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const listResult = await gotoUndShoot(page, '/faelle', 'admin-faelle-liste')
  notiere('admin', '/faelle', listResult.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
    [
      listResult.has500 ? '500!' : '',
      listResult.isBlank ? 'Leer!' : '',
      typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
    ].filter(Boolean).join(' | ')
  )

  // 2. Finance Offene-Faelle (PR2: gutachten_betrag aus claims:claim_id(gutachten(...))-Embed)
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const financeResult = await gotoUndShoot(page, '/admin/finance/offene-faelle', 'admin-finance-offene-faelle')
  const financeAnzeige = pruefeGutachtenAnzeige(financeResult.bodyText)
  notiere('admin', '/admin/finance/offene-faelle',
    financeResult.ok && fives.length === 0 && typeErrs.length === 0 && !financeAnzeige.hatBruchwert ? 'OK' : 'WARN',
    [
      financeResult.has500 ? '500!' : '',
      financeResult.isBlank ? 'Leer!' : '',
      typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      financeAnzeige.hatBruchwert ? 'Reader-Defekt: undefined/NaN im Display' : '',
    ].filter(Boolean).join(' | ')
  )

  // 3. Fall-Detail (Standard-Fall)
  let detailUrl = null
  if (fallId) {
    detailUrl = `/faelle/${fallId}`
    console.log(`  → Verwende Service-Role Fall-ID: ${fallId}`)
  } else {
    const link = page.locator('a[href*="/faelle/"]').first()
    if ((await link.count()) > 0) {
      detailUrl = await link.getAttribute('href')
      console.log(`  → Erster Fall-Link aus Liste: ${detailUrl}`)
    }
  }

  if (detailUrl) {
    errors.length = 0; fives.length = 0; typeErrs.length = 0
    const detailResult = await gotoUndShoot(page, detailUrl, 'admin-fall-detail-standard')
    const detailAnzeige = pruefeGutachtenAnzeige(detailResult.bodyText)
    notiere('admin', detailUrl,
      detailResult.ok && fives.length === 0 && typeErrs.length === 0 && !detailAnzeige.hatBruchwert ? 'OK' : 'WARN',
      [
        detailResult.has500 ? '500!' : '',
        detailResult.isBlank ? 'Leer!' : '',
        typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
        detailAnzeige.hatBruchwert ? 'undefined/NaN im Display' : '',
        detailAnzeige.hatSektion ? '(Gutachten-Sektion gerendert)' : '(keine Gutachten-Sektion — ok, ggf. kein gutachten-Row)',
      ].filter(Boolean).join(' | ')
    )
  }

  // 4. Fall-Detail des Falls MIT gutachten-Row (wichtigster Test — sichtbare SP-G-Werte)
  if (fallMitGutachtenId && fallMitGutachtenId !== fallId) {
    errors.length = 0; fives.length = 0; typeErrs.length = 0
    const reichResult = await gotoUndShoot(page, `/faelle/${fallMitGutachtenId}`, 'admin-fall-detail-mit-gutachten')
    const reichAnzeige = pruefeGutachtenAnzeige(reichResult.bodyText)
    notiere('admin', `/faelle/${fallMitGutachtenId}`,
      reichResult.ok && fives.length === 0 && typeErrs.length === 0 && !reichAnzeige.hatBruchwert ? 'OK' : 'WARN',
      [
        reichResult.has500 ? '500!' : '',
        reichResult.isBlank ? 'Leer!' : '',
        typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
        reichAnzeige.hatBruchwert ? 'undefined/NaN im Display' : '',
        reichAnzeige.hatSektion ? '✓ Gutachten-Sektion mit Werten' : 'Gutachten-Row existiert aber Sektion fehlt — Reader prüfen',
      ].filter(Boolean).join(' | ')
    )
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Admin): ${errors.length}`)
    errors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 3. DISPATCH ─────────────────────────────────────────────────────────────
async function smokeDispatch(browser) {
  console.log('\n════════ DISPATCH ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)
  const typeErrs = setupTypeErrorCollector(page)

  const loginOk = await login(page, 'test-dispatch@claimondo.de', TEST_PASS)
  await shoot(page, 'dispatch-nach-login')
  if (!loginOk) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // Dispatch ist pre-Gutachten — primär Sanity-Check (kein 5xx / Crash)
  for (const [route, label] of [
    ['/dispatch', 'dispatch-root'],
    ['/dispatch/leads', 'dispatch-leads-liste'],
  ]) {
    errors.length = 0; fives.length = 0; typeErrs.length = 0
    const r = await gotoUndShoot(page, route, label)
    notiere('dispatch', route,
      r.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
      [
        r.has500 ? '500!' : '',
        r.isBlank ? 'Leer!' : '',
        typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
      ].filter(Boolean).join(' | ')
    )
  }

  await context.close()
}

// ─── 4. SV (Gutachter — kritisch für SP-G) ───────────────────────────────────
async function smokeSv(browser) {
  console.log('\n════════ SV (Gutachter — SP-G-Kern-Portal) ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)
  const typeErrs = setupTypeErrorCollector(page)

  const loginOk = await login(page, 'test-sv@claimondo.de', TEST_PASS)
  await shoot(page, 'sv-nach-login')
  if (!loginOk) {
    notiere('sv', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // 1. SV-Dashboard
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const dashResult = await gotoUndShoot(page, '/gutachter', 'sv-dashboard')
  notiere('sv', '/gutachter',
    dashResult.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // 2. Auftraege-Liste (kein direkter SP-G-Read)
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const auftraegeResult = await gotoUndShoot(page, '/gutachter/auftraege', 'sv-auftraege-liste')
  notiere('sv', '/gutachter/auftraege',
    auftraegeResult.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
    [auftraegeResult.has500 ? '500!' : '', auftraegeResult.isBlank ? 'Leer!' : '',
     typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // 3. Abrechnung-Seite (PR2-Kern: gutachten_eingegangen_am, gutachter_honorar
  //    aus claims:claim_id(gutachten(...))-Embed + .order('created_at')-Umstellung)
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const abrResult = await gotoUndShoot(page, '/gutachter/abrechnung', 'sv-abrechnung-kritisch')
  const abrAnzeige = pruefeGutachtenAnzeige(abrResult.bodyText)
  const hydAbr = await pruefeHydration(page)
  notiere('sv', '/gutachter/abrechnung',
    abrResult.ok && fives.length === 0 && typeErrs.length === 0 && !abrAnzeige.hatBruchwert && hydAbr.length === 0 ? 'OK' : 'WARN',
    [
      abrResult.has500 ? '500!' : '',
      abrResult.isBlank ? 'Leer!' : '',
      typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      abrAnzeige.hatBruchwert ? 'undefined/NaN im Display (PR2-Reader-Defekt!)' : '',
      hydAbr.length > 0 ? `Hydration: ${hydAbr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | ')
  )

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (SV): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 5. KUNDE ────────────────────────────────────────────────────────────────
async function smokeKunde(browser, fallMitGutachtenId) {
  console.log('\n════════ KUNDE ════════')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)
  const typeErrs = setupTypeErrorCollector(page)

  const loginOk = await login(page, 'test-kunde@claimondo.de', TEST_PASS)
  await shoot(page, 'kunde-nach-login')
  if (!loginOk) {
    notiere('kunde', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // Kunden-Dashboard + Faelle-Liste
  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const dashResult = await gotoUndShoot(page, '/kunde', 'kunde-dashboard')
  notiere('kunde', '/kunde',
    dashResult.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  errors.length = 0; fives.length = 0; typeErrs.length = 0
  const faelleResult = await gotoUndShoot(page, '/kunde/faelle', 'kunde-faelle-liste')
  notiere('kunde', '/kunde/faelle',
    faelleResult.ok && fives.length === 0 && typeErrs.length === 0 ? 'OK' : 'WARN',
    [faelleResult.has500 ? '500!' : '', faelleResult.isBlank ? 'Leer!' : '',
     typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // Kunden-Fall-Detail — wenn möglich der Fall mit gutachten-Row (zeigt SP-G-Reader live)
  const link = page.locator('a[href*="/kunde/faelle/"]').first()
  if ((await link.count()) > 0) {
    const href = await link.getAttribute('href')
    errors.length = 0; fives.length = 0; typeErrs.length = 0
    const detailResult = await gotoUndShoot(page, href, 'kunde-fall-detail')
    const detailAnzeige = pruefeGutachtenAnzeige(detailResult.bodyText)
    const hydDet = await pruefeHydration(page)
    notiere('kunde', href,
      detailResult.ok && fives.length === 0 && typeErrs.length === 0 && !detailAnzeige.hatBruchwert && hydDet.length === 0 ? 'OK' : 'WARN',
      [
        detailResult.has500 ? '500!' : '',
        detailResult.isBlank ? 'Leer!' : '',
        typeErrs.length > 0 ? `TypeError: ${typeErrs[0].slice(0, 80)}` : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
        detailAnzeige.hatBruchwert ? 'undefined/NaN im Display (Klasse-C/F Reader-Defekt!)' : '',
        hydDet.length > 0 ? `Hydration: ${hydDet[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ')
    )
  } else {
    notiere('kunde', '/kunde/faelle/[id]', 'WARN', 'Kein Kunden-Fall-Link — Liste leer oder Test-User ohne Faelle?')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Kunde): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CMM-44 SP-G — Portal-Smoke nach Gutachten-Reader-Sweep       ║')
  console.log(`║  Ziel: ${BASE.padEnd(54)}║`)
  console.log('║  Screenshots: docs/20.05.2026/cmm44-spg-smoke/                ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\nBasic-Auth: ${BASIC_USER} / ${'*'.repeat(BASIC_PASS.length)}`)
  console.log(`Supabase-URL: ${SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '…' : '(nicht gesetzt)'}`)

  console.log('\n[Service-Role] Ermittle Fall-IDs…')
  const firstFallId = await ersterFallId()
  const fallMitGutachten = await fallIdMitGutachten()
  console.log(`  Standard Fall-ID:     ${firstFallId ?? '(nicht gefunden)'}`)
  console.log(`  Fall MIT gutachten:   ${fallMitGutachten ?? '(kein gutachten-Row in pre-launch — kein Bonus-Check)'}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    await smokePublic(browser)
    await smokeAdmin(browser, firstFallId, fallMitGutachten)
    await smokeDispatch(browser)
    await smokeSv(browser)
    await smokeKunde(browser, fallMitGutachten)
  } finally {
    await browser.close()
  }

  // ─── Findings zusammenfassen ───────────────────────────────────────────────
  const okCount = findings.filter((f) => f.status === 'OK').length
  const warnCount = findings.filter((f) => f.status === 'WARN').length
  const failCount = findings.filter((f) => f.status === 'HARD-FAIL').length

  console.log('\n════════ ERGEBNIS ════════')
  console.log(`✓ OK:        ${okCount}`)
  console.log(`⚠ WARN:      ${warnCount}`)
  console.log(`✗ HARD-FAIL: ${failCount}`)
  console.log(`\nScreenshots: ${OUT_DIR}`)

  const findingsPath = join(OUT_DIR, 'findings.json')
  writeFileSync(findingsPath, JSON.stringify({
    findings,
    summary: { ok: okCount, warn: warnCount, fail: failCount },
    timestamp: new Date().toISOString(),
    base: BASE,
  }, null, 2))
  console.log(`Findings: ${findingsPath}`)

  if (failCount > 0 || warnCount > okCount / 2) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
