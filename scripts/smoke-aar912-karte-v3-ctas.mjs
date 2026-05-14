#!/usr/bin/env node
/**
 * AAR-912 Smoke v3 — CTA-Klicks aus jedem Popup, Folge-Route verifizieren.
 *
 * Pro Popup:
 *  - Pin via window.__karteMap.project klicken
 *  - Popup-Button klicken
 *  - URL + Screenshot der Folge-Route festhalten
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

async function loginAndGoToKarte(page) {
  for (let i = 1; i <= 5; i++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', 'test-dispatch@claimondo.de')
    await page.fill('input[type=password]', 'Test1234!')
    await page.click('button[type=submit]')
    try {
      await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 })
      break
    } catch {
      console.log(`   Login Attempt ${i} fail`)
    }
  }
  await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
  await page.locator('button[aria-pressed]').first().waitFor({ timeout: 30000 })
  await wait(5000)
}

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
    console.log('▶ Login + Karte')
    await loginAndGoToKarte(page)

    const snapshot = await page.evaluate(() => window.__karteSnapshot)
    console.log(`  snapshot: leads=${snapshot.leads.length} svs=${snapshot.svs.length} termine=${snapshot.termine.length}`)

    // ─── CTA 1: LeadPopup → "Details öffnen" ───
    if (snapshot.leads.length > 0) {
      console.log('\n▶ CTA 1: LeadPopup → Details öffnen')
      const lead = snapshot.leads[0]
      await clickPin(page, lead.lng, lead.lat)
      await shot(page, '01-lead-popup-open')

      const cta = page.locator('a:has-text("Details öffnen")').first()
      if (await cta.count() > 0) {
        const href = await cta.getAttribute('href')
        console.log(`  CTA href=${href}`)
        await cta.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
        await wait(3000)
        console.log(`  URL nach Click: ${page.url()}`)
        await shot(page, '02-lead-detail-route')
      } else {
        console.log('  ⚠ "Details öffnen"-Link nicht im DOM gefunden')
        await shot(page, '02-lead-detail-not-found')
      }
    }

    // ─── CTA 2: SVPopup → "Details" ───
    if (snapshot.svs.length > 0) {
      console.log('\n▶ CTA 2: SVPopup → Details')
      await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
      await wait(4000)
      const sv = snapshot.svs[0]
      await clickPin(page, sv.lng, sv.lat)
      await shot(page, '03-sv-popup-open')

      // Details-Button im SVPopup ist Link mit Text "Details"
      const cta = page.locator('a:text-is("Details")').first()
      if (await cta.count() > 0) {
        const href = await cta.getAttribute('href')
        console.log(`  CTA href=${href}`)
        await cta.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
        await wait(3000)
        console.log(`  URL: ${page.url()}`)
        await shot(page, '04-sv-detail-route')
      } else {
        console.log('  ⚠ "Details"-Link nicht im DOM')
        await shot(page, '04-sv-detail-not-found')
      }
    }

    // ─── CTA 3: SVPopup → "Termin einplanen" ───
    if (snapshot.svs.length > 0) {
      console.log('\n▶ CTA 3: SVPopup → Termin einplanen')
      await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
      await wait(4000)
      const sv = snapshot.svs[0]
      await clickPin(page, sv.lng, sv.lat)
      await wait(500)

      const cta = page.locator('a:has-text("Termin einplanen")').first()
      if (await cta.count() > 0) {
        const href = await cta.getAttribute('href')
        console.log(`  CTA href=${href}`)
        await cta.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
        await wait(3000)
        console.log(`  URL: ${page.url()}`)
        await shot(page, '05-sv-termin-route')
      } else {
        console.log('  ⚠ "Termin einplanen"-Link nicht im DOM')
        await shot(page, '05-sv-termin-not-found')
      }
    }

    // ─── CTA 4: TerminPopup → "Fall öffnen" ───
    if (snapshot.termine.length > 0) {
      console.log('\n▶ CTA 4: TerminPopup → Fall öffnen')
      await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
      await wait(4000)
      const t = snapshot.termine[0]
      await clickPin(page, t.lng, t.lat)
      await shot(page, '06-termin-popup-open')

      const cta = page.locator('a:has-text("Fall öffnen")').first()
      if (await cta.count() > 0) {
        const href = await cta.getAttribute('href')
        console.log(`  CTA href=${href}`)
        await cta.click()
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {})
        await wait(3000)
        console.log(`  URL: ${page.url()}`)
        await shot(page, '07-fall-detail-route')
      } else {
        console.log('  ⚠ "Fall öffnen"-Link nicht im DOM')
        await shot(page, '07-fall-detail-not-found')
      }
    }

    console.log('\n✓ CTA-Smoke v3 fertig')
  } catch (err) {
    console.error('FEHLER:', err.message)
    await shot(page, 'fatal-error').catch(() => {})
    process.exitCode = 1
  } finally {
    await wait(1500)
    await browser.close()
  }
})()
