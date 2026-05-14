#!/usr/bin/env node
// Live-Walkthrough: Headed Chromium, slowMo, klickt durch Tabs/Nav-Items.
// Aaron schaut live mit. Pro Step: Screenshot + Class-Sentinel-Check.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'walkthrough-screenshots')
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'test-admin@claimondo.de'
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!'
const SV_EMAIL = process.env.TEST_SV_EMAIL ?? 'test-sv@claimondo.de'
const SV_PASS = process.env.TEST_SV_PASSWORD ?? 'Test1234!'

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const FORBIDDEN = [/\bviolet-\d/, /\bpurple-\d/, /\brose-\d/, /\bindigo-\d/]

async function checkPage(page, label) {
  const html = await page.content()
  const hits = []
  for (const re of FORBIDDEN) {
    const matches = [...html.matchAll(new RegExp(`class="[^"]*${re.source}[^"]*"`, 'g'))]
    for (const m of matches) hits.push(m[0].slice(0, 100))
  }
  const path = join(OUT, `${label}.png`)
  await page.screenshot({ path, fullPage: false })
  const err = /Application Error|Internal Server Error|500 - Server-side Exception/i.test(html)
  console.log(`${hits.length === 0 && !err ? '✓' : '✗'} ${label.padEnd(40)} forbidden=${hits.length}${err ? ' APP-ERR' : ''}`)
  if (hits.length) for (const h of hits.slice(0, 3)) console.log(`    └─ ${h}`)
  return { label, hits, err }
}

async function clickIfExists(page, selector, label) {
  const el = page.locator(selector).first()
  if ((await el.count()) === 0) {
    console.log(`  (skip — ${label}: not found)`)
    return false
  }
  try {
    await el.click({ timeout: 5_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    return true
  } catch (err) {
    console.log(`  (click failed — ${label}: ${String(err).slice(0, 80)})`)
    return false
  }
}

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

const browser = await chromium.launch({ headless: false, slowMo: 350 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const results = []

// === PUBLIC ===
console.log('\n=== PUBLIC ===')
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
results.push(await checkPage(page, '01-home'))

await page.goto(BASE + '/gutachter-partner', { waitUntil: 'networkidle' })
results.push(await checkPage(page, '02-gutachter-partner'))

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
results.push(await checkPage(page, '03-login-email-tab'))
// Tab Telefon
await clickIfExists(page, 'button:has-text("Telefon")', 'Telefon-Tab')
results.push(await checkPage(page, '04-login-telefon-tab'))
await clickIfExists(page, 'button:has-text("Google")', 'Google-Tab')
results.push(await checkPage(page, '05-login-google-tab'))
await clickIfExists(page, 'button:has-text("E-Mail")', 'E-Mail-Tab')

// === ADMIN ===
console.log('\n=== ADMIN ===')
await login(page, ADMIN_EMAIL, ADMIN_PASS)
results.push(await checkPage(page, '10-admin-dashboard'))

const ADMIN_NAV = [
  ['/admin/dispatch', '11-admin-dispatch'],
  ['/admin/faelle', '12-admin-faelle'],
  ['/admin/sachverstaendige', '13-admin-sv'],
  ['/admin/kalender', '14-admin-kalender'],
  ['/admin/tasks', '15-admin-tasks'],
  ['/admin/finance', '16-admin-finance'],
  ['/admin/abrechnungen', '17-admin-abrechnungen'],
  ['/admin/team', '18-admin-team'],
  ['/admin/statistiken', '19-admin-statistiken'],
]
for (const [path, label] of ADMIN_NAV) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  results.push(await checkPage(page, label))
}

// Admin/Finance Tabs durchklicken
await page.goto(BASE + '/admin/finance', { waitUntil: 'networkidle' })
for (const tabText of ['Abrechnungen', 'Kanzlei-Abr.', 'Provisionen', 'Übersicht']) {
  await clickIfExists(page, `a:has-text("${tabText}"), button:has-text("${tabText}")`, `Tab ${tabText}`)
  results.push(await checkPage(page, `20-finance-${tabText.replace(/[^a-z0-9]/gi, '').toLowerCase()}`))
}

// === SV ===
console.log('\n=== SV ===')
await ctx.clearCookies()
await login(page, SV_EMAIL, SV_PASS)
results.push(await checkPage(page, '30-gutachter-home'))

const SV_NAV = [
  ['/gutachter/heute', '31-sv-heute'],
  ['/gutachter/faelle', '32-sv-faelle'],
  ['/gutachter/gebiet', '33-sv-gebiet'],
  ['/gutachter/kalender', '34-sv-kalender'],
  ['/gutachter/abrechnung', '35-sv-abrechnung'],
  ['/gutachter/statistiken', '36-sv-statistiken'],
  ['/gutachter/nachrichten', '37-sv-nachrichten'],
]
for (const [path, label] of SV_NAV) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  results.push(await checkPage(page, label))
}

await browser.close()

const fail = results.filter((r) => r.hits.length > 0 || r.err).length
const pass = results.length - fail
writeFileSync(join(OUT, '..', 'walkthrough-result.json'), JSON.stringify({ pass, fail, results }, null, 2))
console.log(`\n${pass} pass, ${fail} fail. Screenshots: ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
