// AAR-939 Stream 9 Smoke: laedt eine Live-Cluster-LP headless, wartet auf das
// (lazyOnload) Monika-Widget im Shadow-DOM-Host, screenshotet, sammelt Konsolen-/
// Page-Errors. Beweist, dass das Widget tatsaechlich rendert (Script 200 allein
// beweist nur, dass das Bundle ladbar ist).
//
// Usage: node scripts/smoke-monika-cluster.mjs <url> <out.png>
import { chromium } from 'playwright'

const url = process.argv[2] || 'https://kfz-unfallgutachter-wuppertal.de/'
const out = process.argv[3] || 'monika-smoke.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
const requests = []
page.on('requestfinished', (r) => { if (r.url().includes('monika')) requests.push(r.url()) })

await page.goto(url, { waitUntil: 'load', timeout: 30000 })

let hasHost = false
try {
  await page.waitForSelector('[data-monika-widget]', { timeout: 20000 })
  hasHost = true
} catch { /* lazyOnload evtl. noch nicht gefeuert */ }

let hasFab = false
try { hasFab = (await page.locator('[data-monika-widget] .fab').count()) > 0 } catch {}

await page.screenshot({ path: out })
console.log(JSON.stringify({ url, hasHost, hasFab, monikaRequests: requests, errors }, null, 2))
await browser.close()
