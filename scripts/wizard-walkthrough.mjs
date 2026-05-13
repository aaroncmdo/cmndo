// Standalone Wizard-Walkthrough — kein Smoke-Framework, nur Playwright.
// Beweist den SV-Tier-Fix: nach Premium-Marker-Klick sollten echte Slots
// (aus arbeitszeiten-Default Mo-Fr 09-17, 45-Min-Slots) erscheinen.
//
// Lauf: node scripts/wizard-walkthrough.mjs
// Output: docs/13.05.2026/wizard-walkthrough/<timestamp>/

import { chromium } from 'playwright'
import { config as loadEnv } from 'dotenv'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

loadEnv({ path: '.env.test' })

const user = process.env.STAGING_BASIC_AUTH_USER
const pass = process.env.STAGING_BASIC_AUTH_PASS
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outDir = path.join('docs/13.05.2026/wizard-walkthrough', ts)
mkdirSync(outDir, { recursive: true })

console.log('▶ Wizard-Walkthrough auf staging')
console.log('  Output:', outDir)

const browser = await chromium.launch({
  headless: false,
  slowMo: 250,
  args: [
    '--start-maximized',
    '--window-position=0,0',
    '--window-size=1600,1000',
    '--disable-popup-blocking',
    '--no-first-run',
    '--no-default-browser-check',
  ],
})

const context = await browser.newContext({
  viewport: null,
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  ...(user && pass ? { httpCredentials: { username: user, password: pass } } : {}),
})

const page = await context.newPage()
page.on('pageerror', (e) => console.log('  ⚠ pageerror:', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  ⚠ console.error:', m.text())
})

async function step(label, fn) {
  console.log(`→ ${label}`)
  try {
    await fn()
    await page.bringToFront().catch(() => {})
    const screenshotPath = path.join(outDir, `${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (err) {
    console.log(`  ❌ ${err.message}`)
    const screenshotPath = path.join(outDir, `FAIL-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
    throw err
  }
}

try {
  // 1) Marketing-Page öffnen
  await step('01-gutachter-finden-open', async () => {
    await page.goto('https://app.staging.claimondo.de/gutachter-finden', { waitUntil: 'domcontentloaded' })
    await page.bringToFront().catch(() => {})
    await page.waitForSelector('.mapboxgl-canvas', { timeout: 30000 })
  })

  // 2) Warte auf Marker
  await step('02-warte-marker', async () => {
    await page.waitForTimeout(4000)
    await page.waitForSelector('.mapboxgl-marker', { timeout: 12000 })
  })

  // 3) Klick erster Marker (force, bypass cluster-overlap)
  await step('03-klick-marker', async () => {
    await page.locator('.mapboxgl-marker').first().click({ force: true, timeout: 6000 })
    await page.waitForSelector('.mapboxgl-popup-content', { timeout: 10000 })
  })

  // 4) Klick Anfrage-Button im Popup
  await step('04-klick-anfrage-button', async () => {
    await page.locator('.mapboxgl-popup-content button[data-testid="sv-anfrage-popup"]').first().click({ timeout: 6000 })
    // Warte bis Wizard renders (besichtigungsort-Input erscheint)
    await page.waitForSelector('input[name="besichtigungsort"], [data-feld="besichtigungsort"] input', { timeout: 8000 })
  })

  // 5) Phase 1: besichtigungsort füllen + Weiter
  await step('05-phase-standort-fuellen', async () => {
    const input = page.locator('input[name="besichtigungsort"], [data-feld="besichtigungsort"] input').first()
    await input.fill('Musterstraße 12, 50667 Köln', { timeout: 5000 })
    await page.waitForTimeout(500)
    await page.locator('[data-testid="wizard-weiter"]').first().click({ timeout: 6000 })
  })

  // 6) Phase 2 termin: warte auf wunschtermin_wann (segmented) + wunschtermin (slot)
  await step('06-phase-termin-erreicht', async () => {
    // Erst wunschtermin_wann (segmented) — z.B. "Diese Woche" klicken
    await page.waitForSelector('[data-feld="wunschtermin_wann"], [name="wunschtermin_wann"]', { timeout: 10000 })
    // Eines der segmented-Buttons klicken
    const segmentedButton = page.locator('[data-feld="wunschtermin_wann"] button').first()
    if (await segmentedButton.count()) {
      await segmentedButton.click({ timeout: 5000 })
      await page.waitForTimeout(800)
    }
  })

  // 7) SLOT-Phase: prüfe ob Tag-Buttons + Slot-Buttons rendern
  await step('07-SLOT-PHASE-screenshot', async () => {
    // Warte auf Tag-Strip
    await page.waitForSelector('[data-feld="wunschtermin"], [data-feld="wunschtermin"] button', { timeout: 12000 })
    await page.waitForTimeout(2000) // Server-Action für slot-load Zeit geben

    // Sammle Diagnostik
    const tageCount = await page.locator('button[data-tag]').count()
    const freieTage = await page.locator('button[data-tag][data-frei="true"]').count()
    const slotCount = await page.locator('button[data-slot]').count()
    const ladeFehler = await page.locator('text=/Slots konnten nicht geladen werden/i').count()

    console.log(`  📊 Tag-Buttons: ${tageCount}, freie: ${freieTage}, Slot-Buttons (auf aktivem Tag): ${slotCount}, Fehler-Banner: ${ladeFehler}`)

    if (ladeFehler > 0) {
      const fehlerText = await page.locator('text=/Slots konnten nicht/i').first().textContent()
      console.log(`  ❌ Lade-Fehler: ${fehlerText}`)
    } else if (freieTage === 0) {
      console.log('  ❌ Keine freien Tage → SV-Match falsch oder arbeitszeiten leer')
    } else {
      console.log(`  ✅ Slots laden! ${freieTage} freie Tage von ${tageCount}`)
    }

    // Click ersten freien Tag damit Slot-Grid sichtbar wird
    const ersterFreierTag = page.locator('button[data-tag][data-frei="true"]').first()
    if (await ersterFreierTag.count()) {
      await ersterFreierTag.click({ timeout: 3000 })
      await page.waitForTimeout(800)
    }
  })

  console.log()
  console.log('✅ Walkthrough fertig — Browser bleibt 60s offen, du kannst inspizieren.')
  await page.waitForTimeout(60000)
} catch (err) {
  console.log()
  console.log('❌ Abbruch:', err.message)
  console.log('Browser bleibt 60s offen für Inspect.')
  await page.waitForTimeout(60000)
} finally {
  await browser.close()
  console.log(`Output: ${outDir}`)
}
