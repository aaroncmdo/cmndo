// 15.05.2026: Lokales Repro für /makler/abrechnungen 502.
// Loggt sich als test-makler@claimondo.de am localhost:3001 ein und
// öffnet /makler/abrechnungen. Console + pageerror landen in stdout.

import { chromium } from 'playwright'

const BASE = process.env.REPRO_BASE ?? 'http://localhost:3001'
const EMAIL = process.env.TEST_EMAIL ?? 'test-makler@claimondo.de'
const PASSWORD = process.env.TEST_PASSWORD ?? 'Test1234!'

const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    console.log(`[browser/${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', (err) => {
  console.log(`[pageerror] ${err.message}`)
  if (err.stack) console.log(err.stack.split('\n').slice(0, 6).join('\n'))
})
page.on('response', async (resp) => {
  if (resp.status() >= 400) {
    console.log(`[http ${resp.status()}] ${resp.url()}`)
  }
})

console.log(`→ goto ${BASE}/login`)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.fill('input[type="email"], input[name="email"]', EMAIL).catch(() => {})
await page.fill('input[type="password"], input[name="password"]', PASSWORD).catch(() => {})
await page.click('button[type="submit"]').catch(() => {})
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }).catch(() => {})
console.log(`→ post-login at ${page.url()}`)

console.log(`→ goto /makler/abrechnungen`)
const resp = await page.goto(`${BASE}/makler/abrechnungen`, {
  waitUntil: 'networkidle',
  timeout: 90000,
}).catch((err) => {
  console.log(`[goto-fail] ${err.message}`)
  return null
})
if (resp) console.log(`→ /makler/abrechnungen status=${resp.status()}`)

await page.screenshot({ path: 'docs/15.05.2026/makler-abrechnungen-repro.png', fullPage: true }).catch(() => {})
await browser.close()
console.log('done')
