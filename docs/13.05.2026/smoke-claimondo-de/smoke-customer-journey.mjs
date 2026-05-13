/**
 * Production Customer-Journey-Smoke
 * Vollständige Kunden-Perspektive: Marketing → GutachterFinder → Dispatch-Verifikation → Kunden-Portal
 *
 * Verwendung (kein Basic-Auth nötig — Production):
 *   node smoke-customer-journey.mjs
 *
 * Screenshots: docs/13.05.2026/smoke-claimondo-de/prod-iter-1/<portal>/<NNN>-<label>.png
 */

import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Konfiguration ────────────────────────────────────────────────────────────
const APP_BASE = 'https://app.claimondo.de'
const MARKETING_BASE = 'https://claimondo.de'

const KUNDE_EMAIL = 'test-kunde@claimondo.de'
const KUNDE_PASS = 'Test1234!'
const DISPATCH_EMAIL = 'test-dispatch@claimondo.de'
const DISPATCH_PASS = 'Test1234!'

const SHOTS_DIR = path.join(__dirname, 'prod-iter-1')
const findings = []
const consoleErrors = []
const networkErrors = []
let shotCounter = 0
let stepCounter = 0

// ─── Helfer ───────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(3, '0')
}

async function shot(page, portal, label, note = '') {
  shotCounter++
  const num = pad(shotCounter)
  const filename = `${num}-${label}.png`
  const dir = path.join(SHOTS_DIR, portal)
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, filename)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`  📸 ${portal}/${filename}${note ? ' — ' + note : ''}`)
  return `prod-iter-1/${portal}/${filename}`
}

function step(label) {
  stepCounter++
  console.log(`\n─── Schritt ${stepCounter}: ${label} ───`)
}

function finding(severity, id, portal, beschreibung, status = 'OFFEN') {
  findings.push({ severity, id, portal, beschreibung, status })
  const icon = severity === 'BLOCKER' ? '🔴' : severity === 'P1' ? '🟠' : severity === 'P2' ? '🟡' : '🟢'
  console.log(`  ${icon} ${severity} [${id}] ${beschreibung}`)
}

function hookConsoleAndNetwork(page, context) {
  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    // Browser-Defaults rausfiltern
    if (
      text.includes('Download the React DevTools') ||
      text.includes('__NEXT_DATA__') ||
      text.startsWith('[Fast Refresh]') ||
      text.includes('Warning: Each child in a list')
    ) return
    if (type === 'error' || type === 'warning') {
      consoleErrors.push({ context, type, text, url: page.url() })
      console.log(`  ⚠️  Console ${type.toUpperCase()} [${page.url()}]: ${text.slice(0, 120)}`)
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push({ context, type: 'pageerror', text: err.message, url: page.url() })
    console.log(`  🔴 Page-Error [${page.url()}]: ${err.message.slice(0, 120)}`)
  })
  page.on('response', (resp) => {
    const status = resp.status()
    if (status >= 400) {
      networkErrors.push({ context, status, url: resp.url() })
      if (status >= 500 || (status >= 400 && !resp.url().includes('_next/image'))) {
        console.log(`  🔴 HTTP ${status} [${context}]: ${resp.url().slice(0, 100)}`)
      }
    }
  })
}

async function loginAs(page, email, pass, portal = 'dispatch') {
  await page.goto(`${APP_BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', pass)
  await page.click('button[type="submit"]')
  // Warte auf Redirect nach Login
  await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 15000 })
}

async function checkTokenRendering(page, context) {
  const results = {}
  try {
    results.shadowSheet = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="shadow-sheet"]')
      if (!els.length) return 'KEIN_ELEMENT'
      const el = els[0]
      const computed = getComputedStyle(el)
      return computed.boxShadow || 'LEER'
    })
    results.roundedSheet = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="rounded-claimondo-sheet"]')
      if (!els.length) return 'KEIN_ELEMENT'
      const el = els[0]
      return getComputedStyle(el).borderRadius || 'LEER'
    })
    results.shadowMd = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="shadow-claimondo-md"]')
      if (!els.length) return 'KEIN_ELEMENT'
      const el = els[0]
      return getComputedStyle(el).boxShadow || 'LEER'
    })
    results.shadowFocusOndo = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="shadow-focus-ondo"]')
      if (!els.length) return 'KEIN_ELEMENT'
      return 'KLASSE_VORHANDEN'
    })
    // Token-Verletzungen prüfen
    results.tokenViolatorsGray = await page.evaluate(() => {
      const all = document.querySelectorAll('*')
      const violations = []
      for (const el of all) {
        const cls = el.className
        if (typeof cls !== 'string') continue
        if (/\btext-gray-[0-9]+\b|\btext-slate-[0-9]+\b|\bbg-gray-[0-9]+\b|\bbg-slate-[0-9]+\b/.test(cls)) {
          const tag = el.tagName.toLowerCase()
          const id = el.id ? `#${el.id}` : ''
          const clsShort = cls.split(' ').filter(c => /gray|slate/.test(c)).join(' ')
          violations.push(`${tag}${id}: ${clsShort}`)
          if (violations.length >= 5) break
        }
      }
      return violations
    })
  } catch (err) {
    results.fehler = err.message
  }
  return { context, ...results }
}

// ─── Haupt-Journey ────────────────────────────────────────────────────────────

;(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  hookConsoleAndNetwork(page, 'marketing')

  const tokenChecks = []
  const shotLog = []
  const startTs = new Date().toISOString()

  console.log('=== Production Customer-Journey-Smoke ===')
  console.log(`Start: ${startTs}`)
  console.log(`Ziel: ${MARKETING_BASE} + ${APP_BASE}`)

  // ══════════════════════════════════════════════════════════════════════════
  // SCHRITT 1: Marketing-Startseite
  // ══════════════════════════════════════════════════════════════════════════
  step('Marketing-Startseite — claimondo.de')
  await page.goto(MARKETING_BASE, { waitUntil: 'networkidle', timeout: 30000 })
  shotLog.push(await shot(page, 'marketing', '001-startseite-oben', 'Hero-Section sichtbar?'))

  // Hero-Text verifizieren
  const heroText = await page.locator('h1').first().textContent().catch(() => null)
  console.log(`  Hero-H1: "${heroText?.slice(0, 80)}"`)
  if (!heroText || heroText.length < 10) {
    finding('P1', 'MKT-01', 'marketing', 'Hero-H1 nicht gefunden oder leer')
  } else {
    finding('OK', 'MKT-01', 'marketing', `Hero-H1 korrekt: "${heroText?.slice(0, 60)}"`, 'BESTÄTIGT')
  }

  // Scroll zu GutachterFinder-CTA
  await page.evaluate(() => window.scrollTo(0, 300))
  shotLog.push(await shot(page, 'marketing', '002-startseite-cta-bereich', 'CTA-Buttons sichtbar?'))

  // Token-Check auf Marketing-Seite
  const tokenMarketing = await checkTokenRendering(page, 'marketing-startseite')
  tokenChecks.push(tokenMarketing)

  // ══════════════════════════════════════════════════════════════════════════
  // SCHRITT 2: GutachterFinder-Formular
  // ══════════════════════════════════════════════════════════════════════════
  step('GutachterFinder — /gutachter-finden')

  // Klick auf CTA (Link-Text suchen)
  const gutachterLink = page.getByRole('link', { name: /Gutachter.*finden|gutachter-finden/i }).first()
  const gutachterLinkHref = await gutachterLink.getAttribute('href').catch(() => null)
  console.log(`  GutachterFinder-Link href: ${gutachterLinkHref}`)

  await page.goto(`${MARKETING_BASE}/gutachter-finden`, { waitUntil: 'networkidle' })
  shotLog.push(await shot(page, 'marketing', '003-gutachter-finden-schritt1', 'Step 1/4 — Adress-Eingabe'))

  // Step-Indikator prüfen
  const stepIndicator = await page.locator('text=/Schritt.*1.*4|Step.*1.*4/i').first().textContent().catch(() => null)
  console.log(`  Step-Indikator: "${stepIndicator}"`)

  // Adresse eingeben
  const adresseInput = page.locator('input').first()
  const adresseLabel = await page.locator('label').first().textContent().catch(() => 'unbekannt')
  console.log(`  Erstes Input-Label: "${adresseLabel}"`)

  await adresseInput.fill('Hohenzollernring 1, 50672 Köln')
  await page.waitForTimeout(800) // Autocomplete-Delay
  shotLog.push(await shot(page, 'marketing', '004-gutachter-adresse-eingegeben', 'PLZ Köln eingetippt'))

  // Token-Check auf Wizard-Seite
  const tokenWizard = await checkTokenRendering(page, 'gutachter-wizard')
  tokenChecks.push(tokenWizard)

  // "Weiter" klicken
  const weiterBtn = page.getByRole('button', { name: /weiter/i }).first()
  const weiterVisible = await weiterBtn.isVisible().catch(() => false)
  if (!weiterVisible) {
    finding('P1', 'GF-01', 'gutachter-finden', 'Weiter-Button nicht sichtbar auf Schritt 1')
    // Fallback: direkt navigieren
    console.log('  ⚠️  Fallback: direkt zu Schritt 2 navigieren nicht möglich ohne Weiter-Button')
  } else {
    await weiterBtn.click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    shotLog.push(await shot(page, 'marketing', '005-gutachter-schritt2', 'Nach Weiter-Klick'))
    console.log(`  Aktuelle URL: ${page.url()}`)

    // Schritt 2 — Schadentyp
    const step2Heading = await page.locator('h1,h2,h3').first().textContent().catch(() => null)
    console.log(`  Schritt 2 Überschrift: "${step2Heading?.slice(0, 60)}"`)

    // Schadentyp auswählen (Radio/Button/Card)
    const auffahrunfallOption = page.getByText(/Auffahrunfall|auffahrunfall/i).first()
    const auffahrunfallVisible = await auffahrunfallOption.isVisible().catch(() => false)
    if (auffahrunfallVisible) {
      await auffahrunfallOption.click()
      await page.waitForTimeout(500)
      shotLog.push(await shot(page, 'marketing', '006-gutachter-schadentyp-gewaehlt', 'Auffahrunfall ausgewählt'))

      const weiterBtn2 = page.getByRole('button', { name: /weiter/i }).first()
      if (await weiterBtn2.isVisible().catch(() => false)) {
        await weiterBtn2.click()
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(1000)
        shotLog.push(await shot(page, 'marketing', '007-gutachter-schritt3', 'Schritt 3'))
        console.log(`  Schritt 3 URL: ${page.url()}`)

        // Schritt 3 — Kontaktdaten
        const nameInput = page.locator('input[name="name"],input[placeholder*="Name"],input[type="text"]').first()
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill('SMOKE TEST 13.05.2026')
          const emailInput = page.locator('input[type="email"]').first()
          if (await emailInput.isVisible().catch(() => false)) {
            await emailInput.fill('test-smoke-13052026@claimondo-test.de')
          }
          const telInput = page.locator('input[type="tel"],input[name="telefon"],input[name="phone"]').first()
          if (await telInput.isVisible().catch(() => false)) {
            await telInput.fill('+49 221 0000000')
          }
          shotLog.push(await shot(page, 'marketing', '008-gutachter-kontaktdaten-eingetragen', 'Kontaktdaten ausgefüllt'))

          const weiterBtn3 = page.getByRole('button', { name: /weiter|absenden|anfrage/i }).first()
          if (await weiterBtn3.isVisible().catch(() => false)) {
            await weiterBtn3.click()
            await page.waitForLoadState('networkidle').catch(() => {})
            await page.waitForTimeout(2000)
            shotLog.push(await shot(page, 'marketing', '009-gutachter-schritt4-oder-danke', 'Nach Schritt 3'))
            console.log(`  URL nach Step 3: ${page.url()}`)

            // Prüfe ob SA-Signing-Step oder Danke-Seite
            const dankText = await page.locator('text=/Vielen Dank|Danke|Anfrage.*eingegangen|Bestätigung/i').first().textContent().catch(() => null)
            const signText = await page.locator('text=/unterschreib|Vollmacht|SA.*sign/i').first().textContent().catch(() => null)
            if (dankText) {
              finding('OK', 'GF-02', 'gutachter-finden', `GutachterFinder-Submit erfolgreich: "${dankText?.slice(0, 60)}"`, 'BESTÄTIGT')
            } else if (signText) {
              finding('OK', 'GF-03', 'gutachter-finden', 'SA-Signing-Step erscheint nach Form-Submit', 'BESTÄTIGT')
              // Signing nicht klicken — dokumentieren und stoppen (Twilio-Outbound-Risk)
              console.log('  ⚠️  SA-Signing-Step vorhanden — NICHT geklickt (Outbound-Risk)')
            } else {
              const currentHeading = await page.locator('h1,h2').first().textContent().catch(() => 'unbekannt')
              console.log(`  Unbekannter Zustand nach Step 3: "${currentHeading}"`)
              finding('P2', 'GF-04', 'gutachter-finden', `Unklarer Zustand nach Schritt 3: "${currentHeading?.slice(0, 60)}"`)
            }
          } else {
            finding('P1', 'GF-05', 'gutachter-finden', 'Weiter/Absenden-Button auf Schritt 3 nicht gefunden')
          }
        } else {
          finding('P1', 'GF-06', 'gutachter-finden', 'Kontaktdaten-Inputs auf Schritt 3 nicht gefunden')
          shotLog.push(await shot(page, 'marketing', '008-gutachter-schritt3-leer', 'Schritt 3 ohne erkannte Inputs'))
        }
      } else {
        finding('P1', 'GF-07', 'gutachter-finden', 'Weiter-Button nach Schadentyp-Wahl nicht sichtbar')
      }
    } else {
      finding('P2', 'GF-08', 'gutachter-finden', 'Auffahrunfall-Option nicht gefunden — Schritt 2 unbekanntes Layout')
      shotLog.push(await shot(page, 'marketing', '006-gutachter-schritt2-layout', 'Schritt 2 Ist-Zustand'))
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCHRITT 3: Dispatch-Hintergrund-Verifikation (kurz)
  // ══════════════════════════════════════════════════════════════════════════
  step('Dispatch-Hintergrund — Lead-Liste (kurzer Side-Trip)')
  hookConsoleAndNetwork(page, 'dispatch')

  await page.goto(`${APP_BASE}/login`, { waitUntil: 'networkidle' })
  shotLog.push(await shot(page, 'dispatch', '010-login-vor-dispatch', 'Login-Seite für Dispatch'))

  await page.fill('input[type="email"]', DISPATCH_EMAIL)
  await page.fill('input[type="password"]', DISPATCH_PASS)
  shotLog.push(await shot(page, 'dispatch', '011-login-credentials-eingetragen', 'Credentials eingetragen'))

  await page.click('button[type="submit"]')
  try {
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 15000 })
    const postLoginUrl = page.url()
    console.log(`  Post-Login URL: ${postLoginUrl}`)
    shotLog.push(await shot(page, 'dispatch', '012-dispatch-dashboard-nach-login', 'Dispatch nach Login'))

    // Lead-Liste aufrufen
    await page.goto(`${APP_BASE}/dispatch/leads`, { waitUntil: 'networkidle' })
    shotLog.push(await shot(page, 'dispatch', '013-dispatch-leads-liste', 'Lead-Liste'))

    const leadListHeading = await page.locator('h1,h2').first().textContent().catch(() => null)
    console.log(`  Lead-Liste Überschrift: "${leadListHeading?.slice(0, 60)}"`)

    // Suche nach Smoke-Lead
    const smokeLeadRow = page.locator('text=/SMOKE|SMK-SV-2026-001/i').first()
    const smokeVisible = await smokeLeadRow.isVisible().catch(() => false)
    if (smokeVisible) {
      finding('OK', 'DISP-01', 'dispatch', 'SMOKE-Lead in Lead-Liste sichtbar', 'BESTÄTIGT')
    } else {
      console.log('  ℹ️  SMK-SV-2026-001 nicht in sichtbaren Zeilen — ggf. paginiert')
      finding('P2', 'DISP-01', 'dispatch', 'SMK-SV-2026-001 nicht direkt in Lead-Liste sichtbar (ggf. paginiert)')
    }

    // Token-Check Dispatch
    const tokenDispatch = await checkTokenRendering(page, 'dispatch-leads')
    tokenChecks.push(tokenDispatch)

    // GutachterFinder-Anfragen-Liste
    await page.goto(`${APP_BASE}/dispatch/gutachter-finder`, { waitUntil: 'networkidle' }).catch(() => null)
    const gfStatus = await page.evaluate(() => document.title).catch(() => 'nicht erreichbar')
    const gfUrl = page.url()
    console.log(`  GutachterFinder-Dispatch URL: ${gfUrl}`)
    if (!gfUrl.includes('/login')) {
      shotLog.push(await shot(page, 'dispatch', '014-dispatch-gutachter-finder', 'GF-Anfragen-Liste'))
      const gfAnfragenRow = page.locator('text=/SMOKE|13.05/i').first()
      const gfAnfragenVisible = await gfAnfragenRow.isVisible().catch(() => false)
      if (gfAnfragenVisible) {
        finding('OK', 'DISP-02', 'dispatch', 'Neu erstellte GF-Anfrage in Dispatch sichtbar', 'BESTÄTIGT')
      } else {
        finding('P2', 'DISP-02', 'dispatch', 'Frische GF-Anfrage in Dispatch noch nicht sichtbar (ggf. Realtime-Lag)')
      }
    } else {
      finding('P1', 'DISP-03', 'dispatch', '/dispatch/gutachter-finder gibt Login-Redirect — Route nicht geschützt oder 404')
    }

  } catch (err) {
    finding('BLOCKER', 'DISP-00', 'dispatch', `Dispatch-Login fehlgeschlagen: ${err.message}`)
    console.log(`  🔴 Dispatch-Login Fehler: ${err.message}`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCHRITT 4: Kunden-Portal Login
  // ══════════════════════════════════════════════════════════════════════════
  step('Kunden-Portal — Login als test-kunde@claimondo.de')
  hookConsoleAndNetwork(page, 'kunde')

  await page.goto(`${APP_BASE}/login`, { waitUntil: 'networkidle' })
  shotLog.push(await shot(page, 'kunde', '015-login-vor-kunde', 'Login-Seite für Kunde'))

  await page.fill('input[type="email"]', KUNDE_EMAIL)
  await page.fill('input[type="password"]', KUNDE_PASS)
  shotLog.push(await shot(page, 'kunde', '016-login-kunde-credentials', 'Kunden-Credentials eingetragen'))

  await page.click('button[type="submit"]')
  try {
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 15000 })
    const kundeUrl = page.url()
    console.log(`  Kunden-Post-Login URL: ${kundeUrl}`)
    shotLog.push(await shot(page, 'kunde', '017-kunde-portal-nach-login', 'Kunden-Portal nach Login'))

    // Token-Check Kunden-Portal
    const tokenKunde = await checkTokenRendering(page, 'kunde-portal')
    tokenChecks.push(tokenKunde)

    // Fallakte — SMK-KUNDE-2026-001 suchen
    const fallakreLink = page.locator('text=/SMK-KUNDE|Fallakte|Mein Fall/i').first()
    const fallakreVisible = await fallakreLink.isVisible().catch(() => false)
    if (fallakreVisible) {
      await fallakreLink.click()
      await page.waitForLoadState('networkidle').catch(() => {})
      shotLog.push(await shot(page, 'kunde', '018-kunde-fallakte-detail', 'Fallakte-Detail'))
      console.log(`  Fallakte URL: ${page.url()}`)
    } else {
      console.log('  ℹ️  Direkt zu /kunde navigieren')
      await page.goto(`${APP_BASE}/kunde`, { waitUntil: 'networkidle' })
      shotLog.push(await shot(page, 'kunde', '018-kunde-dashboard', 'Kunden-Dashboard'))
    }

    const kundeHeading = await page.locator('h1,h2').first().textContent().catch(() => null)
    console.log(`  Kunden-Dashboard Überschrift: "${kundeHeading?.slice(0, 60)}"`)

    if (kundeUrl.includes('/login')) {
      finding('BLOCKER', 'KUNDE-00', 'kunde', 'Kunden-Login schlägt fehl oder Redirect bleibt auf /login')
    } else {
      finding('OK', 'KUNDE-01', 'kunde', 'Kunden-Login und Portal-Zugriff funktioniert', 'BESTÄTIGT')
    }

    // Status-Stepper prüfen
    const statusStepper = page.locator('[class*="stepper"],[class*="StepIndicator"],[class*="step-indicator"],[data-testid*="stepper"]').first()
    const stepperVisible = await statusStepper.isVisible().catch(() => false)
    if (stepperVisible) {
      finding('OK', 'KUNDE-02', 'kunde', 'Status-Stepper sichtbar im Kunden-Portal', 'BESTÄTIGT')
    } else {
      finding('P2', 'KUNDE-02', 'kunde', 'Status-Stepper nicht per Selector gefunden (ggf. anderer Klassenname)')
    }
    shotLog.push(await shot(page, 'kunde', '019-kunde-status-bereich', 'Status/Stepper-Bereich'))

    // Multi-Channel-Inbox prüfen
    const inboxTab = page.getByRole('tab', { name: /Nachrichten|Inbox|Chat/i }).first()
    const inboxVisible = await inboxTab.isVisible().catch(() => false)
    if (inboxVisible) {
      await inboxTab.click()
      await page.waitForTimeout(1000)
      shotLog.push(await shot(page, 'kunde', '020-kunde-inbox', 'Multi-Channel-Inbox'))
      finding('OK', 'KUNDE-03', 'kunde', 'Multi-Channel-Inbox Tab erreichbar', 'BESTÄTIGT')
    } else {
      // Nachrichten-Link als Alternative
      const nachrichtenLink = page.getByRole('link', { name: /Nachrichten|Inbox|Chat/i }).first()
      if (await nachrichtenLink.isVisible().catch(() => false)) {
        await nachrichtenLink.click()
        await page.waitForLoadState('networkidle').catch(() => {})
        shotLog.push(await shot(page, 'kunde', '020-kunde-nachrichten', 'Nachrichten-Bereich'))
        finding('OK', 'KUNDE-03', 'kunde', 'Nachrichten-Link erreichbar', 'BESTÄTIGT')
      } else {
        finding('P2', 'KUNDE-03', 'kunde', 'Multi-Channel-Inbox Tab/Link nicht gefunden')
      }
    }

    // Dokumente-Upload-Card prüfen
    await page.goto(`${APP_BASE}/kunde`, { waitUntil: 'networkidle' })
    const dokuCard = page.locator('text=/Dokument|Upload|Datei.*hochladen/i').first()
    const dokuVisible = await dokuCard.isVisible().catch(() => false)
    if (dokuVisible) {
      finding('OK', 'KUNDE-04', 'kunde', 'Dokument-Upload-Card sichtbar', 'BESTÄTIGT')
    } else {
      finding('P2', 'KUNDE-04', 'kunde', 'Dokument-Upload-Card nicht gefunden')
    }
    shotLog.push(await shot(page, 'kunde', '021-kunde-dokumente', 'Dokumente-Bereich'))

    // Termin-Anzeige prüfen
    const terminCard = page.locator('text=/Termin|Besichtigung|Gutachter.*kommt/i').first()
    const terminVisible = await terminCard.isVisible().catch(() => false)
    if (terminVisible) {
      finding('OK', 'KUNDE-05', 'kunde', 'Termin-Card sichtbar im Kunden-Portal', 'BESTÄTIGT')
    } else {
      finding('P2', 'KUNDE-05', 'kunde', 'Termin-Card nicht sichtbar (kein Termin für test-kunde?)')
    }

    // Token-Check nochmals auf Kunden-Fallakte
    const tokenKundeFallakte = await checkTokenRendering(page, 'kunde-fallakte')
    tokenChecks.push(tokenKundeFallakte)
    shotLog.push(await shot(page, 'kunde', '022-kunde-final', 'Kunden-Portal-Final-State'))

  } catch (err) {
    finding('BLOCKER', 'KUNDE-00', 'kunde', `Kunden-Portal Fehler: ${err.message}`)
    console.log(`  🔴 Kunden-Portal Fehler: ${err.message}`)
    shotLog.push(await shot(page, 'kunde', '017-kunde-fehler', 'Fehler-State'))
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCHRITT 5: Abrechnung (Dispatch-Perspektive, kurz)
  // ══════════════════════════════════════════════════════════════════════════
  step('Abrechnung — /admin/abrechnungen (Dispatch-Login)')
  hookConsoleAndNetwork(page, 'abrechnung')

  try {
    // Dispatch ist ggf. noch eingeloggt — versuche direkt
    await page.goto(`${APP_BASE}/admin/abrechnungen`, { waitUntil: 'networkidle' })
    const abrUrl = page.url()
    if (abrUrl.includes('/login')) {
      // Neu einloggen als Dispatch
      await loginAs(page, DISPATCH_EMAIL, DISPATCH_PASS)
      await page.goto(`${APP_BASE}/admin/abrechnungen`, { waitUntil: 'networkidle' })
    }
    const abrUrl2 = page.url()
    console.log(`  Abrechnung URL: ${abrUrl2}`)
    if (abrUrl2.includes('/login')) {
      finding('P1', 'ABR-01', 'abrechnung', 'Dispatch-User hat keinen Zugang zu /admin/abrechnungen')
    } else {
      shotLog.push(await shot(page, 'abrechnung', '023-abrechnung-uebersicht', 'Abrechnung-Übersicht'))
      const abrHeading = await page.locator('h1,h2').first().textContent().catch(() => null)
      console.log(`  Abrechnung Überschrift: "${abrHeading?.slice(0, 60)}"`)
      finding('OK', 'ABR-01', 'abrechnung', 'Abrechnungs-Übersicht erreichbar', 'BESTÄTIGT')

      // Erste Abrechnung öffnen
      const ersteZeile = page.locator('tbody tr, [data-testid="abrechnung-row"], a[href*="abrechnung"]').first()
      if (await ersteZeile.isVisible().catch(() => false)) {
        await ersteZeile.click()
        await page.waitForLoadState('networkidle').catch(() => {})
        shotLog.push(await shot(page, 'abrechnung', '024-abrechnung-detail', 'Abrechnung-Detail'))
        finding('OK', 'ABR-02', 'abrechnung', 'Abrechnung-Detail erreichbar', 'BESTÄTIGT')
      } else {
        finding('P2', 'ABR-02', 'abrechnung', 'Keine Abrechnung-Zeile zum Anklicken gefunden')
      }
    }
  } catch (err) {
    finding('P1', 'ABR-00', 'abrechnung', `Abrechnung-Check fehlgeschlagen: ${err.message}`)
  }

  await browser.close()

  // ══════════════════════════════════════════════════════════════════════════
  // ERGEBNIS — JSON für MD-Generierung
  // ══════════════════════════════════════════════════════════════════════════
  const result = {
    startTs,
    endTs: new Date().toISOString(),
    deployBuildDate: '2026-05-13 (Server: nginx/1.24.0, Next.js via VPS)',
    tokenChecks,
    findings,
    consoleErrors,
    networkErrors: networkErrors.filter(e => e.status >= 400 && !e.url.includes('_next/image')).slice(0, 30),
    shotLog,
  }

  const resultPath = path.join(SHOTS_DIR, 'smoke-cj-result.json')
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8')

  console.log('\n=== Zusammenfassung ===')
  console.log(`Screenshots: ${shotCounter}`)
  console.log(`Findings: ${findings.length} (${findings.filter(f => f.severity === 'BLOCKER').length} Blocker, ${findings.filter(f => f.severity === 'P1').length} P1, ${findings.filter(f => f.severity === 'P2').length} P2)`)
  console.log(`Console-Errors: ${consoleErrors.length}`)
  console.log(`Network-Errors (4xx/5xx): ${networkErrors.filter(e => e.status >= 400).length}`)
  console.log(`Ergebnis gespeichert: ${resultPath}`)

  // Alle Findings ausgeben
  console.log('\n─── Alle Findings ───')
  for (const f of findings) {
    const icon = f.severity === 'BLOCKER' ? '🔴' : f.severity === 'P1' ? '🟠' : f.severity === 'P2' ? '🟡' : '🟢'
    console.log(`${icon} ${f.severity} [${f.id}] [${f.portal}] ${f.beschreibung} → ${f.status}`)
  }

  console.log('\n─── Token-Checks ───')
  for (const t of tokenChecks) {
    console.log(`Kontext: ${t.context}`)
    console.log(`  shadow-sheet: ${t.shadowSheet}`)
    console.log(`  rounded-claimondo-sheet: ${t.roundedSheet}`)
    console.log(`  shadow-claimondo-md: ${t.shadowMd}`)
    console.log(`  shadow-focus-ondo: ${t.shadowFocusOndo}`)
    if (t.tokenViolatorsGray?.length > 0) {
      console.log(`  ⚠️  Gray/Slate-Violations: ${t.tokenViolatorsGray.join(' | ')}`)
    }
  }
})()
