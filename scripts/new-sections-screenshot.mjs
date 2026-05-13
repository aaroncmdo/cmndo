import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3004'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/new-sections'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/kfz-gutachter/koeln`, { waitUntil: 'networkidle', timeout: 90000 })
try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}

await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(500)

const SELECTORS = [
  ['portal', 'section[aria-labelledby="portal-heading"]'],
  ['wertminderung', 'section[aria-labelledby="wertminderung-heading"]'],
  ['tesla', 'section[aria-labelledby="tesla-heading"]'],
  ['versicherer', 'section[aria-labelledby="versicherer-taktiken-heading"]'],
  ['fehler', 'section[aria-labelledby="sieben-fehler-heading"]'],
]
for (const [slug, sel] of SELECTORS) {
  const el = await page.$(sel)
  if (!el) { console.log(`✗ ${slug}: nf`); continue }
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await el.screenshot({ path: join(OUT, `${slug}.png`) })
  console.log(`✓ ${slug}.png`)
}
await browser.close()
