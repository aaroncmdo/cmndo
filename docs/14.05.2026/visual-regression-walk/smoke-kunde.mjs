#!/usr/bin/env node
// Kunde-Portal Visual-Walkthrough — separate Datei weil /kunde/* eigene Auth braucht
// und nicht im default smoke-walkthrough enthalten ist.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const OUT = join(__dirname, 'kunde-screenshots')
const KUNDE_EMAIL = process.env.TEST_KUNDE_EMAIL ?? 'test-kunde@claimondo.de'
const KUNDE_PASS = process.env.TEST_KUNDE_PASSWORD ?? 'Test1234!'

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const KUNDE_ROUTES = [
  { path: '/kunde', label: '01-kunde-home' },
  { path: '/kunde/faelle', label: '02-kunde-faelle' },
  { path: '/kunde/termine', label: '03-kunde-termine' },
  { path: '/kunde/dokumente', label: '04-kunde-dokumente' },
  { path: '/kunde/nachrichten', label: '05-kunde-nachrichten' },
  { path: '/kunde/profil', label: '06-kunde-profil' },
]

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

const browser = await chromium.launch({ headless: false, slowMo: 300 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const results = []

try {
  await login(page, KUNDE_EMAIL, KUNDE_PASS)
  console.log(`[kunde] logged in as ${KUNDE_EMAIL}`)

  for (const { path, label } of KUNDE_ROUTES) {
    try {
      const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 })
      const status = resp?.status() ?? 0
      await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: false })
      console.log(`✓ ${label.padEnd(28)} ${status}`)
      results.push({ label, path, status })
    } catch (err) {
      console.log(`✗ ${label.padEnd(28)} CRASH ${String(err).slice(0, 100)}`)
      results.push({ label, path, status: 'CRASH', error: String(err).slice(0, 200) })
    }
  }
} catch (err) {
  console.error(`[kunde] login or walkthrough failed: ${err}`)
}

await browser.close()

writeFileSync(join(OUT, '..', 'kunde-result.json'), JSON.stringify(results, null, 2))
console.log(`Done. Screenshots: ${OUT}`)
