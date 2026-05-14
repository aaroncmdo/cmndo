// Captures the raw response body of the /login server-action submit
// to identify what's making React's RSC parser fail with
// "An unexpected response was received from the server".

import { chromium } from 'playwright'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.test' })

const USER = process.env.STAGING_BASIC_AUTH_USER
const PASS = process.env.STAGING_BASIC_AUTH_PASS

const browser = await chromium.launch({ headless: false, slowMo: 200, args: ['--start-maximized'] })
const ctx = await browser.newContext({
  viewport: null,
  ...(USER && PASS ? { httpCredentials: { username: USER, password: PASS } } : {}),
})
const page = await ctx.newPage()

page.on('console', m => console.log(`[console.${m.type()}] ${m.text()}`))
page.on('pageerror', e => console.log(`[pageerror] ${e.message}`))

// Capture form-action responses
page.on('response', async (res) => {
  const url = res.url()
  if (url.includes('/login') && res.request().method() === 'POST') {
    console.log()
    console.log('═══ LOGIN POST RESPONSE ═══')
    console.log('URL:', url)
    console.log('Status:', res.status())
    console.log('Headers:')
    for (const [k, v] of Object.entries(res.headers())) {
      console.log(`  ${k}: ${v.slice(0, 200)}`)
    }
    try {
      const body = await res.text()
      console.log('Body (first 4000 chars):')
      console.log(body.slice(0, 4000))
    } catch (e) {
      console.log('Body read error:', e.message)
    }
    console.log('═══════════════════════════')
  }
})

console.log('▶ navigate /login')
await page.goto('https://app.staging.claimondo.de/login', { waitUntil: 'domcontentloaded' })
await page.bringToFront()
await page.waitForTimeout(2000)

console.log('▶ fill email + password')
await page.locator('[name="email"]').fill('smoke-sv@claimondo.test')
await page.locator('[name="password"]').fill('Test1234!')
await page.waitForTimeout(500)

console.log('▶ submit Einloggen')
await page.locator('button[type="submit"]').first().click()
await page.waitForTimeout(8000)

console.log('▶ current URL:', page.url())
console.log('▶ Sleep 30s for inspect')
await page.waitForTimeout(30000)

await browser.close()
