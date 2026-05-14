#!/usr/bin/env node
// Tiefen-Smoke INNERHALB einer Fall-Akte.
// Admin → /admin/faelle → erstes Fall öffnen → alle Tabs durchklicken.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'claim-screenshots')
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

async function login() {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', 'test-admin@claimondo.de')
  await page.fill('input[name="password"]', 'Test1234!')
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

async function shot(label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true })
  const html = await page.content()
  const err = /Application Error|Internal Server Error|Etwas ist schiefgelaufen/i.test(html)
  const violet = (html.match(/class="[^"]*\bviolet-\d/g) ?? []).length
  const rose = (html.match(/class="[^"]*\brose-\d/g) ?? []).length
  const purple = (html.match(/class="[^"]*\bpurple-\d/g) ?? []).length
  console.log(`${err ? '✗' : '✓'} ${label.padEnd(40)} v=${violet} r=${rose} p=${purple}${err ? ' APP-ERR' : ''}`)
  return { label, hasError: err, violet, rose, purple }
}

const results = []

await login()
console.log('[admin] logged in')

// 1. Admin/faelle Liste
await page.goto(BASE + '/admin/faelle', { waitUntil: 'networkidle' })
results.push(await shot('01-admin-faelle-liste'))

// 2. Erste Fall-Card klicken
const firstFallLink = page.locator('a[href^="/faelle/"]').first()
const fallHref = await firstFallLink.getAttribute('href').catch(() => null)
console.log('First fall href:', fallHref)

if (fallHref) {
  // Direkt navigieren statt Click (Click triggert Hover-Tooltip im Kanban)
  await page.goto(BASE + fallHref, { waitUntil: 'networkidle', timeout: 30_000 })
  results.push(await shot('02-fallakte-default'))

  // 3. Tabs durchklicken — typische Fallakte-Tabs
  const TABS = [
    'Stammdaten', 'Übersicht', 'Prozess', 'Dokumente', 'Kommunikation',
    'Termine', 'Abrechnung', 'Aktivität', 'Kanzlei', 'VS-Reaktion',
  ]
  let idx = 3
  for (const tabLabel of TABS) {
    const tab = page.locator(`button:has-text("${tabLabel}"), a:has-text("${tabLabel}"), [role="tab"]:has-text("${tabLabel}")`).first()
    const count = await tab.count()
    if (count === 0) {
      console.log(`  (skip — tab "${tabLabel}" not found)`)
      continue
    }
    try {
      await tab.click({ timeout: 5_000 })
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
      results.push(await shot(`${String(idx).padStart(2, '0')}-tab-${tabLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`))
      idx++
    } catch (err) {
      console.log(`  (click failed — ${tabLabel}: ${String(err).slice(0, 60)})`)
    }
  }
}

await browser.close()

writeFileSync(join(OUT, '..', 'claim-result.json'), JSON.stringify(results, null, 2))
const errors = results.filter((r) => r.hasError).length
console.log(`\n${results.length - errors}/${results.length} ok. ${errors} errors.`)
console.log(`Screenshots: ${OUT}`)
