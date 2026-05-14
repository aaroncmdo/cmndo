#!/usr/bin/env node
/**
 * AAR-912 Karte v2 — Lokaler Dev-Smoke.
 * Login als test-dispatch, /dispatch/karte, ChipBar-Toggles, Screenshots.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3010'
const SHOTS = path.resolve('docs/14.05.2026/aar-912-karte-v2-smoke/screens')
await mkdir(SHOTS, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
  console.log(`  ✓ ${name}.png`)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // Forward browser-console für die Audit-Analyse
  const consoleLines = []
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`))

  try {
    console.log('1) Login (max 5 attempts mit dazwischen-Reload)')
    let loggedIn = false
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`   Attempt ${attempt}`)
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[type=email]', 'test-dispatch@claimondo.de')
      await page.fill('input[type=password]', 'Test1234!')
      await page.click('button[type=submit]')
      try {
        await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 60000 })
        loggedIn = true
        break
      } catch {
        console.log(`   -> Attempt ${attempt} Login Header-Timeout, retry`)
        await wait(2000)
      }
    }
    if (!loggedIn) throw new Error('Login schlug 5x fehl — Supabase-Connection?')
    await wait(2000)
    await shot(page, '01-after-login')

    console.log('2) /dispatch/karte (kann 30s+ dauern wegen plz_geo scan)')
    await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    // Erst auf Canvas warten — beweist dass DispatchKarteClient gemountet ist
    await page
      .locator('canvas.mapboxgl-canvas')
      .waitFor({ timeout: 60000 })
      .catch((e) => console.log('   canvas wait failed:', e.message))
    // Dann der ChipBar
    await page
      .locator('button[aria-pressed]')
      .first()
      .waitFor({ timeout: 30000 })
      .catch((e) => console.log('   chipbar wait failed:', e.message))
    await wait(4000)
    await shot(page, '02-karte-initial-all-layers')

    console.log('3) ChipBar identifizieren')
    const chipsCount = await page.locator('button[aria-pressed]').count()
    console.log(`   ChipBar Buttons: ${chipsCount}`)

    console.log('4) Toggle leads off')
    await page
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Leads' })
      .click()
      .catch((e) => console.log('   leads click failed:', e.message))
    await wait(800)
    await shot(page, '03-leads-off')

    console.log('5) Toggle svs off (leads still off)')
    await page
      .locator('button[aria-pressed]')
      .filter({ hasText: 'SVs' })
      .click()
      .catch((e) => console.log('   svs click failed:', e.message))
    await wait(800)
    await shot(page, '04-leads-and-svs-off')

    console.log('6) Toggle termine off (only termine remain)')
    await page
      .locator('button[aria-pressed]')
      .filter({ hasText: 'Termine' })
      .click()
      .catch((e) => console.log('   termine click failed:', e.message))
    await wait(800)
    await shot(page, '05-all-off')

    console.log('7) All back on')
    await page.locator('button[aria-pressed]').filter({ hasText: 'Leads' }).click().catch(() => {})
    await page.locator('button[aria-pressed]').filter({ hasText: 'SVs' }).click().catch(() => {})
    await page.locator('button[aria-pressed]').filter({ hasText: 'Termine' }).click().catch(() => {})
    await wait(1200)
    await shot(page, '06-all-back-on')

    console.log('8) Zoom in for individual pins (5 wheel events)')
    const canvas = page.locator('canvas.mapboxgl-canvas')
    const cbox = await canvas.boundingBox()
    if (cbox) {
      for (let i = 0; i < 6; i++) {
        await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
        await page.mouse.wheel(0, -400)
        await wait(300)
      }
    }
    await wait(1500)
    await shot(page, '07-zoomed-in')

    console.log('9) Click center of map (try to hit a pin/cluster)')
    if (cbox) {
      await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2)
      await wait(1000)
    }
    await shot(page, '08-after-center-click')

    console.log('\\nBrowser-Console Lines:')
    for (const line of consoleLines) console.log('  >', line)
  } catch (err) {
    console.error('FEHLER:', err.message)
    await shot(page, 'error-state').catch(() => {})
    process.exitCode = 1
  } finally {
    await wait(2000)
    await browser.close()
  }
})()
