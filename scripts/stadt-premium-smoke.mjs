import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3003'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/stadt-premium'
await mkdir(OUT, { recursive: true })

const TARGETS = ['koeln', 'berlin', 'muenchen', 'leipzig', 'hannover']
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

for (const slug of TARGETS) {
  await page.goto(`${BASE}/kfz-gutachter/${slug}`, { waitUntil: 'networkidle', timeout: 60000 })
  try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(300) } } catch {}
  const hero = await page.$('section[aria-labelledby="hero-heading"]')
  if (hero) {
    await hero.scrollIntoViewIfNeeded()
    await hero.screenshot({ path: join(OUT, `${slug}-hero.png`) })
    console.log(`✓ ${slug}-hero.png`)
  }
  const lokal = await page.$('section[aria-labelledby="lokal-heading"]')
  if (lokal) {
    await lokal.scrollIntoViewIfNeeded()
    await lokal.screenshot({ path: join(OUT, `${slug}-lokal.png`) })
    console.log(`✓ ${slug}-lokal.png`)
  }
}
await browser.close()
