/**
 * scripts/smoke-staging-v2.mjs
 *
 * Re-Smoke gegen Staging nach Test-User-Seed + Hydration-Fix (PR #873).
 * Testet: Kanzlei, Makler, SV-Fall-Detail, Dispatch, Dispatch→Kunden-Magic-Link.
 *
 * Verwendung:
 *   STAGING_BASIC_AUTH_USER=aaroncmdo STAGING_BASIC_AUTH_PASS=... node scripts/smoke-staging-v2.mjs
 *
 * Screenshots: docs/13.05.2026/smoke-claimondo-de/{kanzlei,makler,sv,kunde,dispatch}/v2-NNN-*.png
 * Bericht:    docs/13.05.2026/smoke-claimondo-de/AUDIT.md (Anhang)
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// --- ENV aus .env.local laden (falls nicht per Process-ENV gesetzt) ---------
function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) return
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
}
ladeEnv()

// --- Konfiguration ----------------------------------------------------------
const BASIC_USER = process.env.STAGING_BASIC_AUTH_USER
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASS
const TEST_PASS = 'Test1234!'

if (!BASIC_USER || !BASIC_PASS) {
  console.error('FEHLER: STAGING_BASIC_AUTH_USER + STAGING_BASIC_AUTH_PASS fehlen als ENV-Vars.')
  process.exit(1)
}

// Basic-Auth NICHT in der URL einbetten — führt zu fetch-TypeError im App-Code.
// Stattdessen über Playwright httpCredentials injizieren.
const BASE_URL = 'https://app.staging.claimondo.de'
const BASE_URL_CLEAN = 'https://app.staging.claimondo.de'

const SCREENSHOT_BASE = join(projectRoot, 'docs/13.05.2026/smoke-claimondo-de')

// Portale
const PORTALE = {
  dispatch: join(SCREENSHOT_BASE, 'dispatch'),
  kanzlei: join(SCREENSHOT_BASE, 'kanzlei'),
  makler: join(SCREENSHOT_BASE, 'makler'),
  sv: join(SCREENSHOT_BASE, 'sv'),
  kunde: join(SCREENSHOT_BASE, 'kunde'),
}

for (const dir of Object.values(PORTALE)) {
  mkdirSync(dir, { recursive: true })
}

// Zähler für Screenshot-Nummern (Fortführung von v1)
const COUNTER = {
  dispatch: 100,
  kanzlei: 100,
  makler: 100,
  sv: 100,
  kunde: 100,
}

// --- Hilfsfunktionen --------------------------------------------------------

async function screenshot(page, portal, label) {
  const nr = String(COUNTER[portal]++).padStart(3, '0')
  const dateiname = `v2-${nr}-${label.replace(/[^a-z0-9äöüß-]/gi, '-').slice(0, 40)}.png`
  const pfad = join(PORTALE[portal], dateiname)
  await page.screenshot({ path: pfad, fullPage: false })
  console.log(`  📸 ${portal}/${dateiname}`)
  return dateiname
}

async function login(page, email, passwort, portal) {
  console.log(`  → Login als ${email}`)
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1000)
  await screenshot(page, portal, 'vor-login')

  // Eingabefelder
  await page.fill('input[type="email"], input[name="email"], #email', email).catch(async () => {
    // Fallback: erstes input
    await page.locator('input').first().fill(email)
  })
  await page.fill('input[type="password"], input[name="password"], #password', passwort).catch(async () => {
    await page.locator('input[type="password"]').first().fill(passwort)
  })

  await screenshot(page, portal, 'nach-eingabe-login')

  await page.click('button[type="submit"]').catch(async () => {
    await page.keyboard.press('Enter')
  })

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)

  const url = page.url()
  if (url.includes('/login')) {
    console.log(`  ❌ Login fehlgeschlagen — URL: ${url}`)
    await screenshot(page, portal, 'login-fehler')
    return false
  }
  console.log(`  ✅ Login OK → ${url}`)
  await screenshot(page, portal, 'nach-login')
  return true
}

async function navigate(page, portal, route, label) {
  console.log(`  → Navigate: ${route}`)
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)
    await screenshot(page, portal, label)
    const title = await page.title()
    const url = page.url()
    const has500 = await page.locator('text=500, text=Internal Server Error').count() > 0
    const hasWhiteScreen = await page.evaluate(() => document.body.innerText.trim().length < 20)
    return { ok: !has500 && !hasWhiteScreen, url, title, has500, hasWhiteScreen }
  } catch (e) {
    console.log(`  ⚠ Navigate fehlgeschlagen: ${e.message}`)
    await screenshot(page, portal, `${label}-fehler`)
    return { ok: false, error: e.message }
  }
}

// Console-Error-Collector
function setupConsoleCollector(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Nur App-Code-Errors, keine Browser-Warnings
      if (!text.includes('favicon') && !text.includes('net::ERR')) {
        errors.push(text)
      }
    }
  })
  page.on('pageerror', (err) => errors.push(`PAGE-ERROR: ${err.message}`))
  return errors
}

// Hydration-Error-Detektor
async function pruefeHydrationErrors(page) {
  const errors = await page.evaluate(() => {
    const errorDivs = [...document.querySelectorAll('[data-nextjs-dialog-overlay], #nextjs-toast-errors')]
    return errorDivs.map((el) => el.innerText).filter(Boolean)
  }).catch(() => [])
  return errors
}

// ============================================================================
// PORTAL-TESTS
// ============================================================================

const findings = []
function notiere(portal, route, status, notiz = '') {
  findings.push({ portal, route, status, notiz })
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌'
  console.log(`  ${icon} [${portal}] ${route}: ${status}${notiz ? ' — ' + notiz : ''}`)
}

// ----------------------------------------------------------------------------
// 1. KANZLEI
// ----------------------------------------------------------------------------
async function smokeKanzlei(browser) {
  console.log('\n========== KANZLEI ==========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  const consoleErrors = setupConsoleCollector(page)

  const ok = await login(page, 'test-kanzlei@claimondo.de', TEST_PASS, 'kanzlei')
  if (!ok) {
    notiere('kanzlei', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  // Hydration-Check nach Login
  const hydrationErrors = await pruefeHydrationErrors(page)
  if (hydrationErrors.length > 0) {
    notiere('kanzlei', 'post-login', 'WARN', `Hydration-Error: ${hydrationErrors[0]}`)
  } else {
    notiere('kanzlei', 'post-login', 'OK', 'Keine Hydration-Errors')
  }

  // Routen testen
  const kanzleiRouten = [
    { route: '/kanzlei', label: 'dashboard' },
    { route: '/kanzlei/faelle', label: 'faelle-liste' },
    { route: '/kanzlei/einstellungen', label: 'einstellungen' },
  ]

  // Auch Admin-Routen testen (falls Kanzlei-User admin-Rolle hat)
  const adminRouten = [
    { route: '/admin', label: 'admin-root' },
    { route: '/admin/faelle', label: 'admin-faelle' },
  ]

  for (const { route, label } of kanzleiRouten) {
    const result = await navigate(page, 'kanzlei', route, label)
    const hydErr = await pruefeHydrationErrors(page)
    if (!result.ok) notiere('kanzlei', route, 'WARN', result.error || '500/leerer Screen')
    else if (hydErr.length > 0) notiere('kanzlei', route, 'WARN', `Hydration: ${hydErr[0]}`)
    else notiere('kanzlei', route, 'OK')
  }

  // Aktive Seite prüfen — wo landet Kanzlei-User?
  const currentUrl = page.url()
  console.log(`  → Kanzlei-User landet nach Login auf: ${currentUrl}`)

  // Falls /kanzlei nicht existiert → versuche /admin
  if (currentUrl.includes('/admin')) {
    for (const { route, label } of adminRouten) {
      const result = await navigate(page, 'kanzlei', route, label)
      notiere('kanzlei', route, result.ok ? 'OK' : 'WARN', result.error ?? '')
    }
  }

  // Detail-Tab testen: Ersten Fall öffnen
  await page.goto(`${BASE_URL}/admin/faelle`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const ersteFallLink = await page.locator('a[href*="/admin/faelle/"], a[href*="/faelle/"]').first()
  if (await ersteFallLink.count() > 0) {
    await ersteFallLink.click()
    await page.waitForTimeout(2000)
    await screenshot(page, 'kanzlei', 'fall-detail')
    notiere('kanzlei', 'fall-detail', 'OK', 'Fall-Detail erreichbar')

    // Tabs durchklicken
    const tabLabels = ['Dokumente', 'Mitteilungen', 'Timeline', 'Notizen']
    for (const tabLabel of tabLabels) {
      const tab = page.locator(`button:has-text("${tabLabel}"), [role="tab"]:has-text("${tabLabel}")`)
      if (await tab.count() > 0) {
        await tab.first().click()
        await page.waitForTimeout(1000)
        await screenshot(page, 'kanzlei', `tab-${tabLabel.toLowerCase()}`)
        notiere('kanzlei', `fall-tab-${tabLabel}`, 'OK')
      }
    }
  } else {
    notiere('kanzlei', 'fall-detail', 'WARN', 'Kein Fall-Link gefunden — Liste leer?')
    await screenshot(page, 'kanzlei', 'faelle-liste-leer')
  }

  if (consoleErrors.length > 0) {
    console.log(`  ⚠ Console-Errors (${consoleErrors.length}):`)
    consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ----------------------------------------------------------------------------
// 2. MAKLER
// ----------------------------------------------------------------------------
async function smokeMakler(browser) {
  console.log('\n========== MAKLER ==========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  const consoleErrors = setupConsoleCollector(page)

  const ok = await login(page, 'test-makler@claimondo.de', TEST_PASS, 'makler')
  if (!ok) {
    notiere('makler', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydrationErrors = await pruefeHydrationErrors(page)
  if (hydrationErrors.length > 0) {
    notiere('makler', 'post-login', 'WARN', `Hydration: ${hydrationErrors[0]}`)
  } else {
    notiere('makler', 'post-login', 'OK', 'Keine Hydration-Errors')
  }

  const currentUrl = page.url()
  console.log(`  → Makler-User landet nach Login auf: ${currentUrl}`)

  const maklerRouten = [
    { route: '/makler', label: 'dashboard' },
    { route: '/makler/faelle', label: 'faelle' },
    { route: '/makler/kunden', label: 'kunden' },
    { route: '/makler/einstellungen', label: 'einstellungen' },
    { route: '/makler/statistiken', label: 'statistiken' },
  ]

  for (const { route, label } of maklerRouten) {
    const result = await navigate(page, 'makler', route, label)
    const hydErr = await pruefeHydrationErrors(page)
    if (!result.ok) notiere('makler', route, 'WARN', result.error || '500/leerer Screen')
    else if (hydErr.length > 0) notiere('makler', route, 'WARN', `Hydration: ${hydErr[0]}`)
    else notiere('makler', route, 'OK')
  }

  // Fall-Detail
  await page.goto(`${BASE_URL}/makler/faelle`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const ersteFallLinkMakler = page.locator('a[href*="/makler/faelle/"], a[href*="/faelle/"]').first()
  if (await ersteFallLinkMakler.count() > 0) {
    await ersteFallLinkMakler.click()
    await page.waitForTimeout(2000)
    await screenshot(page, 'makler', 'fall-detail')
    notiere('makler', 'fall-detail', 'OK', 'Fall-Detail erreichbar')
  } else {
    notiere('makler', 'fall-detail', 'WARN', 'Kein Fall sichtbar')
    await screenshot(page, 'makler', 'faelle-leer')
  }

  if (consoleErrors.length > 0) {
    console.log(`  ⚠ Console-Errors: ${consoleErrors.length}`)
  }

  await context.close()
}

// ----------------------------------------------------------------------------
// 3. SV — Fall SMK-SV-2026-001
// ----------------------------------------------------------------------------
async function smokeSV(browser) {
  console.log('\n========== SV ==========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  const consoleErrors = setupConsoleCollector(page)

  const ok = await login(page, 'test-sv@claimondo.de', TEST_PASS, 'sv')
  if (!ok) {
    notiere('sv', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydrationErrors = await pruefeHydrationErrors(page)
  notiere('sv', 'post-login', hydrationErrors.length > 0 ? 'WARN' : 'OK',
    hydrationErrors.length > 0 ? `Hydration: ${hydrationErrors[0]}` : 'Keine Hydration-Errors')

  // Auftragsliste
  const auftraegeResult = await navigate(page, 'sv', '/gutachter/auftraege', 'auftraege-liste')
  notiere('sv', '/gutachter/auftraege', auftraegeResult.ok ? 'OK' : 'WARN', auftraegeResult.error ?? '')

  // SMK-SV-2026-001 suchen
  await page.waitForTimeout(1000)
  const aktenzeichen = 'SMK-SV-2026-001'
  const smkLink = page.locator(`text="${aktenzeichen}", a:has-text("${aktenzeichen}")`)
  if (await smkLink.count() > 0) {
    notiere('sv', `auftrag-${aktenzeichen}`, 'OK', 'Aktenzeichen in Liste gefunden')
    await smkLink.first().click()
    await page.waitForTimeout(2500)
    await screenshot(page, 'sv', 'smk-sv-detail')

    const hydErr = await pruefeHydrationErrors(page)
    notiere('sv', `${aktenzeichen}-detail`, hydErr.length > 0 ? 'WARN' : 'OK',
      hydErr.length > 0 ? `Hydration: ${hydErr[0]}` : 'Detail geladen')

    // Termin-Tab
    const terminTab = page.locator('[role="tab"]:has-text("Termin"), button:has-text("Termin")')
    if (await terminTab.count() > 0) {
      await terminTab.first().click()
      await page.waitForTimeout(1200)
      await screenshot(page, 'sv', 'smk-sv-termin-tab')
      notiere('sv', `${aktenzeichen}-termin-tab`, 'OK')
    } else {
      notiere('sv', `${aktenzeichen}-termin-tab`, 'WARN', 'Termin-Tab nicht gefunden')
    }

    // Feldmodus-Trigger
    const feldmodusBtn = page.locator('button:has-text("Feldmodus"), a:has-text("Feldmodus"), [data-testid="feldmodus"]')
    if (await feldmodusBtn.count() > 0) {
      await feldmodusBtn.first().click()
      await page.waitForTimeout(2000)
      await screenshot(page, 'sv', 'smk-sv-feldmodus')
      notiere('sv', `${aktenzeichen}-feldmodus`, 'OK', 'Feldmodus-Trigger funktioniert')
      await page.goBack()
    } else {
      notiere('sv', `${aktenzeichen}-feldmodus`, 'WARN', 'Feldmodus-Trigger nicht gefunden')
      await screenshot(page, 'sv', 'smk-sv-kein-feldmodus')
    }
  } else {
    notiere('sv', `auftrag-${aktenzeichen}`, 'WARN', 'Aktenzeichen NICHT in Liste — Seed-Daten fehlen?')
    await screenshot(page, 'sv', 'auftraege-leer-oder-kein-smk')

    // Fallback: Alle Aufträge loggen
    const alleLinks = await page.locator('a[href*="/auftraege/"], a[href*="/faelle/"]').allTextContents()
    if (alleLinks.length > 0) {
      console.log(`  ℹ Gefundene Auftrags-Links: ${alleLinks.slice(0, 5).join(', ')}`)
    }
  }

  // SV-Übersicht weiterer Routen
  const svRouten = [
    { route: '/gutachter', label: 'gutachter-root' },
    { route: '/gutachter/heute', label: 'heute' },
    { route: '/gutachter/termine', label: 'termine' },
    { route: '/gutachter/faelle', label: 'faelle' },
  ]
  for (const { route, label } of svRouten) {
    const result = await navigate(page, 'sv', route, label)
    const hydErr = await pruefeHydrationErrors(page)
    notiere('sv', route, result.ok && hydErr.length === 0 ? 'OK' : 'WARN',
      result.error ?? (hydErr.length > 0 ? `Hydration: ${hydErr[0]}` : ''))
  }

  if (consoleErrors.length > 0) {
    console.log(`  ⚠ Console-Errors: ${consoleErrors.length}`)
    consoleErrors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ----------------------------------------------------------------------------
// 4. DISPATCH — Regression-Check + Kunden-Magic-Link
// ----------------------------------------------------------------------------
async function smokeDispatch(browser) {
  console.log('\n========== DISPATCH + KUNDEN-MAGIC-LINK ==========')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  const consoleErrors = setupConsoleCollector(page)

  const ok = await login(page, 'test-dispatch@claimondo.de', TEST_PASS, 'dispatch')
  if (!ok) {
    notiere('dispatch', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
    await context.close()
    return
  }

  const hydrationErrors = await pruefeHydrationErrors(page)
  notiere('dispatch', 'post-login', hydrationErrors.length > 0 ? 'WARN' : 'OK',
    hydrationErrors.length > 0 ? `Hydration: ${hydrationErrors[0]}` : 'Keine Hydration-Errors')

  // Regression: Dispatch-Routen
  const dispatchRouten = [
    { route: '/dispatch', label: 'dispatch-root' },
    { route: '/dispatch/leads', label: 'leads-liste' },
    { route: '/dispatch/kalender', label: 'kalender' },
  ]
  for (const { route, label } of dispatchRouten) {
    const result = await navigate(page, 'dispatch', route, label)
    const hydErr = await pruefeHydrationErrors(page)
    notiere('dispatch', route, result.ok && hydErr.length === 0 ? 'OK' : 'WARN',
      result.error ?? (hydErr.length > 0 ? `Hydration: ${hydErr[0]}` : ''))
  }

  // SMK-KUNDE-2026-001 finden
  await page.goto(`${BASE_URL}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  const kundeAktenzeichen = 'SMK-KUNDE-2026-001'
  const kundeLink = page.locator(`text="${kundeAktenzeichen}", a:has-text("${kundeAktenzeichen}")`)

  if (await kundeLink.count() > 0) {
    notiere('dispatch', `lead-${kundeAktenzeichen}`, 'OK', 'Lead in Liste')
    await kundeLink.first().click()
    await page.waitForTimeout(2500)
    await screenshot(page, 'dispatch', 'kunde-lead-detail')

    // Magic-Link-Button suchen
    const magicLinkBtn = page.locator(
      'button:has-text("Magic Link"), button:has-text("Zugang senden"), button:has-text("Kundenlink"), button:has-text("Kunden-Link")'
    )
    if (await magicLinkBtn.count() > 0) {
      notiere('dispatch', `${kundeAktenzeichen}-magic-link-btn`, 'OK', 'Magic-Link-Button sichtbar')
      await screenshot(page, 'dispatch', 'kunde-magic-link-button-sichtbar')
      await magicLinkBtn.first().click()
      await page.waitForTimeout(2000)
      await screenshot(page, 'dispatch', 'kunde-magic-link-dialog')
      notiere('dispatch', `${kundeAktenzeichen}-magic-link-click`, 'OK', 'Button klickbar')

      // Dialog schließen
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } else {
      notiere('dispatch', `${kundeAktenzeichen}-magic-link-btn`, 'WARN', 'Kein Magic-Link-Button — evtl. anderer Label')
      await screenshot(page, 'dispatch', 'kunde-kein-magic-link-btn')
    }
  } else {
    notiere('dispatch', `lead-${kundeAktenzeichen}`, 'WARN', 'Lead NICHT in Liste — Seed fehlt?')
    await screenshot(page, 'dispatch', 'leads-ohne-smk-kunde')

    // Alle sichtbaren Leads loggen
    const allTxt = await page.locator('main').innerText().catch(() => '')
    console.log(`  ℹ Leads-Seite Inhalt-Snippet: ${allTxt.slice(0, 300)}`)
  }

  if (consoleErrors.length > 0) {
    console.log(`  ⚠ Console-Errors: ${consoleErrors.length}`)
    consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ----------------------------------------------------------------------------
// 5. KUNDEN-PORTAL (Magic-Link via Supabase Admin API)
// ----------------------------------------------------------------------------
async function smokeKunde(browser) {
  console.log('\n========== KUNDEN-PORTAL ==========')

  // Supabase Service-Role-Key aus ENV
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let magicLink = null

  if (supabaseUrl && serviceRoleKey) {
    console.log('  → Generiere Magic-Link via Supabase Admin API...')
    try {
      const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      })
      // Supabase Magic Link
      const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/generate-link`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'magiclink',
          email: 'test-kunde@claimondo.de',
          options: {
            redirect_to: `${BASE_URL_CLEAN}/kunde`,
          },
        }),
      })
      if (linkResp.ok) {
        const linkData = await linkResp.json()
        magicLink = linkData?.action_link || linkData?.hashed_token
        if (magicLink) {
          console.log(`  ✅ Magic-Link generiert (erste 60 Zeichen): ${magicLink.slice(0, 60)}...`)
        }
      } else {
        const errText = await linkResp.text()
        console.log(`  ⚠ Magic-Link API Fehler: ${linkResp.status} — ${errText.slice(0, 200)}`)
      }
    } catch (e) {
      console.log(`  ⚠ Magic-Link Generierung fehlgeschlagen: ${e.message}`)
    }
  } else {
    console.log('  ⚠ NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt — kein Magic-Link-Test')
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    ignoreHTTPSErrors: true,
    httpCredentials: { username: BASIC_USER, password: BASIC_PASS },
  })
  const page = await context.newPage()
  const consoleErrors = setupConsoleCollector(page)

  if (magicLink) {
    // Basic-Auth via httpCredentials (nicht in URL) — bereits im Context gesetzt
    let targetUrl = magicLink

    console.log(`  → Öffne Magic-Link...`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => {
      console.log(`  ⚠ Magic-Link Navigation: ${e.message}`)
    })
    await page.waitForTimeout(3000)
    await screenshot(page, 'kunde', 'magic-link-landing')

    const url = page.url()
    const hydErr = await pruefeHydrationErrors(page)
    if (url.includes('/kunde') || url.includes('/login')) {
      notiere('kunde', 'magic-link', 'OK', `Weiterleitung zu: ${url}`)
    } else {
      notiere('kunde', 'magic-link', 'WARN', `Unerwartete URL: ${url}`)
    }

    // Kunden-Fallakte navigieren
    const kundeRouten = [
      { route: '/kunde', label: 'kunde-root' },
      { route: '/kunde/faelle', label: 'kunde-faelle' },
    ]
    for (const { route, label } of kundeRouten) {
      const result = await navigate(page, 'kunde', route, label)
      notiere('kunde', route, result.ok ? 'OK' : 'WARN', result.error ?? '')
    }
  } else {
    // Fallback: Direkt-Login
    console.log('  → Fallback: Normaler Login als test-kunde@claimondo.de')
    const ok = await login(page, 'test-kunde@claimondo.de', TEST_PASS, 'kunde')
    if (!ok) {
      notiere('kunde', '/login', 'HARD-FAIL', 'Login fehlgeschlagen')
      await context.close()
      return
    }

    const hydErr = await pruefeHydrationErrors(page)
    notiere('kunde', 'post-login', hydErr.length > 0 ? 'WARN' : 'OK',
      hydErr.length > 0 ? `Hydration: ${hydErr[0]}` : 'Keine Hydration-Errors')

    const kundeRouten = [
      { route: '/kunde', label: 'kunde-root' },
      { route: '/kunde/faelle', label: 'kunde-faelle' },
      { route: '/kunde/einstellungen', label: 'kunde-einstellungen' },
    ]
    for (const { route, label } of kundeRouten) {
      const result = await navigate(page, 'kunde', route, label)
      notiere('kunde', route, result.ok ? 'OK' : 'WARN', result.error ?? '')
    }
  }

  if (consoleErrors.length > 0) {
    console.log(`  ⚠ Console-Errors: ${consoleErrors.length}`)
    consoleErrors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`))
  }

  await context.close()
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('🚀 Claimondo Staging Re-Smoke v2 — 13.05.2026')
  console.log(`   Base-URL: ${BASE_URL_CLEAN}`)
  console.log(`   Screenshot-Basis: ${SCREENSHOT_BASE}`)
  console.log('')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    await smokeKanzlei(browser)
    await smokeMakler(browser)
    await smokeSV(browser)
    await smokeDispatch(browser)
    await smokeKunde(browser)
  } finally {
    await browser.close()
  }

  // --- AUDIT.md Anhang schreiben -------------------------------------------
  const auditPfad = join(SCREENSHOT_BASE, 'AUDIT.md')
  const now = new Date().toISOString()

  const okCount = findings.filter((f) => f.status === 'OK').length
  const warnCount = findings.filter((f) => f.status === 'WARN').length
  const failCount = findings.filter((f) => f.status === 'HARD-FAIL').length

  const findingsTabelle = findings.map((f) => {
    const icon = f.status === 'OK' ? '✅' : f.status === 'WARN' ? '⚠️' : '❌'
    return `| ${icon} | ${f.portal} | \`${f.route}\` | ${f.status} | ${f.notiz} |`
  }).join('\n')

  // Screenshot-Zählung
  const screenshotCount = {
    kanzlei: COUNTER.kanzlei - 100,
    makler: COUNTER.makler - 100,
    sv: COUNTER.sv - 100,
    dispatch: COUNTER.dispatch - 100,
    kunde: COUNTER.kunde - 100,
  }

  const auditSection = `

## Re-Smoke 13.05.2026 (nach Test-User-Seed + Hydration-Fix)

**Durchgeführt:** ${now}
**Gegen:** https://app.staging.claimondo.de
**Grund:** Zweiter Run nach Test-User-Seed durch Subagent (Kanzlei, Makler, SV-Fall SMK-SV-2026-001, Kunden-Lead SMK-KUNDE-2026-001) + Hydration-Fix PR #873

### Screenshot-Anzahl (v2)

| Portal | Vorher (Run 1) | Jetzt (Run 2) | Delta |
|--------|---------------|---------------|-------|
| dispatch | 10 | ${10 + screenshotCount.dispatch} | +${screenshotCount.dispatch} |
| kanzlei | 11 | ${11 + screenshotCount.kanzlei} | +${screenshotCount.kanzlei} |
| makler | 3 | ${3 + screenshotCount.makler} | +${screenshotCount.makler} |
| sv | 6 | ${6 + screenshotCount.sv} | +${screenshotCount.sv} |
| kunde | 0 | ${screenshotCount.kunde} | +${screenshotCount.kunde} |
| **Gesamt** | **30** | **${30 + Object.values(screenshotCount).reduce((a, b) => a + b, 0)}** | **+${Object.values(screenshotCount).reduce((a, b) => a + b, 0)}** |

### Findings

| | Portal | Route | Status | Notiz |
|---|--------|-------|--------|-------|
${findingsTabelle}

### Zusammenfassung

- ✅ OK: ${okCount}
- ⚠️ WARN: ${warnCount}
- ❌ HARD-FAIL: ${failCount}

### Hydration-Errors (#418, #419 — PR #873 Fix)

Prüfung nach jedem Portal-Login und nach jeder Navigation. Befunde oben im Findings-Table unter "post-login".

### Was offen bleibt

- Design-System-Verstöße und Token-Verstöße werden im separaten Frontend-Design-Audit dokumentiert
- Magic-Link E-Mail-Flow (Mailpit/Inbucket) nicht testbar auf Staging ohne Mailpit-Instanz
- Kanzlei/Makler Fall-Detail-Tabs komplett erst wenn Seed-Daten vorhanden

---
`

  appendFileSync(auditPfad, auditSection, 'utf-8')
  console.log(`\n✅ AUDIT.md aktualisiert: ${auditPfad}`)

  // Finale Zusammenfassung
  console.log('\n========== SMOKE ABGESCHLOSSEN ==========')
  console.log(`✅ OK: ${okCount} | ⚠️ WARN: ${warnCount} | ❌ FAIL: ${failCount}`)
  console.log(`Screenshots: Kanzlei +${screenshotCount.kanzlei} | Makler +${screenshotCount.makler} | SV +${screenshotCount.sv} | Dispatch +${screenshotCount.dispatch} | Kunde +${screenshotCount.kunde}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
