#!/usr/bin/env node
/**
 * AAR-912 Smoke v3b — CTA-Klicks, navigieren mit Back-Button statt goto.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3010'
const SHOTS = path.resolve('docs/14.05.2026/aar-912-karte-v2-smoke/screens-v3-ctas')
await mkdir(SHOTS, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
  console.log(`  📸 ${name}.png`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickPin(page, lng, lat) {
  const pos = await page.evaluate(
    async ({ lng, lat }) => {
      const map = window.__karteMap
      if (!map) return null
      map.flyTo({ center: [lng, lat], zoom: 14, duration: 0 })
      await new Promise((r) => setTimeout(r, 1200))
      const p = map.project([lng, lat])
      const c = map.getCanvas().getBoundingClientRect()
      return { x: c.x + p.x, y: c.y + p.y }
    },
    { lng, lat },
  )
  if (!pos) throw new Error('window.__karteMap nicht verfügbar')
  await page.mouse.click(pos.x, pos.y)
  await wait(800)
}

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  try {
    // Login
    for (let i = 1; i <= 5; i++) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[type=email]', 'test-dispatch@claimondo.de')
      await page.fill('input[type=password]', 'Test1234!')
      await page.click('button[type=submit]')
      try {
        await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 })
        break
      } catch {
        console.log(`Login Attempt ${i}`)
      }
    }
    await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
    await page.locator('button[aria-pressed]').first().waitFor({ timeout: 30000 })
    await wait(5000)

    const snapshot = await page.evaluate(() => window.__karteSnapshot)
    console.log(`snapshot: leads=${snapshot.leads.length} svs=${snapshot.svs.length} termine=${snapshot.termine.length}`)

    if (snapshot.svs.length === 0) {
      console.log('  Keine SVs — abort')
      return
    }

    // ─── CTA 2: SV-Popup → Details ───
    console.log('\n▶ SV-Popup → "Details"')
    const sv = snapshot.svs[0]
    await clickPin(page, sv.lng, sv.lat)
    await shot(page, '03b-sv-popup-open')
    const details = page.locator('a:text-is("Details")').first()
    if (await details.count() > 0) {
      const href = await details.getAttribute('href')
      console.log(`  href=${href}`)
      await details.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
      await wait(3000)
      console.log(`  URL: ${page.url()}`)
      await shot(page, '04b-sv-detail-route')
    } else {
      console.log('  Details-Link nicht im DOM')
    }

    // Back zu Karte (ohne reload — Browser-Back behält Mapbox-State)
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await wait(3000)

    // Falls Map nicht mehr geladen, neu init
    const hasCanvas = await page.locator('canvas.mapboxgl-canvas').count()
    if (hasCanvas === 0) {
      console.log('  Map weg nach Back, reload Karte')
      await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
      await wait(5000)
    }

    // ─── CTA 3: SV-Popup → "Termin einplanen" ───
    console.log('\n▶ SV-Popup → "Termin einplanen"')
    await clickPin(page, sv.lng, sv.lat)
    await wait(500)
    const termCta = page.locator('a:has-text("Termin einplanen")').first()
    if (await termCta.count() > 0) {
      const href = await termCta.getAttribute('href')
      console.log(`  href=${href}`)
      await termCta.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
      await wait(3000)
      console.log(`  URL: ${page.url()}`)
      await shot(page, '05b-sv-termin-route')
    } else {
      console.log('  Termin-einplanen-Link nicht im DOM')
      await shot(page, '05b-sv-termin-not-found')
    }
  } catch (err) {
    console.error('FEHLER:', err.message)
    await shot(page, 'fatal-error').catch(() => {})
  } finally {
    await wait(1500)
    await browser.close()
  }
})()
