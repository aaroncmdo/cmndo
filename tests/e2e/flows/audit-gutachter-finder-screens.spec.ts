import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SCREENS_DIR = path.resolve(process.cwd(), 'docs/14.05.2026/gutachter-finder-audit/screens-anonymisiert')

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

test('Karte Ist-Zustand: Diagnose + Screenshots', async ({ page }) => {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 50.9375, longitude: 6.9603 })

  page.on('console', (m) => {
    console.log(`[browser ${m.type()}]`, m.text())
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://localhost:3001/gutachter-finden', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })

  await page.waitForTimeout(8000)

  // Diagnose: zähle klickbare Marker (.sv-marker-inner) vs Dead-Pins (.sv-deadpin)
  const diag = await page.evaluate(() => {
    const markers = document.querySelectorAll('.mapboxgl-marker').length
    const clickable = document.querySelectorAll('.sv-marker-inner').length
    const deadPins = document.querySelectorAll('.sv-deadpin').length
    const popups = document.querySelectorAll('.mapboxgl-popup').length
    // Privacy-Spot-Check: spezifische SV-Firma-Phrasen, die niemals leaken
    // dürfen (Claimondos eigene "GmbH"/"Köln"-Mentions ausgeklammert).
    const html = document.body.innerHTML
    const hasIngenieurbuero = /Ingenieurb[üu]ro\s+[A-ZÄÖÜ]/.test(html)
    const hasSvBuero = /Sachverst[äa]ndigenb[üu]ro\s+[A-ZÄÖÜ]/.test(html)
    const hasVesser = /Vesser|Cakmak|Gall(?!erien|erie)/.test(html)
    const pillCount = (document.body.textContent || '').match(/(\d+)\s+Sachverst/)?.[1] ?? '?'
    return { markers, clickable, deadPins, popups, hasIngenieurbuero, hasSvBuero, hasVesser, pillCount }
  })
  console.log('[diag]', JSON.stringify(diag, null, 2))

  // Schreibe HTML-Dump
  const html = await page.content()
  fs.writeFileSync(path.join(SCREENS_DIR, '..', 'dom-dump.html'), html)

  // Vollbild
  await page.screenshot({ path: path.join(SCREENS_DIR, '01-desktop-vollbild.png') })

  // Falls Marker doch da sind über sv-marker-inner — Position der ELTERN-DIV (Mapbox-Marker)
  const customMarkerCoords = await page.evaluate(() => {
    const inners = Array.from(document.querySelectorAll('.sv-marker-inner'))
    return inners.map((el, i) => {
      const parent = (el.parentElement?.parentElement || el.parentElement) as HTMLElement | null
      const rect = (parent || el).getBoundingClientRect()
      const isPro = !!el.querySelector('div[style*="F3C053"]')
      return {
        i,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        isPro,
      }
    })
  })
  console.log(`[diag] Custom-Marker (sv-marker-inner): ${customMarkerCoords.length} — pro=${customMarkerCoords.filter(m => m.isPro).length}`)

  // Klick die ersten Pro-Marker + ein Lead-Marker direkt via DOM-Locator
  // (Mouse-Coord-Klick trifft den Canvas drumherum, nicht das innere DIV)
  const innerLocators = page.locator('.sv-marker-inner')
  const totalMarkers = await innerLocators.count()
  console.log(`[diag] sv-marker-inner Locator-Count: ${totalMarkers}`)

  let proShot = false
  let leadShot = false
  for (let i = 0; i < totalMarkers && (!proShot || !leadShot); i++) {
    const el = innerLocators.nth(i)
    const isInView = await el.evaluate((node) => {
      const r = (node as HTMLElement).getBoundingClientRect()
      return r.top > 30 && r.top < window.innerHeight - 60 && r.left > 30 && r.left < window.innerWidth - 30
    }).catch(() => false)
    if (!isInView) continue

    const isPro = await el.evaluate((node) => !!(node as HTMLElement).querySelector('div[style*="F3C053"]'))
    if (isPro && proShot) continue
    if (!isPro && leadShot) continue

    try {
      await el.scrollIntoViewIfNeeded()
      await el.click({ force: true, timeout: 4000 })
      await page.waitForTimeout(900)
      const popupCount = await page.locator('.mapboxgl-popup').count()
      if (popupCount > 0) {
        const tag = isPro ? 'pro' : 'lead'
        await page.screenshot({
          path: path.join(SCREENS_DIR, `02-popup-${tag}.png`),
          clip: undefined,
        })
        if (isPro) proShot = true
        else leadShot = true
        await page.locator('.mapboxgl-popup-close-button').first().click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(400)
      } else {
        console.log(`[diag] Marker ${i} (pro=${isPro}) klick → kein Popup`)
      }
    } catch (err) {
      console.log(`[diag] Marker ${i} klick fail:`, (err as Error).message.slice(0, 80))
    }
  }
  console.log(`[diag] popups captured: pro=${proShot} lead=${leadShot}`)

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(SCREENS_DIR, '03-mobile-vollbild.png') })

  await page.locator('button:has-text("Anfrage starten")').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(SCREENS_DIR, '04-mobile-sheet-open.png') })

  // Acceptance: Marker rendern, keine SV-Firma-Phrase leaket auf den Client
  expect(diag.markers).toBeGreaterThan(0)
  expect(diag.hasIngenieurbuero).toBe(false)
  expect(diag.hasSvBuero).toBe(false)
  expect(diag.hasVesser).toBe(false)
})
