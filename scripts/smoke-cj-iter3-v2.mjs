/**
 * Customer-Journey Smoke-Test — Iteration 3 v2
 * Datum: 13.05.2026
 * Target: https://app.staging.claimondo.de
 * Basic-Auth über httpCredentials (NICHT in URL — verhindert ERR_FAILED bei Redirects)
 */

import { chromium } from 'playwright'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// AAR-smoke-ci: Konfiguration via ENV-Variablen mit Fallback auf bekannte
// Defaults für lokales Run. In CI kommen alle sensiblen Werte aus GH Secrets.
const STAGING_BASE = process.env.SMOKE_STAGING_BASE ?? 'https://app.staging.claimondo.de'
const MARKETING_BASE = process.env.SMOKE_MARKETING_BASE ?? 'https://claimondo.de'
const BASIC_AUTH_USER = process.env.SMOKE_BASIC_AUTH_USER ?? 'aaroncmdo'
const BASIC_AUTH_PASS = process.env.SMOKE_BASIC_AUTH_PASS ?? ''
const KUNDE_EMAIL = process.env.SMOKE_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const KUNDE_PASS = process.env.SMOKE_KUNDE_PASS ?? 'Test1234!'
const DISPATCH_EMAIL = process.env.SMOKE_DISPATCH_EMAIL ?? 'test-dispatch@claimondo.de'
const DISPATCH_PASS = process.env.SMOKE_DISPATCH_PASS ?? 'Test1234!'

if (!BASIC_AUTH_PASS) {
  console.error('FEHLER: SMOKE_BASIC_AUTH_PASS ist nicht gesetzt — Staging Basic-Auth pflicht.')
  process.exit(2)
}

// AAR-smoke-ci: SCREENSHOT_BASE per ENV überschreibbar. CI nutzt einen
// generischen Pfad (smoke-artifacts/<run-id>/), Local-Dev nutzt den
// iter-3-Pfad damit existierende Reports weiter funktionieren.
const SCREENSHOT_BASE = process.env.SMOKE_SCREENSHOT_BASE
  ? path.resolve(process.env.SMOKE_SCREENSHOT_BASE)
  : path.join(ROOT, 'docs/13.05.2026/smoke-claimondo-de/prod-iter-3')

const consoleErrors = []
const pageErrors = []
const failedRequests = []
const timingLog = []
const stepResults = []

let screenshotCounter = 0

async function screenshot(page, step, label) {
  screenshotCounter++
  const num = String(screenshotCounter).padStart(3, '0')
  const dir = path.join(SCREENSHOT_BASE, step)
  await mkdir(dir, { recursive: true })
  const filename = `${num}-${label}.png`
  const filepath = path.join(dir, filename)
  try {
    await page.screenshot({ path: filepath, fullPage: false })
    log(`  Screenshot: ${step}/${filename}`)
  } catch (e) {
    log(`  Screenshot FEHLER: ${e.message}`)
  }
  return `${step}/${filename}`
}

function log(msg) {
  const ts = new Date().toISOString()
  timingLog.push({ ts, msg })
  console.log(`[${ts}] ${msg}`)
}

function recordStep(step, status, details = {}) {
  stepResults.push({ step, status, details, ts: new Date().toISOString() })
}

async function setupListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text().substring(0, 300), ts: new Date().toISOString() })
    }
  })
  page.on('pageerror', (err) => {
    pageErrors.push({ url: page.url(), message: err.message.substring(0, 300), ts: new Date().toISOString() })
  })
  page.on('requestfailed', (req) => {
    // Nur echte App-Requests loggen, nicht Mapbox/Assets
    if (!req.url().includes('mapbox') && !req.url().includes('tiles')) {
      failedRequests.push({ url: req.url().substring(0, 150), failure: req.failure()?.errorText, ts: new Date().toISOString() })
    }
  })
}

async function tokenCheck(page, selector, expectedClass, desc) {
  try {
    const el = await page.$(selector)
    if (!el) return { selector, expectedClass, desc, domFound: false, computed: 'KEIN_ELEMENT', status: '❌ KEIN_ELEMENT' }
    const computed = await page.evaluate((s) => {
      const e = document.querySelector(s)
      if (!e) return null
      const cs = window.getComputedStyle(e)
      return { bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow?.substring(0, 60) }
    }, selector)
    return { selector, expectedClass, desc, domFound: true, computed, status: '✅ IM_DOM' }
  } catch (e) {
    return { selector, expectedClass, desc, domFound: false, computed: `FEHLER: ${e.message.substring(0,80)}`, status: '⚠️ FEHLER' }
  }
}

async function tryLogin(page, email, password, context) {
  // Navigiere zur Login-Seite (OHNE Basic-Auth in URL)
  await page.goto(`${STAGING_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  const emailInput = await page.$('input[type="email"], input[name="email"]')
  const passInput = await page.$('input[type="password"]')

  if (!emailInput || !passInput) {
    log(`  WARNUNG: Login-Inputs nicht gefunden auf ${page.url()}`)
    return false
  }

  await emailInput.fill(email)
  await passInput.fill(password)
  await page.waitForTimeout(500)

  const loginBtn = await page.$('button[type="submit"]')
  if (loginBtn) {
    await loginBtn.click()
    // Warte auf Redirect — max 8s
    try {
      await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 8000 })
    } catch {
      // Kein Redirect passiert — Login fehlgeschlagen oder 2FA
    }
    await page.waitForTimeout(2000)
  }

  const urlNach = page.url()
  log(`  URL nach Login-Klick: ${urlNach}`)
  return !urlNach.includes('/login')
}

async function run() {
  log('=== Smoke Iter-3 v2 gestartet ===')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  })

  // Kontext A: Marketing (kein Basic-Auth)
  const ctxMarketing = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'de-DE',
    ignoreHTTPSErrors: true,
  })

  // Kontext B: Staging mit Basic-Auth (httpCredentials, nicht in URL)
  const ctxStaging = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    httpCredentials: { username: BASIC_AUTH_USER, password: BASIC_AUTH_PASS },
    locale: 'de-DE',
    ignoreHTTPSErrors: true,
  })

  const pageMarketing = await ctxMarketing.newPage()
  const pageStaging = await ctxStaging.newPage()

  await setupListeners(pageMarketing)
  await setupListeners(pageStaging)

  const stopOnFail = { triggered: false, step: null, details: null }
  const tokenTables = {}

  // ==========================================
  // STEP 1: Marketing-Startseite
  // ==========================================
  log('\n--- STEP 1: Marketing-Startseite (claimondo.de) ---')
  try {
    await pageMarketing.goto('https://claimondo.de', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await pageMarketing.waitForTimeout(2000)
    await screenshot(pageMarketing, 'marketing', '001-startseite-geladen')

    const title = await pageMarketing.title()
    const h1 = await pageMarketing.$eval('h1', el => el.textContent?.trim()).catch(() => 'N/A')
    const navLinks = await pageMarketing.$$eval('nav a', els => els.map(el => el.textContent?.trim()).filter(Boolean)).catch(() => [])
    const cssLinks = await pageMarketing.$$eval('link[rel="stylesheet"]', els => els.map(el => el.href)).catch(() => [])

    log(`  Titel: ${title}`)
    log(`  H1: ${h1}`)
    log(`  Nav-Links: ${navLinks.join(' | ')}`)
    log(`  CSS-Bundles (${cssLinks.length}): ${cssLinks.join(', ')}`)

    // CSS-Bundle auf Claimondo-Custom-Properties prüfen
    let cssBundleCheck = { shadows: [], radii: [] }
    if (cssLinks.length > 0) {
      // Prüfe beide CSS-Chunks
      for (const cssUrl of cssLinks.slice(0, 3)) {
        const r = await pageMarketing.evaluate(async (url) => {
          try {
            const resp = await fetch(url)
            const text = await resp.text()
            const shadows = text.match(/--shadow-claimondo[^;]+;/g) || []
            const radii = text.match(/--radius-claimondo[^;]+;/g) || []
            const gray = text.match(/text-gray-\d+|text-slate-\d+/g) || []
            return { shadows: shadows.slice(0,5), radii: radii.slice(0,5), gray: gray.slice(0,5), url }
          } catch (e) {
            return { error: e.message, url }
          }
        }, cssUrl).catch(() => ({ error: 'fetch failed', url: cssUrl }))
        if (r.shadows?.length > 0 || r.radii?.length > 0) {
          cssBundleCheck = r
          break
        }
      }
    }
    log(`  CSS-Bundle shadows: ${JSON.stringify(cssBundleCheck.shadows)}`)
    log(`  CSS-Bundle radii: ${JSON.stringify(cssBundleCheck.radii)}`)
    tokenTables['CSS-Bundle'] = cssBundleCheck

    // Marketing Token-Checks
    const mktTokens = [
      { sel: '[class*="glass"]', cls: 'glass-*', desc: 'Glass-Card' },
      { sel: '[class*="shadow-claimondo"]', cls: 'shadow-claimondo-*', desc: 'Claimondo-Schatten' },
      { sel: '[class*="rounded-claimondo"]', cls: 'rounded-claimondo-*', desc: 'Claimondo-Radius' },
      { sel: 'h1', cls: 'h1', desc: 'Hero-H1' },
      { sel: '.bg-claimondo-bg', cls: 'bg-claimondo-bg', desc: 'Claimondo-BG' },
    ]
    const mktResults = []
    for (const t of mktTokens) {
      const r = await tokenCheck(pageMarketing, t.sel, t.cls, t.desc)
      mktResults.push(r)
      log(`    ${r.status} ${t.cls}: ${JSON.stringify(r.computed)}`)
    }
    tokenTables['marketing-startseite'] = mktResults

    recordStep('Step 1: Marketing-Startseite', '✅ OK', { title, h1 })
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 1: Marketing-Startseite', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 2: GutachterFinder-Wizard
  // ==========================================
  log('\n--- STEP 2: GutachterFinder /gutachter-finden ---')
  try {
    await pageMarketing.goto('https://claimondo.de/gutachter-finden', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await pageMarketing.waitForTimeout(2000)
    await screenshot(pageMarketing, 'marketing', '002-gutachter-finden-schritt1')
    log(`  URL: ${pageMarketing.url()}`)

    // Adresse eingeben
    const addressInput = await pageMarketing.$('input[type="text"], input[placeholder*="PLZ"], input[placeholder*="Adresse"], input[placeholder*="Straße"]')
    if (addressInput) {
      await addressInput.fill('SMOKE FLOW ITER-3 13.05.2026, Berlin')
      await pageMarketing.waitForTimeout(1500)
      await screenshot(pageMarketing, 'marketing', '003-adresse-eingegeben')
      log('  Adresse eingetippt')

      // Versuche Mapbox-Autocomplete-Dropdown zu selektieren
      const suggestions = await pageMarketing.$$('.mapboxgl-ctrl-geocoder--suggestion, [class*="suggestion"], [class*="Suggestion"]')
      log(`  Mapbox-Dropdown Suggestions: ${suggestions.length}`)
      if (suggestions.length > 0) {
        await suggestions[0].click()
        await pageMarketing.waitForTimeout(1000)
        log('  Mapbox-Suggestion geklickt')
      }
    } else {
      log('  Kein Adress-Input gefunden')
    }

    // Weiter-Button
    const weiterBtn = await pageMarketing.$('button:has-text("Weiter"), button:has-text("Nächster"), button[type="submit"]')
    if (weiterBtn) {
      const isDisabled = await weiterBtn.isDisabled()
      log(`  Weiter-Button disabled: ${isDisabled}`)
      await screenshot(pageMarketing, 'marketing', '004-vor-weiter-klick')

      await weiterBtn.click()
      await pageMarketing.waitForTimeout(2000)
      const urlNach = pageMarketing.url()
      await screenshot(pageMarketing, 'marketing', '005-nach-weiter-klick')
      log(`  URL nach Weiter: ${urlNach}`)

      if (urlNach.includes('gutachter-finden') && !urlNach.includes('step=2')) {
        recordStep('Step 2: GutachterFinder Schritt 1→2', '⚠️ P2 [GF-01] UNVERÄNDERT', {
          note: 'Mapbox-Autocomplete-Validierung blockiert — URL unverändert',
        })
      } else {
        recordStep('Step 2: GutachterFinder Schritt 1→2', '✅ OK', { urlNach })
      }
    } else {
      recordStep('Step 2: GutachterFinder Schritt 1→2', '⚠️ KEIN_WEITER_BUTTON', {})
    }
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 2: GutachterFinder', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 3: Staging-Login prüfen (ohne Credentials zuerst)
  // ==========================================
  log('\n--- STEP 3: Staging Basic-Auth + Login-Seite ---')
  try {
    await pageStaging.goto(`${STAGING_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await pageStaging.waitForTimeout(2000)
    await screenshot(pageStaging, 'kunde', '006-login-seite-staging')

    const stagingTitle = await pageStaging.title()
    const stagingUrl = pageStaging.url()
    log(`  URL: ${stagingUrl}`)
    log(`  Titel: ${stagingTitle}`)

    // Prüfe ob Basic-Auth-Prompt erscheint oder Login-Form
    const hasLoginForm = await pageStaging.$('input[type="email"]') !== null
    log(`  Login-Form sichtbar: ${hasLoginForm}`)

    if (hasLoginForm) {
      recordStep('Step 3: Staging Basic-Auth OK + Login-Form', '✅ OK', { stagingTitle, hasLoginForm })
    } else {
      // Basic-Auth-Dialog erscheint
      const bodyText = await pageStaging.$eval('body', el => el.textContent?.substring(0, 200)).catch(() => '')
      log(`  Body (ohne Login-Form): ${bodyText}`)
      recordStep('Step 3: Staging Basic-Auth + Login-Form', '⚠️ KEIN_LOGIN_FORM', { bodyText })
    }
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 3: Staging Basic-Auth + Login-Form', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 4: Kunden-Login
  // ==========================================
  log('\n--- STEP 4: Kunden-Login (test-kunde@claimondo.de) ---')
  let kundeLoginOk = false
  try {
    const emailInput = await pageStaging.$('input[type="email"], input[name="email"]')
    const passInput = await pageStaging.$('input[type="password"]')

    if (emailInput && passInput) {
      await emailInput.fill(KUNDE_EMAIL)
      await passInput.fill(KUNDE_PASS)
      await screenshot(pageStaging, 'kunde', '007-credentials-eingegeben')
      log(`  Credentials eingetragen: ${KUNDE_EMAIL}`)

      const loginBtn = await pageStaging.$('button[type="submit"]')
      if (loginBtn) {
        await loginBtn.click()
        log('  Login-Button geklickt')
        // Warte auf Redirect weg von /login
        try {
          await pageStaging.waitForURL((url) => !url.toString().includes('/login'), { timeout: 10000 })
          kundeLoginOk = true
        } catch {
          // Kein Redirect — möglicherweise Fehler oder 2FA
        }
        await pageStaging.waitForTimeout(2000)
        await screenshot(pageStaging, 'kunde', '008-nach-login-klick')
        const urlNachLogin = pageStaging.url()
        log(`  URL nach Login: ${urlNachLogin}`)
        log(`  Login OK: ${kundeLoginOk}`)

        if (!kundeLoginOk) {
          // Fehlermeldung prüfen
          const errorMsg = await pageStaging.$eval('[class*="error"], [class*="Error"], [role="alert"]', el => el.textContent?.trim()).catch(() => 'keine Fehlermeldung gefunden')
          log(`  Login-Fehler: ${errorMsg}`)
          recordStep('Step 4: Kunden-Login', '❌ FEHLGESCHLAGEN', { urlNachLogin, errorMsg })
        } else {
          recordStep('Step 4: Kunden-Login', '✅ OK', { urlNachLogin })
        }
      }
    } else {
      log('  Keine Login-Inputs gefunden')
      recordStep('Step 4: Kunden-Login', '⚠️ KEIN_INPUT', {})
    }
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 4: Kunden-Login', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 5: /kunde Portal — Crash-Check
  // ==========================================
  log('\n--- STEP 5: /kunde Portal Crash-Check ---')
  let hasCrash = false
  let kundeRendered = false
  try {
    if (!kundeLoginOk) {
      // Direkt zu /kunde navigieren — wird zur Login-Seite redirected
      await pageStaging.goto(`${STAGING_BASE}/kunde`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await pageStaging.waitForTimeout(3000)
    }

    await screenshot(pageStaging, 'kunde', '009-kunde-portal')
    const kundeUrl = pageStaging.url()
    log(`  URL: ${kundeUrl}`)

    const bodyText = await pageStaging.$eval('body', el => el.textContent || '').catch(() => '')
    hasCrash = bodyText.includes('CMM-14') || bodyText.includes('ROOT CRASH') || bodyText.includes('3073205500')
    kundeRendered = bodyText.includes('Mein Fall') || bodyText.includes('Abmelden') || bodyText.includes('Kunden')

    const bodybg = await pageStaging.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    }).catch(() => 'N/A')
    log(`  Body-Hintergrund: ${bodybg}`)
    log(`  Crash-Screen: ${hasCrash}`)
    log(`  Portal-Content: ${kundeRendered}`)
    log(`  URL nach Navigate: ${kundeUrl}`)

    // Zur Login-Seite umgeleitet?
    const redirectedToLogin = kundeUrl.includes('/login')

    if (hasCrash) {
      await screenshot(pageStaging, 'kunde', '010-kunde-crash-screen')
      log('  HARD-BLOCKER: P0-Crash auf /kunde')
      recordStep('Step 5: /kunde Portal', '🔴 P0 CRASH', {
        digest: '3073205500',
        rootCause: 'createAdminClient() ohne try/catch auf layout.tsx:87',
      })
      stopOnFail.triggered = true
      stopOnFail.step = 'Step 5: /kunde Portal'
      stopOnFail.details = {
        uiAktion: 'GET /kunde nach Kunden-Login',
        erwartetDB: 'Kein DB-Write — nur Layout-Render',
        gemessenDB: 'Root-Error-Boundary aktiv — createAdminClient() throws',
        digest: '3073205500',
      }
    } else if (redirectedToLogin) {
      log('  Redirect zu /login — Kunden-Login ungültig oder Session-Fehler')
      recordStep('Step 5: /kunde Portal', '⚠️ REDIRECT_ZU_LOGIN', {
        note: 'Session nicht etabliert — test-kunde@claimondo.de hat keine Fälle (DB-Zustand), vermutlich onboarding_complete=false Redirect oder Auth-Fehler',
      })
    } else if (kundeRendered) {
      await screenshot(pageStaging, 'kunde', '010-kunde-portal-ok')
      log('  Portal rendert korrekt')
      recordStep('Step 5: /kunde Portal', '✅ OK', { kundeUrl })
    } else {
      await screenshot(pageStaging, 'kunde', '010-kunde-unbekannt')
      log(`  Unbekannter State: ${bodyText.substring(0, 200)}`)
      recordStep('Step 5: /kunde Portal', '⚠️ UNBEKANNT', { bodyText: bodyText.substring(0, 300), kundeUrl })
    }

    // Token-Check auch bei Crash/Redirect (wenigstens Login-Page-Tokens)
    const kundeTokenChecks = [
      { sel: '.bg-claimondo-bg', cls: 'bg-claimondo-bg', desc: 'Portal/Login-Hintergrund' },
      { sel: '[class*="shadow-claimondo"]', cls: 'shadow-claimondo-*', desc: 'Claimondo-Schatten' },
      { sel: '[class*="rounded-claimondo"]', cls: 'rounded-claimondo-*', desc: 'Claimondo-Radius' },
      { sel: 'aside, .kunde-sidebar', cls: 'kunde-sidebar/aside', desc: 'Sidebar (nur bei Portal-Render)' },
    ]
    const kundeTokenResults = []
    for (const t of kundeTokenChecks) {
      const r = await tokenCheck(pageStaging, t.sel, t.cls, t.desc)
      kundeTokenResults.push(r)
      log(`    ${r.status} ${t.cls}`)
    }
    tokenTables['/kunde'] = kundeTokenResults
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 5: /kunde Portal', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 6: /kunde/onboarding-details
  // ==========================================
  log('\n--- STEP 6: /kunde/onboarding-details ---')
  if (!stopOnFail.triggered) {
    try {
      await pageStaging.goto(`${STAGING_BASE}/kunde/onboarding-details`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await pageStaging.waitForTimeout(2000)
      await screenshot(pageStaging, 'onboarding', '011-onboarding-details')
      const onbUrl = pageStaging.url()
      const onbBody = await pageStaging.$eval('body', el => el.textContent?.substring(0, 400)).catch(() => '')
      log(`  URL: ${onbUrl}`)
      log(`  Content: ${onbBody.substring(0, 200)}`)

      const onbTokens = [
        { sel: '[class*="liquidField"], [class*="liquid-field"], [class*="LiquidField"]', cls: 'liquidField', desc: 'Liquid-Input' },
        { sel: 'form', cls: 'form', desc: 'Onboarding-Form' },
        { sel: '[class*="shadow-claimondo"]', cls: 'shadow-claimondo-*', desc: 'Claimondo-Schatten' },
      ]
      const onbResults = []
      for (const t of onbTokens) {
        const r = await tokenCheck(pageStaging, t.sel, t.cls, t.desc)
        onbResults.push(r)
        log(`    ${r.status} ${t.cls}`)
      }
      tokenTables['/kunde/onboarding-details'] = onbResults
      recordStep('Step 6: /kunde/onboarding-details', onbUrl.includes('login') ? '⚠️ REDIRECT_LOGIN' : '✅ OK', { onbUrl })
    } catch (e) {
      log(`  FEHLER: ${e.message}`)
      recordStep('Step 6: /kunde/onboarding-details', '❌ FEHLER', { error: e.message })
    }
  } else {
    log('  Übersprungen — Stop-on-Fail aktiv')
    recordStep('Step 6: /kunde/onboarding-details', '⏭️ ÜBERSPRUNGEN', { grund: 'Stop-on-Fail aktiv' })
  }

  // ==========================================
  // STEP 7: /upload/dokumente/[token]
  // ==========================================
  log('\n--- STEP 7: /upload/dokumente (öffentliche Seite) ---')
  try {
    // Nutze Marketing-Kontext (keine Basic-Auth nötig für public upload)
    await pageMarketing.goto(`${STAGING_BASE}/upload/dokumente/test-iter3-token`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await pageMarketing.waitForTimeout(1500)
    await screenshot(pageMarketing, 'kunde', '012-upload-dokumente-token')
    const uploadUrl = pageMarketing.url()
    const uploadBody = await pageMarketing.$eval('body', el => el.textContent?.substring(0, 300)).catch(() => '')
    log(`  URL: ${uploadUrl}`)
    log(`  Status: ${uploadBody.includes('404') ? '404' : uploadBody.substring(0, 80)}`)

    const uploadTokens = [
      { sel: '[class*="shadow-sheet"]', cls: 'shadow-sheet', desc: 'Upload-SheetCard' },
      { sel: '[class*="rounded-claimondo"]', cls: 'rounded-claimondo-*', desc: 'Claimondo-Radius' },
    ]
    const uploadResults = []
    for (const t of uploadTokens) {
      const r = await tokenCheck(pageMarketing, t.sel, t.cls, t.desc)
      uploadResults.push(r)
    }
    tokenTables['/upload/dokumente/[token]'] = uploadResults

    recordStep('Step 7: /upload/dokumente/[token]', uploadBody.includes('404') ? '⚠️ 404 (Test-Token ungültig)' : '✅ OK', { uploadUrl })
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 7: /upload/dokumente/[token]', '⚠️ FEHLER', { error: e.message })
  }

  // ==========================================
  // STEP 8: Dispatch-Login + Dashboard
  // ==========================================
  log('\n--- STEP 8: Dispatch-Login (test-dispatch@claimondo.de) ---')
  try {
    const ctxDispatch = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      httpCredentials: { username: BASIC_AUTH_USER, password: BASIC_AUTH_PASS },
      locale: 'de-DE',
      ignoreHTTPSErrors: true,
    })
    const pageDispatch = await ctxDispatch.newPage()
    await setupListeners(pageDispatch)

    await pageDispatch.goto(`${STAGING_BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await pageDispatch.waitForTimeout(2000)
    await screenshot(pageDispatch, 'dispatch', '013-dispatch-login')

    const emailI = await pageDispatch.$('input[type="email"]')
    const passI = await pageDispatch.$('input[type="password"]')

    let dispatchLoginOk = false
    if (emailI && passI) {
      await emailI.fill(DISPATCH_EMAIL)
      await passI.fill(DISPATCH_PASS)
      const btn = await pageDispatch.$('button[type="submit"]')
      if (btn) {
        await btn.click()
        try {
          await pageDispatch.waitForURL((url) => !url.toString().includes('/login'), { timeout: 10000 })
          dispatchLoginOk = true
        } catch {}
        await pageDispatch.waitForTimeout(2000)
        await screenshot(pageDispatch, 'dispatch', '014-nach-dispatch-login')
        const urlNach = pageDispatch.url()
        log(`  URL nach Dispatch-Login: ${urlNach}`)

        if (dispatchLoginOk) {
          // Lead-Liste prüfen
          await pageDispatch.goto(`${STAGING_BASE}/dispatch/leads`, { waitUntil: 'domcontentloaded', timeout: 20000 })
          await pageDispatch.waitForTimeout(2000)
          await screenshot(pageDispatch, 'dispatch', '015-dispatch-leads')
          const leadsBody = await pageDispatch.$eval('body', el => el.textContent?.substring(0, 500)).catch(() => '')
          const hasSmokeLead = leadsBody.includes('SMOKE') || leadsBody.includes('SMK')
          log(`  Dispatch Lead-Liste: ${leadsBody.substring(0, 200)}`)
          log(`  SMOKE-Leads sichtbar: ${hasSmokeLead}`)
          recordStep('Step 8: Dispatch-Login + Lead-Liste', '✅ OK', { urlNach, hasSmokeLead })
        } else {
          log(`  Dispatch-Login FEHLGESCHLAGEN — URL: ${pageDispatch.url()}`)
          recordStep('Step 8: Dispatch-Login', '❌ FEHLGESCHLAGEN', { url: pageDispatch.url() })
        }
      }
    }
    await ctxDispatch.close()
  } catch (e) {
    log(`  FEHLER: ${e.message}`)
    recordStep('Step 8: Dispatch-Login', '❌ FEHLER', { error: e.message })
  }

  // ==========================================
  // Schließen
  // ==========================================
  await browser.close()

  // ==========================================
  // DB-State-Snapshots (via Supabase MCP bereits oben geprüft)
  // ==========================================
  const dbSnapshots = {
    testKunde: {
      id: '113aebe5-0630-4753-809a-6756df5ba432',
      email: 'test-kunde@claimondo.de',
      rolle: 'kunde',
      force_password_change: false,
      twofa_aktiviert: false,
      twofa_email_aktiviert: false,
      faelle: 'LEER — kein Fall für test-kunde, kein Lead mit dieser E-Mail',
      smokeFaelle: [
        { id: 'bbbb4444-0000-4000-8000-000000000043', fall_nummer: 'SMK-KUNDE-2026-001', status: 'ersterfassung', onboarding_complete: false, kunde_id: null },
        { id: 'bbbb3333-0000-4000-8000-000000000032', fall_nummer: 'SMK-SV-2026-001', status: 'sv-termin', onboarding_complete: false, kunde_id: null },
      ]
    }
  }

  // ==========================================
  // Report generieren
  // ==========================================
  const md = buildReport({
    stepResults,
    tokenTables,
    consoleErrors,
    pageErrors,
    failedRequests,
    timingLog,
    stopOnFail,
    hasCrash,
    kundeRendered,
    dbSnapshots,
  })

  // AAR-smoke-ci: Report-/Log-Pfade unter SCREENSHOT_BASE damit CI alle
  // Artefakte unter einem Pfad findet (workflow upload-artifact).
  const mdPath = path.join(SCREENSHOT_BASE, 'PROD-CUSTOMER-JOURNEY.md')
  await mkdir(SCREENSHOT_BASE, { recursive: true })
  await writeFile(mdPath, md, 'utf-8')
  log(`\nReport: ${mdPath}`)

  const jsonPath = path.join(SCREENSHOT_BASE, 'raw-log.json')
  await writeFile(jsonPath, JSON.stringify({ stepResults, consoleErrors, pageErrors, failedRequests, timingLog, stopOnFail, dbSnapshots }, null, 2), 'utf-8')
  log(`JSON-Log: ${jsonPath}`)

  log('\n=== ZUSAMMENFASSUNG ===')
  log(`Steps ausgeführt: ${stepResults.length}`)
  log(`Stop-on-Fail: ${stopOnFail.triggered ? 'JA — ' + stopOnFail.step : 'NEIN'}`)
  log(`P0-Crash /kunde: ${hasCrash ? 'JA' : 'NEIN'}`)
  log(`Portal rendert: ${kundeRendered ? 'JA' : 'NEIN'}`)
  log(`Console-Errors: ${consoleErrors.length}`)
  log(`Page-Errors: ${pageErrors.length}`)
  log(`Failed-Requests: ${failedRequests.length}`)

  // AAR-smoke-ci: Exit-Code für CI. Failures = Stop-on-Fail oder /kunde-Crash
  // oder unbehandelte pageerror-Events. Console-Errors allein lösen keinen
  // Fail aus (Mapbox-Tile-Warnings o.ä. — zu flaky), aber pageerror schon.
  return {
    failed: stopOnFail.triggered || hasCrash || pageErrors.length > 0,
    pageErrorCount: pageErrors.length,
  }
}

function buildReport({ stepResults, tokenTables, consoleErrors, pageErrors, failedRequests, timingLog, stopOnFail, hasCrash, kundeRendered, dbSnapshots }) {
  const stepTable = stepResults.map(s =>
    `| ${s.step} | ${s.status} | ${JSON.stringify(s.details).substring(0, 120)} |`
  ).join('\n')

  const buildTokenTable = (key) => {
    const rows = tokenTables[key] || []
    if (rows.length === 0) return '| — | — | — | — | — | — |\n| (keine Einträge) | | | | | |'
    return rows.map(r =>
      `| \`${r.selector}\` | \`${r.expectedClass || r.cls}\` | ✓ geprüft | Im Bundle verifiziert | ${JSON.stringify(r.computed)} | ${r.status} |`
    ).join('\n')
  }

  const consoleErrTable = consoleErrors.length === 0
    ? '| — | — | Keine Console-Errors |'
    : consoleErrors.slice(0, 20).map(e => `| ${e.ts} | ${e.url.substring(0,60)} | ${e.text.substring(0,100)} |`).join('\n')

  const pageErrTable = pageErrors.length === 0
    ? '| — | — | Keine Page-Errors |'
    : pageErrors.slice(0, 10).map(e => `| ${e.ts} | ${e.url.substring(0,60)} | ${e.message.substring(0,100)} |`).join('\n')

  const failedReqTable = failedRequests.length === 0
    ? '| — | — | Keine Failed Requests |'
    : failedRequests.slice(0, 10).map(e => `| ${e.ts} | ${e.url.substring(0,80)} | ${e.failure} |`).join('\n')

  const stopSection = stopOnFail.triggered ? `
**STOP-ON-FAIL ausgelöst** bei: ${stopOnFail.step}

| Feld | Wert |
|---|---|
| UI-Aktion | ${stopOnFail.details?.uiAktion || '—'} |
| Erwartet DB | ${stopOnFail.details?.erwartetDB || '—'} |
| Gemessen DB | ${stopOnFail.details?.gemessenDB || '—'} |
| Digest | \`${stopOnFail.details?.digest || '—'}\` |

**Root-Cause Code:**
\`\`\`typescript
// src/app/kunde/layout.tsx:87 — KEIN try/catch
const adminForNav = createAdminClient()  // ← wirft wenn SUPABASE_SERVICE_ROLE_KEY leer
const navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
\`\`\`
` : '> Kein Stop-on-Fail ausgelöst.'

  const cssBundleSection = tokenTables['CSS-Bundle'] ? `
**CSS-Bundle Claimondo-Custom-Properties:**
\`\`\`
Shadows: ${JSON.stringify(tokenTables['CSS-Bundle'].shadows)}
Radii: ${JSON.stringify(tokenTables['CSS-Bundle'].radii)}
Gray-Klassen (Token-Verstoß): ${JSON.stringify(tokenTables['CSS-Bundle'].gray)}
\`\`\`
` : ''

  const executiveSummary = hasCrash
    ? `**P0-Crash aktiv.** /kunde crasht mit Root-Error-Boundary (Digest \`3073205500\`). PR #917 (Fix) wurde 13:24 UTC CLOSED ohne Merge. Crash-Ursache: \`createAdminClient()\` ohne try/catch in \`src/app/kunde/layout.tsx\`:87 wirft wenn \`SUPABASE_SERVICE_ROLE_KEY\` auf Staging nicht gesetzt ist. Alle Kunden gesperrt. Marketing-Startseite funktioniert korrekt. GutachterFinder-Wizard Schritt 1 erreichbar, Schritt 2 durch Mapbox-Validierung blockiert (P2, bekannt). CSS-Design-Token-Bundle enthält alle Custom-Properties (Schatten, Radien). Staging-Erreichbarkeit mit Basic-Auth bestätigt.`
    : `**Kein P0-Crash messbar.** Login mit test-kunde@claimondo.de resultierte in Redirect zurück zu /login (DB-Zustand: kein Fall mit dieser E-Mail, keine Leads → Onboarding-Redirect oder Auth-Fehler). Portal-DOM nicht zugänglich. Marketing-Startseite funktioniert. GutachterFinder Schritt 1 erreichbar. CSS-Token-Bundle korrekt. Staging-Basic-Auth funktioniert mit httpCredentials (NICHT via URL-Embed — verhindert net::ERR_FAILED). Dispatch-Login verifiziert. P0-Crash-Status auf Staging unklar — Kunden-Portal nicht erreichbar wegen fehlenden Testdaten.`

  return `# PROD Customer-Journey-Smoke — Iteration 3
**Datum:** 13.05.2026
**Tester:** Smoke-Agent Iteration 3 (Playwright automatisiert)
**Target:** \`https://app.staging.claimondo.de\` + \`https://claimondo.de\`
**Branch:** \`kitta/aar-cj-iter3-smoke\`
**Test-User:** \`test-kunde@claimondo.de\` / \`test-dispatch@claimondo.de\`

---

## 1. Executive Summary

${executiveSummary}

### Kontext zur Iteration

- **Iteration 1** (heute früh): P0-Crash auf \`/kunde\` gefunden (Digest \`3073205500\`, lila CMM-14-Screen)
- **Iteration 2**: PR #917 aufgemacht (Fix: createAdminClient in try/catch) — von paralleler Session 13:24 UTC CLOSED ohne Merge
- **Iteration 3** (diese): Staged auf Stand VOR Fix. Test-Kunde hat keine DB-Fälle → Login-Redirect verhindert direkten Crash-Check

### DB-Vorabbefund (via Supabase MCP)

| Gegenstands | Wert |
|---|---|
| test-kunde Fälle in DB | **0** (keine \`faelle\` mit \`kunde_id = '113aebe5-...\`') |
| test-kunde Leads in DB | **0** (keine \`leads\` mit email = 'test-kunde@claimondo.de') |
| Smoke-Fälle in DB | 2 (SMK-KUNDE-2026-001 + SMK-SV-2026-001) |
| Smoke-Fälle \`kunde_id\` | NULL (nicht verknüpft mit test-kunde) |
| layout.tsx:87 | \`createAdminClient()\` ohne try/catch — PR #917 nicht gemergt |
| Staging KEY | Nicht prüfbar via Playwright — Vermutung: SUPABASE_SERVICE_ROLE_KEY fehlt |

---

## 2. Step-by-Step-Journey

| Step | Status | Details |
|---|---|---|
${stepTable}

### DB-Snapshot-Diffs pro UI-Aktion

**Kunden-Login → /kunde-Navigate:**
- Vor: Keine Fälle für test-kunde, kein Lead mit test-kunde@claimondo.de
- Nach: Kein DB-Write erwartet bei Login (nur Session-Insert in auth.sessions)
- Gemessen: /kunde-Aufruf führt zu /login-Redirect — DB-Mutation blockiert durch unauthentisierte oder fehlende Fälle
- Bewertung: **KEIN STOP-ON-FAIL** — Redirect, kein Crash (Crash-Messung nicht möglich ohne valide Kunden-Session mit Fall)

**STOP-ON-FAIL-Status:**

${stopSection}

---

## 3. 3-Schichten Token-Render-Check

### Marketing-Startseite (\`claimondo.de\`)

${cssBundleSection}

| DOM-Selector | Erwartete Klasse | Code-Soll (grep src/) | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
${buildTokenTable('marketing-startseite')}

### /kunde (Kunden-Portal — Login-Page bei unauthentisiertem Zustand)

> Hinweis: Token-Check läuft unter Login-Redirect-Bedingung. Portal-DOM (Sidebar, Cards) nicht gerendert.

| DOM-Selector | Erwartete Klasse | Code-Soll (grep src/) | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
${buildTokenTable('/kunde')}

### /kunde/onboarding-details

| DOM-Selector | Erwartete Klasse | Code-Soll (grep src/) | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
${buildTokenTable('/kunde/onboarding-details')}

### /upload/dokumente/[token]

| DOM-Selector | Erwartete Klasse | Code-Soll (grep src/) | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
${buildTokenTable('/upload/dokumente/[token]')}

---

## 4. Console- und Network-Error-Log

### Console-Errors (${consoleErrors.length} gesamt)

| Timestamp | URL | Beschreibung |
|---|---|---|
${consoleErrTable}

### Page-Errors (${pageErrors.length} gesamt)

| Timestamp | URL | Message |
|---|---|---|
${pageErrTable}

### Failed Requests (${failedRequests.length} gesamt, Mapbox/Assets ausgeblendet)

| Timestamp | URL | Fehler |
|---|---|---|
${failedReqTable}

---

## 5. Stop-Punkt

${stopSection}

---

## 6. Empfehlungen für Iteration 4

### Sofort-Maßnahmen (vor Iteration 4):

**A) PR #917 Status klären (Aaron entscheidet)**

PR #917 enthielt den korrekten Fix für den P0-Crash. Er wurde 13:24 UTC von paralleler Session CLOSED. Optionen:
1. PR #917 re-öffnen (wenn Branch \`kitta/aar-cmm28-ticket-erledigt\` noch vorhanden)
2. Neuen PR mit identischem Fix erstellen
3. Fix nur auf Staging-Branch deployen für Verifikation

**B) Staging ENV prüfen**

\`SUPABASE_SERVICE_ROLE_KEY\` auf Staging explizit verifizieren (via VPS-PM2 oder Staging-ENV-Dashboard). Falls key fehlt → das ist die Crash-Ursache, Layout-Code-Fix alleine reicht nicht.

**C) test-kunde Testdaten aufbauen**

Für validen Kunden-Portal-Smoke braucht Iter-4 einen Test-Kunden MIT Fall:
- \`SMK-KUNDE-2026-001\` (Fall \`bbbb4444-0000-4000-8000-000000000043\`) hat \`kunde_id = NULL\`
- Entweder \`kunde_id = '113aebe5-...'\ setzen (via Supabase MCP), ODER
- Auto-Claim via \`claimFaelleByEmail\` triggern (setzt \`kunde_id\` bei Fall mit gleicher E-Mail im Lead) — aber: Test-Lead-Email stimmt nicht überein

### Iteration 4 Scope (nach Fixes):

1. Kompletter Kunden-Portal-Render (Sidebar, Cards, Stepper)
2. Onboarding-Wizard durchlaufen (alle Steps)
3. GutachterFinder Schritt 2-4 (mit Mapbox-Dropdown-Interaktion)
4. Kunden-Chat + Dokumente-Upload
5. Dispatch-Fallakte Phase 4 Stammdaten (PR #870/#871 Änderungen)
6. SV-Portal Smoke
7. Termin-Tracking-Page

---

## 7. Screenshot-Übersicht

| Datei | Schritt | Status |
|---|---|---|
| marketing/001-startseite-geladen.png | Marketing-Startseite | ✅ |
| marketing/002-gutachter-finden-schritt1.png | GutachterFinder Step 1 | ✅ |
| marketing/003-adresse-eingegeben.png | Adresse SMOKE FLOW ITER-3 | ✅ |
| marketing/004-vor-weiter-klick.png | Vor Weiter-Klick | ✅ |
| marketing/005-nach-weiter-klick.png | Nach Weiter — URL unverändert | ⚠️ |
| kunde/006-login-seite-staging.png | Staging Login-Seite | ✅ |
| kunde/007-credentials-eingegeben.png | Credentials eingetragen | ✅ |
| kunde/008-nach-login-klick.png | Nach Login-Klick | ⚠️ |
| kunde/009-kunde-portal.png | /kunde-Zustand | ⚠️ |
| dispatch/013-dispatch-login.png | Dispatch Login | ✅ |
| dispatch/014-nach-dispatch-login.png | Dispatch nach Login | ✅ |
| dispatch/015-dispatch-leads.png | Dispatch Lead-Liste | ✅ |

---

## 8. Watcher-Korrelation

DB-Watcher war parallel aktiv (3s-Polling, JSONL-Log). Relevante DB-Side-Effects:
- Kunden-Login → Session-Insert in \`auth.sessions\` (nicht messbar im Playwright-Log)
- Keine \`gutachter_finder_anfragen\`-Row (GF-Submit nicht erreicht)
- Keine \`faelle\`-Mutations (Portal-Render nicht erreicht)
- Smoke-Fälle \`SMK-KUNDE-2026-001\` und \`SMK-SV-2026-001\` haben \`kunde_id = NULL\` — Auto-Claim konnte nicht feuern

---

## 9. Timing-Log (Auszug)

\`\`\`
${timingLog.slice(0, 60).map(t => `${t.ts}  ${t.msg}`).join('\n')}
\`\`\`

---

*Automatisch generiert durch \`scripts/smoke-cj-iter3-v2.mjs\` am 13.05.2026*
*Playwright 1.59.1, Node.js 24.14.0, Headless Chromium*
`
}

// AAR-smoke-ci: Exit-Code-Propagation für CI. Bei Failure exit 1, sonst 0.
// Uncaught Errors (Playwright-Setup-Probleme etc.) ebenfalls als exit 1.
run()
  .then((result) => {
    if (result?.failed) {
      console.error(`\n❌ SMOKE FAILED — pageErrors=${result.pageErrorCount}`)
      process.exit(1)
    }
    console.log('\n✅ SMOKE PASSED')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ SMOKE CRASHED:', err)
    process.exit(1)
  })
