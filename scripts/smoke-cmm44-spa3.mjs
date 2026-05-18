#!/usr/bin/env node
/**
 * scripts/smoke-cmm44-spa3.mjs
 *
 * Portal-Smoke nach CMM-44 SP-A3 — fall_nummer-Reader-Sweep.
 *
 * Kontext: faelle.fall_nummer wird abgeschafft, claims.claim_nummer ist
 * kanonisch. PR1 hat claim_nummer zu 5 Views ergaenzt
 * (v_faelle_mit_aktuellem_termin, faelle_kunde_view, faelle_sv_view,
 * v_claim_full, v_claim_listing). PR2 (Reader-Sweep, Tasks 3-9) baut alle
 * src-Reader von fall_nummer auf claim_nummer um. fall_nummer bleibt
 * DB-seitig vorerst bestehen (Drop erst PR3).
 *
 * Dieses Script verifiziert: in JEDEM Portal wird auf mind. einer Seite
 * eine Aktennummer angezeigt — d.h. der claim_nummer-Reader funktioniert
 * und kein 5xx / leerer Screen auftritt.
 *
 * Testet 5 Portale gegen app.staging.claimondo.de:
 *   1. Public   → / + /gutachter-finden (kein 5xx)
 *   2. Admin    → /faelle (Liste, Aktennummer-Spalte) + /faelle/[id] (Detail)
 *   3. Dispatch → /dispatch + /dispatch/leads (Leads-Liste / Karte)
 *   4. SV       → /gutachter + /gutachter/auftraege (Fall-Liste)
 *   5. Kunde    → /kunde + /kunde/faelle (Fall-Uebersicht)
 *
 * Verwendung (NICHT jetzt ausfuehren — staging hat SP-A3-Code noch nicht):
 *   node --env-file=.env.local scripts/smoke-cmm44-spa3.mjs
 *
 *   Oder mit .env.local aus Haupt-Repo:
 *   node --env-file=../claimondo-v2/.env.local scripts/smoke-cmm44-spa3.mjs
 *
 * ENV:
 *   SMOKE_BASE_URL           (Default: https://app.staging.claimondo.de)
 *   STAGING_BASIC_AUTH_USER  / STAGING_BASIC_AUTH_PASS
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *
 * Screenshots: docs/17.05.2026/cmm44-spa3-smoke/
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
const BASE = process.env.SMOKE_BASE_URL || 'https://app.staging.claimondo.de'
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER || process.env.STAGING_BASIC_USER || 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS || process.env.STAGING_BASIC_PASS || 'ClaimondoSuperuser123789!!'
const TEST_PASS = 'Test1234!'
const OUT_DIR = join(PROJECT_ROOT, 'docs', '17.05.2026', 'cmm44-spa3-smoke')
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
    return { ok: false, error: e.message, bodyText: '' }
  }
}

// ─── Aktennummer-Detektor ────────────────────────────────────────────────────
// SP-A3 kritisch: nach dem fall_nummer→claim_nummer-Sweep muss eine
// Aktennummer/Fallnummer weiterhin angezeigt werden. Heuristik: Label-Text
// ODER ein typisches Aktennummer-Format (z.B. CLM-2026-0042 / 2026-00042).
function pruefeAktennummer(bodyText) {
  if (!bodyText) return { sichtbar: false, treffer: '' }
  const hatLabel = /Aktennummer|Aktenzeichen|Fallnummer|Fall-?Nr\.?|Vorgangsnummer|Schadennummer/i.test(bodyText)
  const formatMatch = bodyText.match(/\b(CLM[-/][A-Z0-9-]{3,}|[A-Z]{2,4}-\d{4}-\d{2,6}|\d{4}-\d{4,6})\b/)
  return {
    sichtbar: hatLabel || !!formatMatch,
    treffer: [hatLabel ? 'Label' : '', formatMatch ? `Format(${formatMatch[1]})` : ''].filter(Boolean).join(' + '),
  }
}

// ─── Service-Role: erste Fall-ID holen ───────────────────────────────────────
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

  // Faelle-Liste — Aktennummer-Spalte
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
  const listNummer = pruefeAktennummer(listResult.bodyText)
  notiere('admin', 'faelle-liste-aktennummer', listNummer.sichtbar ? 'OK' : 'WARN',
    listNummer.sichtbar ? `Aktennummer sichtbar (${listNummer.treffer})` : 'Keine Aktennummer in Fall-Liste — claim_nummer-Reader prüfen')

  // Fall-Detail
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
    const detailNummer = pruefeAktennummer(detailResult.bodyText)
    notiere('admin', 'fall-detail-aktennummer', detailNummer.sichtbar ? 'OK' : 'WARN',
      detailNummer.sichtbar ? `Aktennummer im Detail sichtbar (${detailNummer.treffer})` : 'Keine Aktennummer im Fall-Detail — claim_nummer-Reader prüfen')
  } else {
    notiere('admin', '/faelle/[id]', 'WARN', 'Kein Fall-Detail-Link gefunden — Liste leer oder kein fallId?')
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

  const loginOk = await login(page, 'test-dispatch@claimondo.de', TEST_PASS)
  await shoot(page, 'dispatch-nach-login')
  if (!loginOk) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

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
    if (route === '/dispatch/leads') {
      const nummer = pruefeAktennummer(r.bodyText)
      notiere('dispatch', 'leads-aktennummer', nummer.sichtbar ? 'OK' : 'WARN',
        nummer.sichtbar ? `Akten-/Vorgangsnummer sichtbar (${nummer.treffer})` : 'Keine Aktennummer in Leads-Liste (ggf. ok wenn Leads noch keine Akte haben)')
    }
  }

  // Ersten Lead öffnen — Detail sollte Aktennummer/Vorgangsnummer zeigen
  await page.goto(`${BASE}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(2000)
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

// ─── 4. SV (Gutachter) ───────────────────────────────────────────────────────
async function smokeSv(browser) {
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

  // SV-Dashboard
  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/gutachter', 'sv-dashboard')
  notiere('sv', '/gutachter', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // SV-Fall-/Auftrags-Liste — Aktennummer
  errors.length = 0; fives.length = 0
  const auftraegeResult = await gotoUndShoot(page, '/gutachter/auftraege', 'sv-auftraege-liste')
  const hydErr = await pruefeHydration(page)
  notiere('sv', '/gutachter/auftraege', auftraegeResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [
      auftraegeResult.has500 ? '500!' : '',
      auftraegeResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | ')
  )
  const svNummer = pruefeAktennummer(auftraegeResult.bodyText)
  notiere('sv', 'auftraege-aktennummer', svNummer.sichtbar ? 'OK' : 'WARN',
    svNummer.sichtbar ? `Aktennummer sichtbar (${svNummer.treffer})` : 'Keine Aktennummer in SV-Liste — claim_nummer-Reader (faelle_sv_view) prüfen')

  // Ersten SV-Fall öffnen
  const link = page.locator('a[href*="/gutachter/fall/"], a[href*="/gutachter/auftraege/"]').first()
  if ((await link.count()) > 0) {
    const href = await link.getAttribute('href')
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, href, 'sv-fall-detail')
    notiere('sv', href, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))
    const detailNummer = pruefeAktennummer(detailResult.bodyText)
    notiere('sv', 'fall-detail-aktennummer', detailNummer.sichtbar ? 'OK' : 'WARN',
      detailNummer.sichtbar ? `Aktennummer im Detail sichtbar (${detailNummer.treffer})` : 'Keine Aktennummer im SV-Fall-Detail')
  } else {
    notiere('sv', '/gutachter/fall/[id]', 'WARN', 'Kein SV-Fall-Link gefunden')
  }

  if (errors.length > 0) {
    console.log(`  ⚠ Console-Errors (SV): ${errors.length}`)
    errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ─── 5. KUNDE ────────────────────────────────────────────────────────────────
async function smokeKunde(browser) {
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

  // Kunden-Dashboard
  errors.length = 0; fives.length = 0
  const dashResult = await gotoUndShoot(page, '/kunde', 'kunde-dashboard')
  notiere('kunde', '/kunde', dashResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [dashResult.has500 ? '500!' : '', dashResult.isBlank ? 'Leer!' : '',
     fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))

  // Kunden-Faelle-Uebersicht — Aktennummer
  errors.length = 0; fives.length = 0
  const faelleResult = await gotoUndShoot(page, '/kunde/faelle', 'kunde-faelle-liste')
  const hydErr = await pruefeHydration(page)
  notiere('kunde', '/kunde/faelle', faelleResult.ok && fives.length === 0 ? 'OK' : 'WARN',
    [
      faelleResult.has500 ? '500!' : '',
      faelleResult.isBlank ? 'Leerer Screen!' : '',
      fives.length > 0 ? `5xx: ${fives[0]}` : '',
      hydErr.length > 0 ? `Hydration: ${hydErr[0].slice(0, 80)}` : '',
    ].filter(Boolean).join(' | ')
  )
  const kundeNummer = pruefeAktennummer(faelleResult.bodyText)
  notiere('kunde', 'faelle-aktennummer', kundeNummer.sichtbar ? 'OK' : 'WARN',
    kundeNummer.sichtbar ? `Aktennummer sichtbar (${kundeNummer.treffer})` : 'Keine Aktennummer in Kunde-Fall-Uebersicht — claim_nummer-Reader (faelle_kunde_view) prüfen')

  // Ersten Kunden-Fall öffnen
  const link = page.locator('a[href*="/kunde/faelle/"]').first()
  if ((await link.count()) > 0) {
    const href = await link.getAttribute('href')
    errors.length = 0; fives.length = 0
    const detailResult = await gotoUndShoot(page, href, 'kunde-fall-detail')
    notiere('kunde', href, detailResult.ok && fives.length === 0 ? 'OK' : 'WARN',
      [detailResult.has500 ? '500!' : '', detailResult.isBlank ? 'Leer!' : '',
       fives.length > 0 ? `5xx: ${fives[0]}` : ''].filter(Boolean).join(' | '))
    const detailNummer = pruefeAktennummer(detailResult.bodyText)
    notiere('kunde', 'fall-detail-aktennummer', detailNummer.sichtbar ? 'OK' : 'WARN',
      detailNummer.sichtbar ? `Aktennummer im Detail sichtbar (${detailNummer.treffer})` : 'Keine Aktennummer im Kunde-Fall-Detail')
  } else {
    notiere('kunde', '/kunde/faelle/[id]', 'WARN', 'Kein Kunden-Fall-Link — Liste leer oder kein Seed?')
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
  console.log('║  CMM-44 SP-A3 — Portal-Smoke nach fall_nummer-Reader-Sweep   ║')
  console.log(`║  Ziel: ${BASE.padEnd(54)}║`)
  console.log('║  Screenshots: docs/17.05.2026/cmm44-spa3-smoke/              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\nBasic-Auth: ${BASIC_USER} / ${'*'.repeat(BASIC_PASS.length)}`)
  console.log(`Supabase-URL: ${SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '…' : '(nicht gesetzt)'}`)

  console.log('\n[Service-Role] Ermittle Fall-ID…')
  const firstFallId = await ersterFallId()
  console.log(`  Admin-Fall-ID: ${firstFallId ?? '(nicht gefunden — Fallback: Link aus Liste)'}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    await smokePublic(browser)
    await smokeAdmin(browser, firstFallId)
    await smokeDispatch(browser)
    await smokeSv(browser)
    await smokeKunde(browser)
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
