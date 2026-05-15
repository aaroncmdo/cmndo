// 15.05.2026: Lokales Repro für /schaden-melden?p=MK-XXXX Crash (CMM-14 diag).
import { chromium } from 'playwright'
const BASE = 'http://localhost:3001'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log(`[PAGEERROR] ${e.message}`))
const resp = await page
  .goto(`${BASE}/schaden-melden?p=MK-SMKE`, { waitUntil: 'networkidle', timeout: 120000 })
  .catch((e) => {
    console.log(`[goto-err] ${e.message}`)
    return null
  })
console.log(`status=${resp?.status() ?? '?'}`)
const text = await page.locator('body').innerText().catch(() => '')
const hasCrash = text.includes('APP ROOT CRASH')
const hasWizard = text.includes('Wer ist schuld')
console.log(`crash=${hasCrash} wizard=${hasWizard}`)
console.log(`body-first-200=${text.slice(0, 200)}`)
await page.screenshot({ path: 'docs/15.05.2026/repro-promo-after-fix.png', fullPage: true }).catch(() => {})
await browser.close()
