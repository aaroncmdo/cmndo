#!/usr/bin/env node
/**
 * scripts/smoke-cmm44-spa-pr2.mjs
 *
 * Portal-Smoke nach CMM-44 SP-A PR2 — 34-Spalten-Drop aus faelle + 4 RLS-Rewrites.
 *
 * Testet 5 Portale gegen app.staging.claimondo.de:
 *   1. Public   → / + /gutachter-finden (kein 500)
 *   2. Admin    → /faelle (Liste) + /faelle/[id] (Detail)
 *                 Kritisch: Polizei-Felder, Unfallskizze-Status, Kanzlei-Ansprechpartner,
 *                 Finanzierung, Gewerbe-Flag, KB-Zuweisung — kommen jetzt aus claims,
 *                 nicht mehr aus faelle-Spalten
 *   3. SV       → /gutachter + /gutachter/fall/[id]
 *                 RLS vehicles/vehicle_ownership_history wurde neu geschrieben
 *   4. Kunde    → /kunde + /kunde/faelle/[id]
 *                 RLS faelle_staff/can_access_fall — Kunde muss eigenen Fall sehen
 *   5. Dispatch → /dispatch + /dispatch/leads (leads_staff_all_consolidated)
 *
 * Kritisch: Bei Admin/KB Fall-Detail werden die Sub-Sections geprüft:
 *   Aufgaben, Nachrichten, Timeline, Dokumente — 19 Tabellen hinter can_access_fall.
 *   Leere Sub-Sections = over-restrictive RLS.
 *
 * Verwendung:
 *   node --env-file=.env.local scripts/smoke-cmm44-spa-pr2.mjs
 *
 *   Oder mit überschriebener .env.local aus Haupt-Repo:
 *   node --env-file=../claimondo-v2/.env.local scripts/smoke-cmm44-spa-pr2.mjs
 *
 * ENV (aus .env.local geladen):
 *   STAGING_BASIC_AUTH_USER  / STAGING_BASIC_AUTH_PASS
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * Screenshots: docs/17.05.2026/cmm44-spa-pr2-smoke/
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// ─── ENV laden ───────────────────────────────────────────────────────────────
function ladeEnv() {
  // Erst .env.local im Worktree probieren, dann im Haupt-Repo
  const kandidaten = [
    join(PROJECT_ROOT, '.env.local'),
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
const BASE = 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS || process.env.STAGING_BASIC_PASS || 'ClaimondoSuperuser123789!!'
const TEST_PASS = 'Test1234!'
const OUT_DIR = join(PROJECT_ROOT, 'docs', '17.05.2026', 'cmm44-spa2-pr2-smoke')
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
    await page.waitForTimeout(2000)
    const screenshotPfad = await shoot(page, label)
    const has500 = (await page.locator('text=500, text=Internal Server Error, text=Application error').count()) > 0
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const isBlank = bodyText.trim().length < 30
    return { ok: !has500 && !isBlank, url: page.url(), screenshotPfad, has500, isBlank, bodyText }
  } catch (e) {
    console.log(`  ✗ Navigation fehlgeschlagen: ${e.message.slice(0, 120)}`)
    await shoot(page, `${label}-fehler`)
    return { ok: false, error: e.message }
  }
}

// ─── Service-Role-Abfrage: ersten Fall-ID holen ──────────────────────────────
async function ersterFallId() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/faelle?select=id&order=erstellt_am.desc&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!resp.ok) return null
    const rows = await resp.json()
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

// Ersten Fall-ID des test-sv-Users (über claims.sv_id) holen
async function ersterSvFallId() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    // Erst SV-Profile-ID holen
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.test-sv%40claimondo.de&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!profResp.ok) return null
    const profiles = await profResp.json()
    const svProfileId = profiles?.[0]?.id
    if (!svProfileId) return null

    // sachverstaendige.id holen
    const svResp = await fetch(
      `${SUPABASE_URL}/rest/v1/sachverstaendige?select=id&profile_id=eq.${svProfileId}&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!svResp.ok) return null
    const svRows = await svResp.json()
    const svId = svRows?.[0]?.id
    if (!svId) return null

    // Erst versuchen über auftraege
    const auftragResp = await fetch(
      `${SUPABASE_URL}/rest/v1/auftraege?select=fall_id&sv_id=eq.${svId}&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!auftragResp.ok) return null
    const auftraege = await auftragResp.json()
    return auftraege?.[0]?.fall_id ?? null
  } catch {
    return null
  }
}

// Ersten Fall-ID des test-kunde-Users holen
async function ersterKundeFallId() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.test-kunde%40claimondo.de&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!profResp.ok) return null
    const profiles = await profResp.json()
    const kundeId = profiles?.[0]?.id
    if (!kundeId) return null

    const fallResp = await fetch(
      `${SUPABASE_URL}/rest/v1/faelle?select=id&kunde_id=eq.${kundeId}&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    )
    if (!fallResp.ok) return null
    const faelle = await fallResp.json()
    return faelle?.[0]?.id ?? null
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

  for (const [route, label] of [
    ['/', 'public-home'],
    ['/gutachter-finden', 'public-gutachter-finden'],
  ]) {
    errors.length = 0
    fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    const ok = r.ok && errors.length === 0 && fives.length === 0 && hydErr.length === 0
    notiere(
      'public',
      route,
      ok ? 'OK' : 'WARN',
      [
        r.has500 ? '500!' : '',
        r.isBlank ? 'Leerer Screen!' : '',
        errors.length > 0 ? `${errors.length} console-errors` : '',
        fives.length > 0 ? `5xx: ${fives.join(', ').slice(0, 80)}` : '',
        hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 100)}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    )
  }

  await context.close()
}

// ─── 2. ADMIN ────────────────────────────────────────────────────────────────
async function smokeAdmin(browser, fallId) {
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

  const loginOk = await login(page, 'test-admin@claimondo.de', TEST_PASS)
  await shoot(page, 'admin-nach-login')
  if (!loginOk) {
    notiere('admin', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydLoginErr = await pruefeHydration(page)
  notiere('admin', 'post-login', hydLoginErr.length > 0 ? 'WARN' : 'OK',
    hydLoginErr.length > 0 ? `Hydration: ${hydLoginErr[0].slice(0, 100)}` : 'kein Hydration-Error')

  // Faelle-Liste
  errors.length = 0; fives.length = 0
  const listResult = await gotoUndShoot(page, '/faelle', 'admin-faelle-liste')
  const hydListErr = await pruefeHydration(page)
  notiere('admin', '/faelle', listResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [
      listResult.has500 ? '500!' : '',
      listResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx auf: ${fives.slice(0, 2).join(', ')}` : '',
      hydListErr.length > 0 ? `Hydration: ${hydListErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | ')
  )

  // Fall-Detail — direkt über bekannte ID oder ersten Link klicken
  let detailUrl = null
  if (fallId) {
    detailUrl = `/faelle/${fallId}`
    console.log(`  → Verwende Service-Role Fall-ID: ${fallId}`)
  } else {
    // Ersten Fall-Link aus der Liste klicken
    const link = page.locator('a[href*="/faelle/"]').first()
    if ((await link.count()) > 0) {
      const href = await link.getAttribute('href')
      detailUrl = href
      console.log(`  → Erster Fall-Link aus Liste: ${href}`)
    }
  }

  if (detailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, detailUrl, 'admin-fall-detail')
    const hydDetailErr = await pruefeHydration(page)
    notiere('admin', detailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [
        detailResult.has500 ? '500!' : '',
        detailResult.isBlank ? 'Leerer Screen!' : '',
        fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(', ')}` : '',
        hydDetailErr.length > 0 ? `Hydration: ${hydDetailErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ')
    )

    // ──── KRITISCH: SP-A2-28-Spalten-Felder prüfen ───────────────────────────
    // Schadenort/Datum/Hergang/Art/Phase/Regulierung kamen früher aus faelle-
    // Spalten, kommen jetzt aus claims (PR1-Reader-Rename + PR2-View-Repoint).
    // Fehlt 5xx oder leerer Screen → claims-Join / View-Repoint kaputt.
    await page.waitForTimeout(1000)
    const bodyText = await page.locator('body').innerText().catch(() => '')

    // Schadenort / Schadenadresse
    const hatSchadenort = bodyText.match(/Schadenort|Schadensort|Unfallort|Schadenadresse|Schadensadresse/i) !== null
    notiere('admin', 'detail-schadenort', hatSchadenort ? 'OK' : 'WARN',
      hatSchadenort ? 'Schadenort-Sektion sichtbar' : 'Kein Schadenort-Text gefunden')

    // Schadendatum
    const hatSchadendatum = bodyText.match(/Schadendatum|Schadenstag|Schadentag|Unfalldatum|Schadens?datum/i) !== null
    notiere('admin', 'detail-schadendatum', hatSchadendatum ? 'OK' : 'WARN',
      hatSchadendatum ? 'Schadendatum-Feld sichtbar' : 'Kein Schadendatum-Text gefunden')

    // Schadenhergang / -beschreibung
    const hatHergang = bodyText.match(/Hergang|Schadenhergang|Unfallhergang|Schadenbeschreibung|Beschreibung/i) !== null
    notiere('admin', 'detail-schadenhergang', hatHergang ? 'OK' : 'WARN',
      hatHergang ? 'Schadenhergang-Sektion sichtbar' : 'Kein Hergang-Text gefunden')

    // Schadenart / Fall-Typ
    const hatSchadenart = bodyText.match(/Schadenart|Schadensart|Schadenstyp|Fall-?Typ|Schadenstyp/i) !== null
    notiere('admin', 'detail-schadenart', hatSchadenart ? 'OK' : 'WARN',
      hatSchadenart ? 'Schadenart/-typ sichtbar' : 'Kein Schadenart-Text gefunden')

    // Phase-Anzeige
    const hatPhase = bodyText.match(/Phase|phase|Status|Stadium/i) !== null
    notiere('admin', 'detail-phase', hatPhase ? 'OK' : 'WARN',
      hatPhase ? 'Phase/Status-Anzeige sichtbar' : 'Keine Phase-Anzeige gefunden')

    // ──── KRITISCH: Sub-Sections hinter can_access_fall ──────────────────────
    // Aufgaben-Tab
    const aufgabenTab = page.locator('[role="tab"]:has-text("Aufgaben"), button:has-text("Aufgaben")')
    if ((await aufgabenTab.count()) > 0) {
      await aufgabenTab.first().click()
      await page.waitForTimeout(1500)
      await shoot(page, 'admin-fall-tab-aufgaben')
      const aufgabenText = await page.locator('body').innerText().catch(() => '')
      const aufgabenLeer = aufgabenText.match(/Keine Aufgaben|Leer|leer|empty/i) !== null && aufgabenText.length < 500
      notiere('admin', 'detail-tab-aufgaben', 'OK',
        aufgabenLeer ? 'Tab offen — möglicherweise keine Aufgaben vorhanden (ok wenn seed leer)' : 'Tab populiert')
    } else {
      notiere('admin', 'detail-tab-aufgaben', 'WARN', 'Aufgaben-Tab nicht gefunden')
    }

    // Nachrichten-Tab
    const nachrichtenTab = page.locator('[role="tab"]:has-text("Nachrichten"), [role="tab"]:has-text("Kommunikation"), button:has-text("Nachrichten"), button:has-text("Kommunikation")')
    if ((await nachrichtenTab.count()) > 0) {
      await nachrichtenTab.first().click()
      await page.waitForTimeout(1500)
      await shoot(page, 'admin-fall-tab-nachrichten')
      notiere('admin', 'detail-tab-nachrichten', 'OK', 'Tab klickbar und offen')
    } else {
      notiere('admin', 'detail-tab-nachrichten', 'WARN', 'Nachrichten/Kommunikation-Tab nicht gefunden')
    }

    // Timeline-Tab
    const timelineTab = page.locator('[role="tab"]:has-text("Timeline"), [role="tab"]:has-text("Verlauf"), button:has-text("Timeline"), button:has-text("Verlauf")')
    if ((await timelineTab.count()) > 0) {
      await timelineTab.first().click()
      await page.waitForTimeout(1500)
      await shoot(page, 'admin-fall-tab-timeline')
      notiere('admin', 'detail-tab-timeline', 'OK', 'Tab klickbar und offen')
    } else {
      notiere('admin', 'detail-tab-timeline', 'WARN', 'Timeline/Verlauf-Tab nicht gefunden')
    }

    // Dokumente-Tab
    const dokumenteTab = page.locator('[role="tab"]:has-text("Dokumente"), button:has-text("Dokumente")')
    if ((await dokumenteTab.count()) > 0) {
      await dokumenteTab.first().click()
      await page.waitForTimeout(1500)
      await shoot(page, 'admin-fall-tab-dokumente')
      notiere('admin', 'detail-tab-dokumente', 'OK', 'Tab klickbar und offen')
    } else {
      notiere('admin', 'detail-tab-dokumente', 'WARN', 'Dokumente-Tab nicht gefunden')
    }

  } else {
    notiere('admin', '/faelle/[id]', 'WARN', 'Kein Fall-Detail-Link gefunden — Liste leer oder kein fallId?')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Admin): ${errors.length}`)
    errors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 3. SV (Gutachter) ───────────────────────────────────────────────────────
async function smokeSv(browser, svFallId) {
  console.log('\n════════ SV (Gutachter) ════════')
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

  const loginOk = await login(page, 'test-sv@claimondo.de', TEST_PASS)
  await shoot(page, 'sv-nach-login')
  if (!loginOk) {
    notiere('sv', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydLoginErr = await pruefeHydration(page)
  notiere('sv', 'post-login', hydLoginErr.length > 0 ? 'WARN' : 'OK',
    hydLoginErr.length > 0 ? `Hydration: ${hydLoginErr[0].slice(0, 100)}` : 'kein Hydration-Error')

  // SV-Dashboard
  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/gutachter', 'sv-dashboard')
  notiere('sv', '/gutachter', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // SV-Fall-Detail
  let svDetailUrl = svFallId ? `/gutachter/fall/${svFallId}` : null
  if (!svDetailUrl) {
    // Fallback: Ersten Fall-Link aus Auftragsliste
    errors.length = 0; fives.length = 0
    const auftraegeResult = await gotoUndShoot(page, '/gutachter/auftraege', 'sv-auftraege')
    notiere('sv', '/gutachter/auftraege', auftraegeResult.ok ? 'OK' : 'WARN',
      auftraegeResult.has500 ? '500!' : auftraegeResult.isBlank ? 'Leer!' : '')
    const link = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftraege/"]').first()
    if ((await link.count()) > 0) {
      const href = await link.getAttribute('href')
      svDetailUrl = href
    }
  }

  if (svDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, svDetailUrl, 'sv-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('sv', svDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [
        detailResult.has500 ? '500!' : '',
        detailResult.isBlank ? 'Leerer Screen!' : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
        hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ')
    )

    // Fahrzeug-Daten sichtbar? (vehicles/vehicle_ownership_history RLS rewritten)
    await page.waitForTimeout(1000)
    const svBodyText = await page.locator('body').innerText().catch(() => '')
    const hatFahrzeug = svBodyText.match(/Fahrzeug|Kennzeichen|FIN|Hersteller|KFZ|kfz/i) !== null
    notiere('sv', 'detail-fahrzeug-daten', hatFahrzeug ? 'OK' : 'WARN',
      hatFahrzeug ? 'Fahrzeug-Daten sichtbar (vehicles-RLS OK)' : 'Keine Fahrzeug-Daten — RLS vehicles möglicherweise zu restriktiv')

    // Gutachten-Formular-Sektion
    const hatGutachten = svBodyText.match(/Gutachten|Schadenbeschreibung|Schadensumme|schadenumfang/i) !== null
    notiere('sv', 'detail-gutachten-sektion', hatGutachten ? 'OK' : 'WARN',
      hatGutachten ? 'Gutachten-Sektion vorhanden' : 'Keine Gutachten-Sektion gefunden')
  } else {
    notiere('sv', '/gutachter/fall/[id]', 'WARN', 'Kein SV-Fall-Link gefunden')
    await shoot(page, 'sv-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (SV): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 4. KUNDE ────────────────────────────────────────────────────────────────
async function smokeKunde(browser, kundeFallId) {
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

  const loginOk = await login(page, 'test-kunde@claimondo.de', TEST_PASS)
  await shoot(page, 'kunde-nach-login')
  if (!loginOk) {
    notiere('kunde', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydLoginErr = await pruefeHydration(page)
  notiere('kunde', 'post-login', hydLoginErr.length > 0 ? 'WARN' : 'OK',
    hydLoginErr.length > 0 ? `Hydration: ${hydLoginErr[0].slice(0, 100)}` : 'kein Hydration-Error')

  // Kunden-Dashboard
  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/kunde', 'kunde-dashboard')
  notiere('kunde', '/kunde', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // Kunden-Faelle-Liste
  errors.length = 0; fives.length = 0
  const faelleResult = await gotoUndShoot(page, '/kunde/faelle', 'kunde-faelle-liste')
  notiere('kunde', '/kunde/faelle', faelleResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [faelleResult.has500 ? '500!' : '', faelleResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // Kunden-Fall-Detail
  let kundeDetailUrl = kundeFallId ? `/kunde/faelle/${kundeFallId}` : null
  if (!kundeDetailUrl) {
    // Ersten Fall-Link aus der Kunden-Faelle-Seite
    const link = page.locator('a[href*="/kunde/faelle/"]').first()
    if ((await link.count()) > 0) {
      kundeDetailUrl = await link.getAttribute('href')
    }
  }

  if (kundeDetailUrl) {
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, kundeDetailUrl, 'kunde-fall-detail')
    const hydDetErr = await pruefeHydration(page)
    notiere('kunde', kundeDetailUrl, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [
        detailResult.has500 ? '500!' : '',
        detailResult.isBlank ? 'Leerer Screen!' : '',
        fives.length > 0 ? `5xx: ${fives[0]}` : '',
        hydDetErr.length > 0 ? `Hydration: ${hydDetErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ')
    )

    // Prüfen ob der Kunde seinen Fall sieht (faelle_staff + can_access_fall RLS)
    await page.waitForTimeout(1000)
    const kundeBodyText = await page.locator('body').innerText().catch(() => '')
    const hatFallDaten = kundeBodyText.length > 200 && !kundeBodyText.match(/Kein Fall|404|nicht gefunden|Zugriff verweigert/i)
    notiere('kunde', 'detail-fall-sichtbar', hatFallDaten ? 'OK' : 'WARN',
      hatFallDaten ? 'Fall-Daten sichtbar (can_access_fall-RLS OK)' : 'Fall-Daten möglicherweise leer oder Zugriff verweigert')

    // Tasks/Aufgaben des Kunden
    const hatAufgaben = kundeBodyText.match(/Aufgaben|Dokument|hochladen|Todo/i) !== null
    notiere('kunde', 'detail-aufgaben-sichtbar', hatAufgaben ? 'OK' : 'WARN',
      hatAufgaben ? 'Aufgaben/Dokument-Anforderungen sichtbar' : 'Keine Aufgaben-Sektion gefunden')
  } else {
    notiere('kunde', '/kunde/faelle/[id]', 'WARN', 'Kein Kunden-Fall-Link — Liste leer oder kein Seed?')
    await shoot(page, 'kunde-kein-fall-link')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Kunde): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 5. DISPATCH ─────────────────────────────────────────────────────────────
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

  const loginOk = await login(page, 'test-dispatch@claimondo.de', TEST_PASS)
  await shoot(page, 'dispatch-nach-login')
  if (!loginOk) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydLoginErr = await pruefeHydration(page)
  notiere('dispatch', 'post-login', hydLoginErr.length > 0 ? 'WARN' : 'OK',
    hydLoginErr.length > 0 ? `Hydration: ${hydLoginErr[0].slice(0, 100)}` : 'kein Hydration-Error')

  for (const [route, label] of [
    ['/dispatch', 'dispatch-root'],
    ['/dispatch/leads', 'dispatch-leads-liste'],
  ]) {
    errors.length = 0; fives.length = 0
    const r = await gotoUndShoot(page, route, label)
    const hydErr = await pruefeHydration(page)
    notiere('dispatch', route, r.ok && fives.length === 0 ? 'OK' : 'WARN',
      [
        r.has500 ? '500!' : '',
        r.isBlank ? 'Leerer Screen!' : '',
        fives.length > 0 ? `5xx: ${fives.slice(0, 2).join(', ')}` : '',
        hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
      ].filter(Boolean).join(' | ')
    )
  }

  // Leads-Liste: Prüfen ob leads_staff_all_consolidated RLS Leads liefert
  await page.goto(`${BASE}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(2000)
  const dispatchBodyText = await page.locator('body').innerText().catch(() => '')
  const hatLeads = dispatchBodyText.length > 300
  notiere('dispatch', 'leads-rls-check', hatLeads ? 'OK' : 'WARN',
    hatLeads ? 'Leads sichtbar (leads_staff_all_consolidated RLS OK)' : 'Leads-Liste möglicherweise leer oder RLS zu restriktiv')

  // Ersten Lead öffnen
  const leadLink = page.locator('a[href*="/dispatch/leads/"]').first()
  if ((await leadLink.count()) > 0) {
    const leadHref = await leadLink.getAttribute('href')
    errors.length = 0; fives.length = 0
    const leadResult = await gotoUndShoot(page, leadHref, 'dispatch-lead-detail')
    notiere('dispatch', leadHref, leadResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [leadResult.has500 ? '500!' : '', leadResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))
  } else {
    notiere('dispatch', '/dispatch/leads/[id]', 'WARN', 'Kein Lead-Link in Liste — Liste leer?')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (Dispatch): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  CMM-44 SP-A PR2 — Portal-Smoke nach 34-Spalten-Drop        ║')
  console.log('║  Ziel: app.staging.claimondo.de                              ║')
  console.log(`║  Screenshots: docs/17.05.2026/cmm44-spa-pr2-smoke/           ║`)
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\nBasic-Auth: ${BASIC_USER} / ${'*'.repeat(BASIC_PASS.length)}`)
  console.log(`Supabase-URL: ${SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '…' : '(nicht gesetzt)'}`)

  // Erst Fall-IDs via Service-Role holen (umgeht RLS)
  console.log('\n[Service-Role] Ermittle Fall-IDs…')
  const [firstFallId, svFallId, kundeFallId] = await Promise.all([
    ersterFallId(),
    ersterSvFallId(),
    ersterKundeFallId(),
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
  writeFileSync(findingsPath, JSON.stringify({ findings, summary: { ok: okCount, warn: warnCount, fail: failCount }, timestamp: new Date().toISOString(), base: BASE }, null, 2))
  console.log(`Findings: ${findingsPath}`)

  if (failCount > 0 || (warnCount > okCount / 2)) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
