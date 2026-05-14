import { test, expect } from '@playwright/test'
import path from 'path'

/**
 * Live-Smoke 14.05.2026 — /gutachter-finden auf app.staging.claimondo.de.
 * Verifiziert dass die anonymisierten Popups die Google-Bewertungen zeigen
 * (nach Backfill via scripts/backfill-google-bewertungen.mjs).
 *
 * Output: docs/14.05.2026/google-bewertungen-staging-smoke/screens/*.png
 */

const STAGING_URL = 'https://app.staging.claimondo.de/gutachter-finden'
const BASIC_USER = 'aaroncmdo'
const BASIC_PASS = process.env.STAGING_BASIC_AUTH_PASSWORD ?? 'ClaimondoSuperuser123789!!'

const SCREENS_DIR = path.resolve(
  process.cwd(),
  'docs/14.05.2026/google-bewertungen-staging-smoke/screens',
)

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

test('Staging-Smoke: Popups zeigen Google-Bewertungen', async ({ page, context }) => {
  // Basic-Auth via HTTP-Header (Mapbox-Tiles + Image-Requests laufen über
  // dieselbe Subdomain und müssen mitauthentifiziert werden)
  await context.setExtraHTTPHeaders({
    Authorization: `Basic ${Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64')}`,
  })
  // KEINE Geolocation → Default-NRW-View (alle 5 Standard-Marker im Viewport)
  await context.clearPermissions()

  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser error]', m.text().slice(0, 200))
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  // Map-Tiles + Marker-Render brauchen Zeit
  await page.waitForTimeout(8000)

  // Vollbild-Übersicht
  await page.screenshot({ path: path.join(SCREENS_DIR, '01-desktop-vollbild.png') })

  // Marker-Inventar
  const markerInfo = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.sv-marker-inner'))
    return all.map((el, i) => {
      const initialeBox = el.querySelector('div > div') as HTMLElement | null
      const r = el.getBoundingClientRect()
      return {
        i,
        initiale: initialeBox?.firstChild?.textContent?.trim().slice(0, 2) ?? '?',
        inView: r.top > 0 && r.top < window.innerHeight && r.left > 0 && r.left < window.innerWidth,
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
      }
    })
  })
  console.log('[smoke] klickbare Marker:', JSON.stringify(markerInfo))

  const deadPinCount = await page.locator('.sv-deadpin').count()
  console.log(`[smoke] dead-pin count: ${deadPinCount}`)

  // Klicke jeden sichtbaren klickbaren Marker bis wir einen mit Sternen finden
  let popupMitSternenGefunden = false
  let popupOhneSternenGefunden = false
  let sterneInfo: { initiale: string; text: string } | null = null

  const innerLocators = page.locator('.sv-marker-inner')
  for (let i = 0; i < markerInfo.length; i++) {
    if (!markerInfo[i].inView) continue
    if (popupMitSternenGefunden && popupOhneSternenGefunden) break
    try {
      await innerLocators.nth(i).click({ force: true, timeout: 4000 })
      await page.waitForTimeout(1100)
      const popupInfo = await page.evaluate(() => {
        const popup = document.querySelector('.mapboxgl-popup')
        const text = popup?.textContent ?? ''
        return {
          hasStars: /★/.test(text) && /Bewertung/.test(text),
          text: text.replace(/\s+/g, ' ').trim().slice(0, 200),
        }
      })
      console.log(`[smoke] Marker ${i} (${markerInfo[i].initiale}) → ${popupInfo.text}`)
      if (popupInfo.hasStars && !popupMitSternenGefunden) {
        sterneInfo = { initiale: markerInfo[i].initiale, text: popupInfo.text }
        await page.screenshot({ path: path.join(SCREENS_DIR, '02-popup-mit-sternen.png') })
        popupMitSternenGefunden = true
      } else if (!popupInfo.hasStars && !popupOhneSternenGefunden) {
        await page.screenshot({ path: path.join(SCREENS_DIR, '02-popup-ohne-sterne.png') })
        popupOhneSternenGefunden = true
      }
      await page.locator('.mapboxgl-popup-close-button').first().click({ timeout: 2000 }).catch(() => {})
      await page.waitForTimeout(400)
    } catch (err) {
      console.log(`[smoke] Marker ${i} klick fail:`, (err as Error).message.slice(0, 80))
    }
  }

  // Mobile-Viewport
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(SCREENS_DIR, '03-mobile-vollbild.png') })

  await page.locator('button:has-text("Anfrage starten")').first().click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(SCREENS_DIR, '04-mobile-sheet-open.png') })

  // Acceptance: Marker rendern + mindestens ein Popup mit Sternen sichtbar
  expect(markerInfo.length, 'mindestens 1 klickbarer Marker').toBeGreaterThan(0)
  expect(popupMitSternenGefunden, `Sterne-Popup gefunden (Initiale: ${sterneInfo?.initiale}, Text: ${sterneInfo?.text})`).toBe(true)
})
