// Visual-Smoke für PR #1239 — Logo-Wrapper raus + Sidebar-Glass.
// Login als Test-Aaron, dann /gutachter + /kunde-Sidebar screenshotten.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'docs/14.05.2026/sidebar-glass-smoke')
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:3013'
const SV_EMAIL = 'aaron.sprafke@claimondo.de'
const SV_PASS = 'Test1234!'

const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
})

async function shoot(name) {
  await page.waitForTimeout(600)
  const path = resolve(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log(`[SHOT] ${name}.png`)
}

console.log('1) /login öffnen')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }).catch(() => {})
await shoot('01-login')

console.log('2) einloggen')
await page.fill('input[name="email"]', SV_EMAIL).catch(() => {})
await page.fill('input[name="password"]', SV_PASS).catch(() => {})
await page.click('button[type="submit"]').catch(() => {})
await page
  .waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 })
  .catch(() => {})
await page.waitForLoadState('networkidle').catch(() => {})
await shoot('02-after-login')
console.log(`   Post-Login URL: ${page.url()}`)

console.log('3) /gutachter — SV-Sidebar')
await page.goto(`${BASE}/gutachter`, { waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(1500)
await shoot('03-sv-sidebar-full')

// Sidebar isoliert croppen — sie ist 256px breit, beginnt links
const sidebar = await page.locator('aside[aria-label="Gutachter-Navigation"]').first()
const visible = await sidebar.isVisible().catch(() => false)
if (visible) {
  const box = await sidebar.boundingBox()
  if (box) {
    await page.screenshot({
      path: resolve(OUT, '04-sv-sidebar-cropped.png'),
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) },
    })
    console.log('[SHOT] 04-sv-sidebar-cropped.png')
  }
}

console.log('4) /gutachter/profil/branding — Editor-Stand')
await page
  .goto(`${BASE}/gutachter/profil/branding`, { waitUntil: 'networkidle' })
  .catch(() => {})
await page.waitForTimeout(1500)
await shoot('05-branding-editor')

console.log('\n=== Errors ===')
if (errors.length) {
  errors.slice(0, 20).forEach((e) => console.log(e))
} else {
  console.log('keine')
}

console.log('\nBrowser bleibt 5s offen.')
await page.waitForTimeout(5000)
await browser.close()
