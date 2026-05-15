// 15.05.2026: Lokales Repro für /gutachter/heute `x.map is not a function`.
import { chromium } from 'playwright'

const BASE = 'http://localhost:3001'
const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()

page.on('pageerror', (err) => {
  console.log(`[PAGEERROR] ${err.message}`)
  if (err.stack) console.log(err.stack.split('\n').slice(0, 12).join('\n'))
})
page.on('console', (m) => {
  if (m.type() === 'error') console.log(`[CONSOLE/ERR] ${m.text()}`)
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.fill('input[type="email"], input[name="email"]', 'test-sv@claimondo.de').catch(() => {})
await page.fill('input[type="password"], input[name="password"]', 'Test1234!').catch(() => {})
await page.click('button[type="submit"]').catch(() => {})
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {})
console.log(`post-login at ${page.url()}`)

const resp = await page
  .goto(`${BASE}/gutachter/heute`, { waitUntil: 'networkidle', timeout: 90000 })
  .catch((e) => {
    console.log(`goto err: ${e.message}`)
    return null
  })
if (resp) console.log(`gutachter/heute status=${resp.status()}`)

await page.waitForTimeout(4000)
await page
  .screenshot({ path: 'docs/15.05.2026/gutachter-heute-repro.png', fullPage: true })
  .catch(() => {})
await browser.close()
console.log('done')
