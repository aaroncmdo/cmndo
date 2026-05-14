#!/usr/bin/env node
/**
 * AAR-912 Smoke v2 — gezielte Pin-Klicks via window.__karteMap + __karteSnapshot.
 * Verifiziert LeadPopup / SVPopup / TerminPopup / Cluster-Click-to-Zoom.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:3010'
const SHOTS = path.resolve('docs/14.05.2026/aar-912-karte-v2-smoke/screens-v2')
await mkdir(SHOTS, { recursive: true })

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
  console.log(`  ✓ ${name}.png`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const consoleLines = []
  page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => consoleLines.push(`[pageerror] ${err.message}`))

  try {
    console.log('1) Login (max 5 attempts)')
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
        console.log(`   Login Attempt ${i} fail, retry`)
        await wait(2000)
      }
    }
    if (!loggedIn) throw new Error('Login failed 5x')

    console.log('2) /dispatch/karte + Snapshot lesen')
    await page.goto(`${BASE}/dispatch/karte`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.locator('canvas.mapboxgl-canvas').waitFor({ timeout: 60000 })
    await page.locator('button[aria-pressed]').first().waitFor({ timeout: 30000 })
    await wait(5000)

    const snapshot = await page.evaluate(() => window.__karteSnapshot)
    if (!snapshot) {
      console.log('   ⚠ window.__karteSnapshot nicht gefunden — dev-only-Exposure greift nicht')
      await shot(page, '00-no-snapshot')
      throw new Error('Snapshot fehlt')
    }
    console.log(`   Snapshot: leads=${snapshot.leads.length} svs=${snapshot.svs.length} termine=${snapshot.termine.length} unloc=${snapshot.unlocalized.length}`)

    await shot(page, '01-karte-initial')

    // Helper: zoom map to pin und project zu pixel position
    const flyAndProject = async ([lng, lat]) => {
      return page.evaluate(
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
    }

    // ─── Test Lead-Popup ───
    if (snapshot.leads.length > 0) {
      console.log('3) Lead-Pin klicken')
      const lead = snapshot.leads[0]
      const pos = await flyAndProject([lead.lng, lead.lat])
      console.log(`   leadPin (${lead.lng},${lead.lat}) → screen(${pos.x},${pos.y})`)
      await shot(page, '02-zoomed-on-lead')
      await page.mouse.click(pos.x, pos.y)
      await wait(800)
      await shot(page, '03-lead-popup')
    } else {
      console.log('3) Keine Leads vorhanden — skip')
    }

    // ─── Test SV-Popup ───
    if (snapshot.svs.length > 0) {
      console.log('4) SV-Pin klicken')
      const sv = snapshot.svs[0]
      const pos = await flyAndProject([sv.lng, sv.lat])
      console.log(`   svPin (${sv.lng},${sv.lat}) firma=${sv.firmenname} ort=${sv.ort} → screen(${pos.x},${pos.y})`)
      await shot(page, '04-zoomed-on-sv')
      await page.mouse.click(pos.x, pos.y)
      await wait(800)
      await shot(page, '05-sv-popup')
    } else {
      console.log('4) Keine SVs vorhanden — skip')
    }

    // ─── Test Termin-Popup + Status-Color ───
    if (snapshot.termine.length > 0) {
      console.log('5) Termin-Pin klicken')
      const t = snapshot.termine[0]
      const pos = await flyAndProject([t.lng, t.lat])
      console.log(`   terminPin (${t.lng},${t.lat}) status=${t.status} kunde=${t.kunde_name} → screen(${pos.x},${pos.y})`)
      await shot(page, '06-zoomed-on-termin')
      await page.mouse.click(pos.x, pos.y)
      await wait(800)
      await shot(page, '07-termin-popup')
    } else {
      console.log('5) Keine Termine vorhanden — skip')
    }

    // ─── Test Cluster-Click ───
    console.log('6) Zoom out + Cluster-Click-Test')
    await page.evaluate(() => {
      window.__karteMap?.flyTo({ center: [10.45, 51.16], zoom: 6, duration: 0 })
    })
    await wait(1500)
    await shot(page, '08-zoomed-out-clusters')

    // Klick ein bisschen daneben um Cluster-Center zu treffen wäre unzuverlässig.
    // Stattdessen: über Test, ob ein Cluster da ist, dessen Center holen und klicken.
    const cluster = await page.evaluate(() => {
      const map = window.__karteMap
      if (!map) return null
      // Iterate über alle 3 source-IDs und probiere Cluster-Features im Viewport.
      const srcIds = ['src-leads', 'src-svs', 'src-termine']
      for (const id of srcIds) {
        const feats = map.querySourceFeatures(id, { filter: ['has', 'point_count'] })
        if (feats.length > 0) {
          const f = feats[0]
          const coords = f.geometry.coordinates
          const c = map.getCanvas().getBoundingClientRect()
          const p = map.project(coords)
          return { src: id, coords, x: c.x + p.x, y: c.y + p.y, point_count: f.properties.point_count }
        }
      }
      return null
    })
    if (cluster) {
      console.log(`   Cluster gefunden: source=${cluster.src} count=${cluster.point_count}, klicke (${cluster.x},${cluster.y})`)
      await page.mouse.click(cluster.x, cluster.y)
      await wait(1500)
      await shot(page, '09-after-cluster-click')
    } else {
      console.log('   ⚠ Kein Cluster im Viewport — Cluster-Klick übersprungen')
      await shot(page, '09-no-cluster')
    }

    console.log('\nBrowser-Console (gefiltert):')
    for (const l of consoleLines) if (!l.includes('[Fast Refresh]') && !l.includes('HMR')) console.log('  ', l)
  } catch (err) {
    console.error('FEHLER:', err.message)
    await shot(page, 'fatal-error').catch(() => {})
    process.exitCode = 1
  } finally {
    await wait(2000)
    await browser.close()
  }
})()
