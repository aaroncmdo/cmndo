#!/usr/bin/env node
/**
 * scripts/probe-spa2-pr1a-unfall-section.mjs
 *
 * Definitive Probe CMM-44 SP-A2 PR1a: liest im Admin-Übersichtstab des
 * Berlin-Falls gezielt die "Unfall"-SectionCard aus (volltext + Screenshot
 * des Elements), um zu bestätigen dass die claims.schadenort_*-Werte
 * (Berlin / Kaiserdamm 88 / 14057) im UI ankommen.
 */
import { chromium } from 'playwright'

const BASE = 'https://app.staging.claimondo.de'
const BU = process.env.STAGING_BASIC_AUTH_USER || 'aaroncmdo'
const BP = process.env.STAGING_BASIC_AUTH_PASS || 'ClaimondoSuperuser123789!!'
const FALL = '65a7640b-62dc-48ca-975f-27c8450477c6'
const OUT = 'docs/17.05.2026/cmm44-spa2-smoke-pr1a'

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

// Vollständig scrollen
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 90))
  }
})
await page.waitForTimeout(800)

// Die SectionCard mit Titel "Unfall" finden
const unfallCard = page.locator('section, div').filter({ hasText: /^Unfall/ }).first()
const cardCount = await page.locator(':text-is("Unfall")').count()
console.log(`Elemente mit Text "Unfall": ${cardCount}`)

// Heading "Unfall" suchen + umgebenden Container auslesen
const unfallInfo = await page.evaluate(() => {
  // Suche Heading/Element das exakt "Unfall" enthält
  const all = [...document.querySelectorAll('h1,h2,h3,h4,p,span,div')]
  const heading = all.find((el) => el.textContent?.trim() === 'Unfall' && el.children.length === 0)
  if (!heading) return { gefunden: false }
  // Hochlaufen bis Card-Container (max 6 Ebenen)
  let card = heading
  for (let i = 0; i < 6; i++) {
    if (card.parentElement) card = card.parentElement
    if (card.textContent && card.textContent.length > 200) break
  }
  return { gefunden: true, text: card.textContent?.slice(0, 1500) || '' }
})

if (unfallInfo.gefunden) {
  console.log('\n=== Inhalt der "Unfall"-SectionCard ===')
  console.log(unfallInfo.text)
  const t = unfallInfo.text
  const treffer = ['Berlin', 'Kaiserdamm', '14057'].filter((x) => t.includes(x))
  console.log(`\nWerte-Treffer: ${treffer.join(', ') || 'KEINE'}`)
} else {
  console.log('\n"Unfall"-SectionCard NICHT im DOM gefunden (Sektion evtl. nicht in visibleSections).')
}

// Screenshot der Unfall-Card falls vorhanden
try {
  if ((await unfallCard.count()) > 0) {
    await unfallCard.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await unfallCard.screenshot({ path: `${OUT}/probe-admin-unfall-card.png` })
    console.log('📸 probe-admin-unfall-card.png')
  }
} catch (e) {
  console.log(`Card-Screenshot fehlgeschlagen: ${e.message.slice(0, 80)}`)
}
await page.screenshot({ path: `${OUT}/probe-admin-uebersicht-full.png`, fullPage: true })
console.log('📸 probe-admin-uebersicht-full.png')

await ctx.close()
await b.close()
