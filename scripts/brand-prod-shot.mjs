import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/brand-prod'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

for (const slug of ['ueber-uns', 'schadensreport-2026']) {
  await page.goto(`https://claimondo.de/${slug}`, { waitUntil: 'networkidle', timeout: 90000 })
  try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}
  await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  // Hero only
  const sel = slug === 'ueber-uns' ? 'section[aria-labelledby="ueber-uns-hero"]' : 'section[aria-labelledby="report-hero"]'
  const el = await page.$(sel)
  if (el) {
    await el.screenshot({ path: join(OUT, `${slug}-hero.png`) })
    console.log(`✓ ${slug}-hero.png`)
  }
  // Hero + Trust-Strip combined (top 1100px)
  await page.screenshot({ path: join(OUT, `${slug}-top.png`), clip: { x: 0, y: 0, width: 1280, height: 1100 } })
  console.log(`✓ ${slug}-top.png`)
}
await browser.close()
