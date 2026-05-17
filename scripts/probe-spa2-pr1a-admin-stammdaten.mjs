#!/usr/bin/env node
/**
 * scripts/probe-spa2-pr1a-admin-stammdaten.mjs
 *
 * Einmal-Probe CMM-44 SP-A2 PR1a: Admin-Fallakte des Berlin-Falls — öffnet
 * den Stammdaten-Bereich (Block "Unfall"/"Schadensort") und prüft, ob die aus
 * claims.schadenort_* gelesenen Werte (Berlin / Kaiserdamm 88 / 14057)
 * sichtbar sind. Admin sieht jeden Fall (kein RLS-Gate) — der definitive Test
 * für den claims-Fallback.
 */
import { chromium } from 'playwright'

const BASE = 'https://app.staging.claimondo.de'
const BU = process.env.STAGING_BASIC_AUTH_USER || 'aaroncmdo'
const BP = process.env.STAGING_BASIC_AUTH_PASS || 'ClaimondoSuperuser123789!!'
const FALL = '65a7640b-62dc-48ca-975f-27c8450477c6'
const OUT = 'docs/17.05.2026/cmm44-spa2-smoke-pr1a'
const ZIEL = ['Berlin', 'Kaiserdamm', '14057']

const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await b.newContext({
  viewport: { width: 1680, height: 1400 },
  httpCredentials: { username: BU, password: BP },
  locale: 'de-DE', ignoreHTTPSErrors: true,
})
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.fill('input[type="email"]', 'test-admin@claimondo.de')
await page.fill('input[type="password"]', 'Test1234!')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {})
await page.waitForTimeout(2000)

await page.goto(`${BASE}/faelle/${FALL}`, { waitUntil: 'networkidle', timeout: 35000 }).catch(() => {})
await page.waitForTimeout(3000)

async function fullScan() {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 100))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(600)
  return page.locator('body').innerText().catch(() => '')
}

// Alle sichtbaren Tabs/Buttons auflisten
const tabTexte = await page.locator('[role="tab"], button').allInnerTexts().catch(() => [])
console.log('Sichtbare Tabs/Buttons (erste 30):')
console.log('  ' + [...new Set(tabTexte)].filter(Boolean).slice(0, 30).join(' | '))

let body = await fullScan()
let treffer = ZIEL.filter((t) => body.includes(t))
console.log(`\nInitial body-len=${body.length} | Treffer: ${treffer.join(', ') || 'KEINE'}`)

// Versuche Tabs zu klicken die mit Stammdaten/Unfall/Schaden/Daten zu tun haben
const klickKandidaten = ['Stammdaten', 'Falldaten', 'Schaden', 'Unfall', 'Daten', 'Details', 'Übersicht']
for (const label of klickKandidaten) {
  if (treffer.length) break
  const loc = page.locator(
    `[role="tab"]:has-text("${label}"), button:has-text("${label}"), a:has-text("${label}")`
  )
  const n = await loc.count()
  for (let i = 0; i < n && treffer.length === 0; i++) {
    await loc.nth(i).click().catch(() => {})
    await page.waitForTimeout(1500)
    body = await fullScan()
    treffer = ZIEL.filter((t) => body.includes(t))
    if (treffer.length) console.log(`  → Klick "${label}" #${i}: Treffer ${treffer.join(', ')}`)
  }
}

// Schadensort-Heading + konkrete Feld-Labels
const hatLabels = {
  'Schadens-Adresse': /Schadens-?Adresse|Schadenadresse/.test(body),
  'PLZ/Ort': /\bPLZ\b/.test(body),
  'Schadensdatum': /Schadensdatum|Schadentag/.test(body),
  'Unfallort-Kategorie': /Unfallort-?Kategorie|Schadenort-?Kategorie/.test(body),
}
console.log('\nFeld-Labels im Text:', JSON.stringify(hatLabels))
const hatUndefined = /\bundefined\b|Invalid Date|\bNaN\b/.test(body)
console.log(`Werte-Treffer (Berlin/Kaiserdamm/14057): ${treffer.join(', ') || 'KEINE'}`)
console.log(`undefined/NaN im Text: ${hatUndefined}`)

await page.screenshot({ path: `${OUT}/probe-admin-stammdaten-full.png`, fullPage: true })
console.log(`\n📸 probe-admin-stammdaten-full.png`)

await ctx.close()
await b.close()
