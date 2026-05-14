import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SCREENS_DIR = path.resolve(process.cwd(), 'docs/14.05.2026/gutachter-finder-audit/screens-anonymisiert')

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

test('Karte Ist-Zustand: Diagnose + Screenshots', async ({ page }) => {
  // KEINE Geolocation → Karte bleibt auf DEFAULT_CENTER NRW-Mittelpunkt + zoom 8.5
  // → alle paket=standard SVs (Köln, Remscheid, Heinsberg) sind im Viewport
  await page.context().clearPermissions()

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

  // Dump aller Marker-Initialen für Debug
  const allInitials = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sv-marker-inner')).map((el, i) => {
      const initialeBox = el.querySelector('div > div') as HTMLElement | null
      const r = el.getBoundingClientRect()
      return {
        i,
        initiale: initialeBox?.firstChild?.textContent?.trim().slice(0, 2) ?? '?',
        inView: r.top > 0 && r.top < window.innerHeight && r.left > 0 && r.left < window.innerWidth,
      }
    })
  })
  console.log('[diag] Alle klickbaren Marker:', JSON.stringify(allInitials))

  // Bevorzuge einen Marker dessen Popup Sterne enthält (echter SV mit Cache)
  let popupMitSternen = false
  let popupOhneSterne = false
  for (let i = 0; i < totalMarkers && (!popupMitSternen || !popupOhneSterne); i++) {
    const el = innerLocators.nth(i)
    const isInView = await el.evaluate((node) => {
      const r = (node as HTMLElement).getBoundingClientRect()
      // Erlaube auch knapp außerhalb — Mapbox-Marker können bei dichter
      // Karte überlappen, scrollIntoViewIfNeeded scrollt sie rein
      return r.top > -50 && r.top < window.innerHeight + 50 && r.left > -50 && r.left < window.innerWidth + 50
    }).catch(() => false)
    if (!isInView) continue

    try {
      await el.scrollIntoViewIfNeeded()
      await el.click({ force: true, timeout: 4000 })
      await page.waitForTimeout(900)
      const popupCount = await page.locator('.mapboxgl-popup').count()
      if (popupCount === 0) continue
      await page.waitForTimeout(1200)
      const popupInfo = await page.evaluate(() => {
        const allPopups = Array.from(document.querySelectorAll('.mapboxgl-popup'))
        const visible = allPopups.find((p) => {
          const r = (p as HTMLElement).getBoundingClientRect()
          return r.width > 50 && r.height > 30
        }) ?? allPopups[0]
        const text = visible?.textContent ?? ''
        const html = visible?.innerHTML ?? ''
        const contentEl = visible?.querySelector('.mapboxgl-popup-content')
        const contentHTML = contentEl?.innerHTML ?? '(none)'
        return {
          count: allPopups.length,
          text: text.slice(0, 200),
          htmlLen: html.length,
          contentLen: contentHTML.length,
          contentSnippet: contentHTML.slice(0, 400),
          hasStars: /★/.test(text) && /Bewertung/.test(text),
        }
      })
      console.log(`[diag] Marker ${i}: popups=${popupInfo.count} contentLen=${popupInfo.contentLen} text.len=${popupInfo.text.length}`)
      console.log(`[diag] Marker ${i}: text="${popupInfo.text.replace(/\s+/g, ' ').trim()}"`)
      const hasStars = popupInfo.hasStars
      if (hasStars && !popupMitSternen) {
        await page.screenshot({ path: path.join(SCREENS_DIR, '02-popup-mit-sternen.png') })
        popupMitSternen = true
      } else if (!hasStars && !popupOhneSterne) {
        await page.screenshot({ path: path.join(SCREENS_DIR, '02-popup-ohne-sterne.png') })
        popupOhneSterne = true
      }
      await page.locator('.mapboxgl-popup-close-button').first().click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(400)
    } catch (err) {
      console.log(`[diag] Marker ${i} klick fail:`, (err as Error).message.slice(0, 80))
    }
  }
  console.log(`[diag] popups captured: mit-sternen=${popupMitSternen} ohne-sterne=${popupOhneSterne}`)

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
