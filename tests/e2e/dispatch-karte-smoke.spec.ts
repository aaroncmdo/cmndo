import { test } from '@playwright/test'
import path from 'path'

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', '14.05.2026', 'aar-894-karte-smoke')
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3011'

test.describe('AAR-894 /dispatch/karte', () => {
  test('smoke: laden, Pin-Click, Popup, Detail-Link, Sidebar', async ({ browser }) => {
    test.setTimeout(180_000)

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    // Console + Page-Error sammeln
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text()}`)
    })
    page.on('pageerror', (err) => {
      pageErrors.push(`[pageerror] ${err.message}`)
    })

    // === Step 1: Login ===
    await page.goto(`${BASE}/login`)
    await page.fill('input[name="email"]', 'test-admin@claimondo.de')
    await page.fill('input[name="password"]', 'Test1234!')
    await page.click('button[type="submit"]')
    try {
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
    } catch (err) {
      console.log('Login Wait fehlgeschlagen, current URL:', page.url())
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login-failed.png'), fullPage: true })
      throw err
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-post-login.png'), fullPage: true })
    console.log('Login OK, current URL:', page.url())

    // === Step 2: Zu /dispatch/karte navigieren ===
    await page.goto(`${BASE}/dispatch/karte`)
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.log('networkidle Timeout — fortsetzen')
    })
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-karte-initial.png'), fullPage: true })
    console.log('Karte geladen, current URL:', page.url())

    // === Step 3: Auf Mapbox-Canvas warten ===
    const canvas = page.locator('.mapboxgl-canvas')
    let canvasVisible = false
    try {
      await canvas.first().waitFor({ state: 'visible', timeout: 10_000 })
      canvasVisible = true
    } catch {
      canvasVisible = false
    }
    console.log('Mapbox-Canvas sichtbar?', canvasVisible)

    if (!canvasVisible) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      console.log('Body-Text (erste 2000 Zeichen):', bodyText.slice(0, 2000))
    } else {
      await page.waitForTimeout(4000)
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-karte-mit-pins.png'), fullPage: true })

      // === Step 4: Marker zählen ===
      const markers = page.locator('.mapboxgl-marker')
      const markerCount = await markers.count()
      console.log('Pin-Anzahl:', markerCount)

      // === Step 5: Einen Pin klicken ===
      if (markerCount > 0) {
        await markers.first().click({ force: true })
        await page.waitForTimeout(1500)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-pin-clicked-popup.png'), fullPage: true })

        const popup = page.locator('.mapboxgl-popup-content')
        const popupVisible = await popup.isVisible().catch(() => false)
        console.log('Popup sichtbar?', popupVisible)
        if (popupVisible) {
          const popupText = await popup.innerText()
          console.log('Popup-Inhalt:', popupText)

          const detailLink = popup.locator('a:has-text("Details öffnen"), a:has-text("Details"), a').first()
          const linkVisible = await detailLink.isVisible().catch(() => false)
          console.log('Details-Link sichtbar?', linkVisible)
          if (linkVisible) {
            const href = await detailLink.getAttribute('href')
            console.log('Detail-Link href:', href)
            await detailLink.click()
            await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-detail-page.png'), fullPage: true })
            console.log('Nach Detail-Click URL:', page.url())
          }
        }
      } else {
        console.log('Keine Pins auf der Karte — vielleicht gibt es keine Triage-Backlog-Leads.')
      }
    }

    // === Step 8: Sidebar prüfen ===
    await page.goto(`${BASE}/dispatch/karte`)
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    const sidebar = page.locator('text=/Nicht lokalisierbar|Unlocalized|nicht lokalisiert/i')
    const sidebarVisible = await sidebar.first().isVisible().catch(() => false)
    console.log('Unlocalized-Sidebar sichtbar?', sidebarVisible)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-sidebar.png'), fullPage: true })

    console.log('=== Console-Errors gesammelt (count=' + consoleErrors.length + ') ===')
    consoleErrors.forEach((e) => console.log(e))
    console.log('=== Page-Errors gesammelt (count=' + pageErrors.length + ') ===')
    pageErrors.forEach((e) => console.log(e))
    console.log('=== Smoke fertig ===')

    await context.close()
  })
})
