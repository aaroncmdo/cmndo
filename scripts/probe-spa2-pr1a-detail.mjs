#!/usr/bin/env node
/**
 * scripts/probe-spa2-pr1a-detail.mjs
 *
 * Einmal-Probe für CMM-44 SP-A2 PR1a: prüft auf den 3 Fall-Detail-Seiten
 * (Admin/SV/Kunde) des Berlin-Falls, ob die Schadenort-Werte (Berlin /
 * Kaiserdamm 88 / 14057 / 13.05.2026) sichtbar sind — inkl. Tab-Durchklick.
 * Macht fullPage-Screenshots zur visuellen Auswertung.
 */
import { chromium } from 'playwright'

const BASE = 'https://app.staging.claimondo.de'
const BU = process.env.STAGING_BASIC_AUTH_USER || 'aaroncmdo'
const BP = process.env.STAGING_BASIC_AUTH_PASS || 'ClaimondoSuperuser123789!!'
const FALL = '65a7640b-62dc-48ca-975f-27c8450477c6'
const OUT = 'docs/17.05.2026/cmm44-spa2-smoke-pr1a'

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'Test1234!')
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2000)
}

const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ZIEL = ['Berlin', 'Kaiserdamm', '14057']
for (const [email, url, tag] of [
  ['test-admin@claimondo.de', `/faelle/${FALL}`, 'admin'],
  ['test-sv@claimondo.de', `/gutachter/fall/${FALL}`, 'sv'],
  ['test-kunde@claimondo.de', `/kunde/faelle/${FALL}`, 'kunde'],
]) {
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 2600 },
    httpCredentials: { username: BU, password: BP },
    locale: 'de-DE', ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await login(page, email)
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 35000 }).catch(() => {})
  await page.waitForTimeout(3500)

  async function scan() {
    // Komplett durchscrollen, damit lazy-Sections / collapsed Inhalte rendern
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(800)
    return page.locator('body').innerText().catch(() => '')
  }

  let body = await scan()
  const direkt = ZIEL.filter((t) => body.includes(t))
  const datum = /13\.05\.2026|13\.5\.2026|2026-05-13/.test(body)
  console.log(`[${tag}] body-len=${body.length} | direkt: ${direkt.join(', ') || 'KEINE'} | datum-13.05: ${datum}`)
  let gefunden = direkt.length > 0
  // Tabs/Akkordeons durchklicken
  for (const label of ['Stammdaten', 'Fahrzeug & Unfall', 'Schaden', 'Schadenhergang', 'Unfall', 'Übersicht', 'Details']) {
    if (gefunden) break
    const tab = page.locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}"), a:has-text("${label}"), summary:has-text("${label}")`).first()
    if ((await tab.count()) > 0) {
      await tab.click().catch(() => {})
      await page.waitForTimeout(1500)
      const b2 = await scan()
      const h2 = ZIEL.filter((x) => b2.includes(x))
      console.log(`  [${tag}] nach Klick "${label}": ${h2.join(', ') || 'keine'}`)
      if (h2.length) { gefunden = true; body = b2 }
    }
  }
  // Schadensort-Heading sichtbar?
  const hatHeading = /Schadensort|Schadenort/.test(body)
  console.log(`  [${tag}] "Schadensort"-Heading im Text: ${hatHeading}`)
  await page.screenshot({ path: `${OUT}/probe-${tag}-full.png`, fullPage: true })
  console.log(`  📸 probe-${tag}-full.png — Schadenort-Werte sichtbar: ${gefunden}`)
  await ctx.close()
}
await b.close()
