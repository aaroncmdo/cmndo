// AAR-939 Stream 9 — Live-Submit-Smoke: fuellt das echte Monika-Formular auf einer
// Cluster-LP headless aus (FAB -> qualify -> Tag -> Zeit -> Name/Tel/Consent -> senden),
// wartet auf Success, faengt die /api/anfrage-from-lp-Response. Erzeugt eine ECHTE
// Anfrage im Prod-Backend (Test-Daten -> als Test erkennbar).
//
// Usage: node scripts/smoke-monika-submit.mjs <url> <name> <tel> <out.png>
import { chromium } from 'playwright'

const url = process.argv[2] || 'https://kfz-unfallgutachter-wuppertal.de/'
const name = process.argv[3] || 'SMOKE Stream9 Test bitte ignorieren'
const tel = process.argv[4] || '+491633628571'
const out = process.argv[5] || 'monika-submit.png'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
let submitResp = null
page.on('response', async (r) => {
  if (r.url().includes('/api/anfrage-from-lp')) {
    try { submitResp = { status: r.status(), body: (await r.text()).slice(0, 300) } } catch {}
  }
})

await page.goto(url, { waitUntil: 'load', timeout: 30000 })
const host = page.locator('[data-monika-widget]')
await host.locator('.fab').waitFor({ timeout: 20000 })
await host.locator('.fab').click()
await host.getByText('Ja, ich hatte einen Unfall').click()
await host.getByText('So schnell', { exact: false }).first().click() // Tag = asap
await host.getByText('Vormittag', { exact: false }).first().click()   // Zeit = vormittag
await host.locator('#monika-name').fill(name)
await host.locator('#monika-tel').fill(tel)
await host.locator('.consent input[type="checkbox"]').check()
await host.locator('.cta').click()

let success = false
try {
  await host.getByText('Vielen Dank', { exact: false }).waitFor({ timeout: 15000 })
  success = true
} catch {}

await page.screenshot({ path: out })
console.log(JSON.stringify({ url, name, tel, success, submitResp, errors }, null, 2))
await browser.close()
