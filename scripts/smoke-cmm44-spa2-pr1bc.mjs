#!/usr/bin/env node
/**
 * scripts/smoke-cmm44-spa2-pr1bc.mjs
 *
 * Portal-Smoke nach CMM-44 SP-A2 PR1b (#1418) + PR1c (#1419).
 *
 * Beide PRs sind Reader-Renames (kein DB-Schema-Change): 17 faelle-Spalten von
 * faelle-Reads auf claims-Reads umgestellt.
 *
 *   PR1b (Cluster 2): hergang_kunde_text (Schadenhergang/-beschreibung),
 *     schadenart, fall_typ, Personenschaden-/Sachschaden-/Mietwagen-/
 *     Halter-ungleich-Fahrer-Flags, Nutzungsausfall.
 *   PR1c (Cluster 3): Gegner-Aktenzeichen, No-Show-Zaehler, Phase,
 *     Lead-Verknuepfung, Regulierungsbetrag, VS-Ablehnungsgrund.
 *
 * Ziel: die Werte erscheinen in der UI unveraendert + kein Portal crasht.
 *
 * Testet 6 Oberflaechen gegen app.staging.claimondo.de:
 *   1. Public        -> / + /gutachter-finden (kein 500)
 *   2. Admin         -> /faelle + /faelle/[id] (Schadenfelder, Phase, Reg.-Betrag,
 *                       VS-Ablehnungsgrund, Gegner-Aktenzeichen)
 *   3. Admin-Finance -> /admin/finance (Umsatz-/Provisions-Aggregate, claims-Embeds)
 *   4. SV            -> /gutachter + SV-Fall-Detail (Werte + No-Show-Banner)
 *   5. Kunde         -> /kunde + /kunde/faelle/[id] (Schadenhergang/Flags)
 *   6. Dispatch      -> /dispatch + /dispatch/leads (kein Crash)
 *
 * Verwendung:
 *   node --env-file=../claimondo-v2/.env.local scripts/smoke-cmm44-spa2-pr1bc.mjs
 *
 * Screenshots: docs/17.05.2026/cmm44-spa2-smoke-pr1bc/
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// --- ENV laden ---------------------------------------------------------------
function ladeEnv() {
  const kandidaten = [
    join(PROJECT_ROOT, '.env.local'),
    join(PROJECT_ROOT, '..', 'claimondo-v2', '.env.local'),
    join(PROJECT_ROOT, '..', '..', '..', '..', '.env.local'),
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

// --- Konfiguration -----------------------------------------------------------
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS || process.env.STAGING_BASIC_PASS || 'ClaimondoSuperuser123789!!'
const TEST_PASS = 'Test1234!'
const OUT_DIR = join(PROJECT_ROOT, 'docs', '17.05.2026', 'cmm44-spa2-smoke-pr1bc')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

mkdirSync(OUT_DIR, { recursive: true })

// --- Befunde -----------------------------------------------------------------
const findings = []
function notiere(portal, route, status, notiz = '') {
  findings.push({ portal, route, status, notiz, ts: new Date().toISOString() })
  const icon = status === 'OK' ? '+' : status === 'WARN' ? '!' : 'x'
  console.log(`  ${icon} [${portal}] ${route}: ${status}${notiz ? ' -- ' + notiz : ''}`)
}

// --- Screenshot-Helfer -------------------------------------------------------
let stepCounter = 0
async function shoot(page, label) {
  const nr = String(++stepCounter).padStart(4, '0')
  const safeName = label.replace(/[^a-z0-9_-]/gi, '-').slice(0, 60)
  const pfad = join(OUT_DIR, `${nr}-${safeName}.png`)
  await page.screenshot({ path: pfad, fullPage: false }).catch((e) =>
    console.warn(`  [screenshot] ${safeName} fehlgeschlagen: ${e.message}`)
  )
  console.log(`  [shot] ${nr}-${safeName}.png`)
  return pfad
}

// --- Console-Error-Collector -------------------------------------------------
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

// --- 5xx-Detektor ------------------------------------------------------------
function setup5xxCollector(page) {
  const fives = []
  page.on('response', (resp) => {
    if (resp.status() >= 500) fives.push(`${resp.status()} ${resp.url().slice(0, 150)}`)
  })
  return fives
}

// --- Hydration-Check ---------------------------------------------------------
async function pruefeHydration(page) {
  return page.evaluate(() => {
    const ovls = [...document.querySelectorAll('[data-nextjs-dialog-overlay], #nextjs-toast-errors')]
    return ovls.map((el) => el.innerText).filter(Boolean)
  }).catch(() => [])
}

// --- Login -------------------------------------------------------------------
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
    console.log(`  x Login fehlgeschlagen -- URL: ${url}`)
    return false
  }
  console.log(`  + Login OK -> ${url}`)
  return true
}

// --- Goto + Screenshot -------------------------------------------------------
async function gotoUndShoot(page, route, label) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2200)
    const screenshotPfad = await shoot(page, label)
    const has500 = (await page.locator('text=500, text=Internal Server Error, text=Application error').count()) > 0
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const isBlank = bodyText.trim().length < 30
    return { ok: !has500 && !isBlank, url: page.url(), screenshotPfad, has500, isBlank, bodyText }
  } catch (e) {
    console.log(`  x Navigation fehlgeschlagen: ${e.message.slice(0, 120)}`)
    await shoot(page, `${label}-fehler`)
    return { ok: false, error: e.message, bodyText: '' }
  }
}

// --- Service-Role-Abfragen ---------------------------------------------------
async function sbGet(path) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

// Bevorzugt einen Fall mit moeglichst vielen PR1b/c-relevanten Daten.
async function ersterFallId() {
  // Erst: ein Fall der hergang_kunde_text + schadenart hat (PR1b-Felder)
  const rich = await sbGet(
    'claims?select=fall_id&hergang_kunde_text=not.is.null&order=erstellt_am.desc&limit=1'
  )
  if (Array.isArray(rich) && rich[0]?.fall_id) return rich[0].fall_id
  const rows = await sbGet('faelle?select=id&order=erstellt_am.desc&limit=1')
  return rows?.[0]?.id ?? null
}

async function ersterSvFallId() {
  const profiles = await sbGet('profiles?select=id&email=eq.test-sv%40claimondo.de&limit=1')
  const svProfileId = profiles?.[0]?.id
  if (!svProfileId) return null
  const svRows = await sbGet(`sachverstaendige?select=id&profile_id=eq.${svProfileId}&limit=1`)
  const svId = svRows?.[0]?.id
  if (!svId) return null
  // claims.sv_id ist SSoT (CMM-60)
  const claims = await sbGet(`claims?select=fall_id&sv_id=eq.${svId}&limit=1`)
  if (Array.isArray(claims) && claims[0]?.fall_id) return claims[0].fall_id
  const auftraege = await sbGet(`auftraege?select=fall_id&sv_id=eq.${svId}&limit=1`)
  return auftraege?.[0]?.fall_id ?? null
}

async function ersterKundeFallId() {
  const profiles = await sbGet('profiles?select=id&email=eq.test-kunde%40claimondo.de&limit=1')
  const kundeId = profiles?.[0]?.id
  if (!kundeId) return null
  const faelle = await sbGet(`faelle?select=id&kunde_id=eq.${kundeId}&limit=1`)
  return faelle?.[0]?.id ?? null
}

// --- Feld-Pruefer ------------------------------------------------------------
// Sucht im Body-Text nach einem Label und meldet OK wenn vorhanden.
function pruefeFeld(portal, label, bodyText, ...patterns) {
  const re = new RegExp(patterns.join('|'), 'i')
  const treffer = re.test(bodyText)
  notiere(portal, `feld-${label}`, treffer ? 'OK' : 'WARN',
    treffer ? 'Label/Wert sichtbar' : 'kein Treffer im Body-Text')
  return treffer
}

// Erkennt "undefined" / "null" / "NaN" als Render-Fehler im sichtbaren Text.
function pruefeKaputteWerte(portal, route, bodyText) {
  const kaputt = []
  if (/\bundefined\b/.test(bodyText)) kaputt.push('"undefined"')
  if (/\bNaN\b/.test(bodyText)) kaputt.push('"NaN"')
  if (/>\s*null\s*</.test(bodyText)) kaputt.push('"null"')
  notiere(portal, `${route}-render-werte`, kaputt.length === 0 ? 'OK' : 'WARN',
    kaputt.length === 0 ? 'keine kaputten Werte sichtbar' : `kaputt: ${kaputt.join(', ')}`)
}

// --- 1. PUBLIC ---------------------------------------------------------------
async function smokePublic(browser) {
  console.log('\n======== PUBLIC (kein Login) ========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  for (const [route, label] of [['/', 'public-home'], ['/gutachter-finden', 'public-gutachter-finden']]) {
    errors.length = 0; fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    const ok = r.ok && fives.length === 0 && hydErr.length === 0
    notiere('public', route, ok ? 'OK' : 'WARN',
      [r.has500 ? '500!' : '', r.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives.join(',').slice(0, 80)}` : '',
       hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | '))
  }
  await context.close()
}

// --- 2. ADMIN + 3. FINANCE ---------------------------------------------------
async function smokeAdmin(browser, fallId) {
  console.log('\n======== ADMIN ========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-admin@claimondo.de', TEST_PASS)
  await shoot(page, 'admin-nach-login')
  if (!loginOk) {
    notiere('admin', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // Faelle-Liste
  errors.length = 0; fives.length = 0
  const listResult = await gotoUndShoot(page, '/faelle', 'admin-faelle-liste')
  const hydListErr = await pruefeHydration(page)
  notiere('admin', '/faelle', listResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [listResult.has500 ? '500!' : '', listResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(',')}` : '',
     hydListErr.length > 0 ? `Hydration: ${hydListErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))

  // Fall-Detail
  let detailUrl = null
  if (fallId) {
    detailUrl = `/faelle/${fallId}`
    console.log(`  -> Service-Role Fall-ID: ${fallId}`)
  } else {
    const link = page.locator('a[href*="/faelle/"]').first()
    if ((await link.count()) > 0) detailUrl = await link.getAttribute('href')
  }

  if (detailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, detailUrl, 'admin-fall-detail')
    const hydDetailErr = await pruefeHydration(page)
    notiere('admin', detailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(',')}` : '',
       hydDetailErr.length > 0 ? `Hydration: ${hydDetailErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | '))

    await page.waitForTimeout(1200)
    let bodyText = await page.locator('body').innerText().catch(() => '')

    // PR1b: Schadenhergang / -beschreibung, Schadenart, Fall-Typ
    pruefeFeld('admin', 'schadenhergang', bodyText, 'Schadenhergang', 'Hergang', 'Schadenbeschreibung', 'Unfallhergang')
    pruefeFeld('admin', 'schadenart', bodyText, 'Schadenart', 'Schadensart')
    pruefeFeld('admin', 'fall-typ', bodyText, 'Fall-?Typ', 'Falltyp', 'Art des Falls')
    // PR1b: Flags
    pruefeFeld('admin', 'personenschaden', bodyText, 'Personenschaden')
    pruefeFeld('admin', 'sachschaden', bodyText, 'Sachschaden')
    pruefeFeld('admin', 'mietwagen', bodyText, 'Mietwagen', 'Nutzungsausfall')
    // PR1c: Phase, Regulierungsbetrag, VS-Ablehnungsgrund, Gegner-Aktenzeichen
    pruefeFeld('admin', 'phase', bodyText, 'Phase')
    pruefeFeld('admin', 'gegner-aktenzeichen', bodyText, 'Aktenzeichen', 'Gegner')

    pruefeKaputteWerte('admin', 'fall-detail', bodyText)

    // Versicherung-/Regulierung-Tab (Reg.-Betrag + VS-Ablehnungsgrund leben oft hier)
    const regTab = page.locator('[role="tab"]:has-text("Versicherung"), [role="tab"]:has-text("Regulierung"), button:has-text("Versicherung"), button:has-text("Regulierung")')
    if ((await regTab.count()) > 0) {
      await regTab.first().click().catch(() => {})
      await page.waitForTimeout(1500)
      await shoot(page, 'admin-fall-tab-regulierung')
      bodyText = await page.locator('body').innerText().catch(() => '')
      pruefeFeld('admin', 'regulierungsbetrag', bodyText, 'Regulierung', 'Reguliert', 'Betrag', 'EUR', '€')
      pruefeFeld('admin', 'vs-ablehnungsgrund', bodyText, 'Ablehnung', 'abgelehnt', 'Ablehnungsgrund')
      pruefeKaputteWerte('admin', 'regulierung-tab', bodyText)
    } else {
      notiere('admin', 'tab-regulierung', 'WARN', 'Versicherung/Regulierung-Tab nicht gefunden')
    }
  } else {
    notiere('admin', '/faelle/[id]', 'WARN', 'Kein Fall-Detail-Link gefunden')
  }

  // --- 3. ADMIN-FINANCE (PR1c: Finance-Queries auf claims-Embeds) ----------
  console.log('\n======== ADMIN-FINANCE ========')
  errors.length = 0; fives.length = 0
  const finResult = await gotoUndShoot(page, '/admin/finance', 'admin-finance')
  const hydFinErr = await pruefeHydration(page)
  notiere('finance', '/admin/finance', finResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [finResult.has500 ? '500!' : '', finResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(',')}` : '',
     hydFinErr.length > 0 ? `Hydration: ${hydFinErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | '))
  if (finResult.ok) {
    await page.waitForTimeout(1200)
    const finBody = await page.locator('body').innerText().catch(() => '')
    pruefeFeld('finance', 'umsatz-aggregat', finBody, 'Umsatz', 'Einnahmen', 'EUR', '€')
    pruefeFeld('finance', 'provision-aggregat', finBody, 'Provision', 'Provisionen')
    pruefeKaputteWerte('finance', 'finance', finBody)
  }

  if (errors.length > 0) {
    console.log(`  ! Console-Errors (Admin): ${errors.length}`)
    errors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// --- 4. SV -------------------------------------------------------------------
async function smokeSv(browser, svFallId) {
  console.log('\n======== SV (Gutachter) ========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-sv@claimondo.de', TEST_PASS)
  await shoot(page, 'sv-nach-login')
  if (!loginOk) {
    notiere('sv', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/gutachter', 'sv-dashboard')
  notiere('sv', '/gutachter', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  let svDetailUrl = svFallId ? `/gutachter/fall/${svFallId}` : null
  if (!svDetailUrl) {
    errors.length = 0; fives.length = 0
    await gotoUndShoot(page, '/gutachter/auftraege', 'sv-auftraege')
    const link = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftraege/"]').first()
    if ((await link.count()) > 0) svDetailUrl = await link.getAttribute('href')
  }

  if (svDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, svDetailUrl, 'sv-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('sv', svDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives[0]}` : '',
       hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | '))

    await page.waitForTimeout(1200)
    const svBody = await page.locator('body').innerText().catch(() => '')
    pruefeFeld('sv', 'schadenhergang', svBody, 'Schadenhergang', 'Hergang', 'Schadenbeschreibung', 'Unfallhergang')
    pruefeFeld('sv', 'schadenart', svBody, 'Schadenart', 'Schadensart')
    // PR1c: No-Show-Banner (no_show_zaehler)
    const hatNoShow = /No-?Show|nicht erschienen|Termin verpasst/i.test(svBody)
    notiere('sv', 'no-show-banner', 'OK',
      hatNoShow ? 'No-Show-Hinweis sichtbar' : 'kein No-Show-Banner (ok wenn Fall keine No-Shows hat)')
    pruefeKaputteWerte('sv', 'fall-detail', svBody)
  } else {
    notiere('sv', '/gutachter/fall/[id]', 'WARN', 'Kein SV-Fall-Link gefunden')
    await shoot(page, 'sv-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ! Console-Errors (SV): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// --- 5. KUNDE ----------------------------------------------------------------
async function smokeKunde(browser, kundeFallId) {
  console.log('\n======== KUNDE ========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-kunde@claimondo.de', TEST_PASS)
  await shoot(page, 'kunde-nach-login')
  if (!loginOk) {
    notiere('kunde', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/kunde', 'kunde-dashboard')
  notiere('kunde', '/kunde', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  let kundeDetailUrl = kundeFallId ? `/kunde/faelle/${kundeFallId}` : null
  if (!kundeDetailUrl) {
    errors.length = 0; fives.length = 0
    await gotoUndShoot(page, '/kunde/faelle', 'kunde-faelle-liste')
    const link = page.locator('a[href*="/kunde/faelle/"]').first()
    if ((await link.count()) > 0) kundeDetailUrl = await link.getAttribute('href')
  }

  if (kundeDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, kundeDetailUrl, 'kunde-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('kunde', kundeDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives[0]}` : '',
       hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | '))

    await page.waitForTimeout(1200)
    const kBody = await page.locator('body').innerText().catch(() => '')
    pruefeFeld('kunde', 'schadenhergang', kBody, 'Schadenhergang', 'Hergang', 'Schadenbeschreibung', 'Unfallhergang')
    pruefeFeld('kunde', 'schadenart', kBody, 'Schadenart', 'Schadensart')
    pruefeKaputteWerte('kunde', 'fall-detail', kBody)
  } else {
    notiere('kunde', '/kunde/faelle/[id]', 'WARN', 'Kein Kunden-Fall-Link gefunden')
    await shoot(page, 'kunde-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ! Console-Errors (Kunde): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// --- 6. DISPATCH -------------------------------------------------------------
async function smokeDispatch(browser) {
  console.log('\n======== DISPATCH ========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
    locale: 'de-DE', timezoneId: 'Europe/Berlin', ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  const errors = setupConsoleCollector(page)
  const fives = setup5xxCollector(page)

  const loginOk = await login(page, 'test-dispatch@claimondo.de', TEST_PASS)
  await shoot(page, 'dispatch-nach-login')
  if (!loginOk) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  for (const [route, label] of [['/dispatch', 'dispatch-root'], ['/dispatch/leads', 'dispatch-leads-liste']]) {
    errors.length = 0; fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    notiere('dispatch', route, r.ok && fives.length === 0 ? 'OK' : 'WARN',
      [r.has500 ? '500!' : '', r.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(',')}` : '',
       hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | '))
  }

  if (errors.length > 0) {
    console.log(`  ! Console-Errors (Dispatch): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }
  await context.close()
}

// --- MAIN --------------------------------------------------------------------
async function main() {
  console.log('=================================================================')
  console.log('  CMM-44 SP-A2 PR1b (#1418) + PR1c (#1419) -- Portal-Smoke')
  console.log('  Ziel: app.staging.claimondo.de')
  console.log('  Screenshots: docs/17.05.2026/cmm44-spa2-smoke-pr1bc/')
  console.log('=================================================================')
  console.log(`\nBasic-Auth: ${BASIC_USER} / ${'*'.repeat(BASIC_PASS.length)}`)
  console.log(`Supabase-URL: ${SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '...' : '(nicht gesetzt)'}`)

  console.log('\n[Service-Role] Ermittle Fall-IDs...')
  const [firstFallId, svFallId, kundeFallId] = await Promise.all([
    ersterFallId(), ersterSvFallId(), ersterKundeFallId(),
  ])
  console.log(`  Admin-Fall-ID:  ${firstFallId ?? '(nicht gefunden)'}`)
  console.log(`  SV-Fall-ID:     ${svFallId ?? '(nicht gefunden)'}`)
  console.log(`  Kunden-Fall-ID: ${kundeFallId ?? '(nicht gefunden)'}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    await smokePublic(browser)
    await smokeAdmin(browser, firstFallId)
    await smokeSv(browser, svFallId)
    await smokeKunde(browser, kundeFallId)
    await smokeDispatch(browser)
  } finally {
    await browser.close()
  }

  const okCount = findings.filter((f) => f.status === 'OK').length
  const warnCount = findings.filter((f) => f.status === 'WARN').length
  const failCount = findings.filter((f) => f.status === 'HARD-FAIL').length

  console.log('\n======== ERGEBNIS ========')
  console.log(`+ OK:        ${okCount}`)
  console.log(`! WARN:      ${warnCount}`)
  console.log(`x HARD-FAIL: ${failCount}`)
  console.log(`\nScreenshots: ${OUT_DIR}`)

  const findingsPath = join(OUT_DIR, 'findings.json')
  writeFileSync(findingsPath, JSON.stringify(
    { findings, summary: { ok: okCount, warn: warnCount, fail: failCount }, timestamp: new Date().toISOString(), base: BASE },
    null, 2))
  console.log(`Findings: ${findingsPath}`)

  if (failCount > 0) process.exit(1)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
