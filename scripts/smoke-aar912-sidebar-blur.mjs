#!/usr/bin/env node
/**
 * Schneller Smoke: zeigt die UnlocalizedSidebar mit Glaseffekt auf der Karte.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3010'
const SHOTS = path.resolve('docs/14.05.2026/aar-912-karte-v2-smoke/screens-v3-sidebar-blur')
await mkdir(SHOTS, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    let loggedIn = false
    for (let i = 1; i <= 5; i++) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[type=email]', 'test-dispatch@claimondo.de')
      await page.fill('input[type=password]', 'Test1234!')
      await page.click('button[type=submit]')
      try {
        await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 })
        loggedIn = true
        break
      } catch {
        console.log(`Login Attempt ${i} fail`)
      }
    }
    if (!loggedIn) throw new Error('Login failed')

    await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
    await wait(5000)
    await page.screenshot({ path: path.join(SHOTS, '01-sidebar-blur-initial.png'), fullPage: false })

    // Map näher zur Sidebar zoomen damit man Karte unter Sidebar sieht
    await page.evaluate(() => {
      window.__karteMap?.flyTo({ center: [10.5, 51.16], zoom: 7, duration: 0 })
    })
    await wait(1500)
    await page.screenshot({ path: path.join(SHOTS, '02-sidebar-blur-zoomed.png'), fullPage: false })

    // Zoom auf einen detail-Bereich um Stadtnamen unter Sidebar zu sehen
    await page.evaluate(() => {
      window.__karteMap?.flyTo({ center: [8.5, 51.5], zoom: 9, duration: 0 })
    })
    await wait(1500)
    await page.screenshot({ path: path.join(SHOTS, '03-sidebar-blur-stadt.png'), fullPage: false })

    console.log('Screenshots in', SHOTS)
  } catch (err) {
    console.error('FEHLER:', err.message)
    process.exitCode = 1
  } finally {
    await wait(1000)
    await browser.close()
  }
})()
