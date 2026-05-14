// Final Production-Showcase: Hauptseite + Stadt-Page mit allen Premium-Sections.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/prod-final'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

const PAGES = [
  ['home', 'https://claimondo.de/'],
  ['koeln', 'https://claimondo.de/kfz-gutachter/koeln'],
]

for (const [slug, url] of PAGES) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}
  await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${slug}-fullpage.png`), fullPage: true })
  console.log(`✓ ${slug}-fullpage.png`)

  // Premium-Sections einzeln
  const SECTIONS = [
    ['hero-form', 'section[aria-labelledby="hero-heading"]'],
    ['portal', 'section[aria-labelledby="portal-heading"]'],
    ['wertminderung', 'section[aria-labelledby="wertminderung-heading"]'],
    ['tesla', 'section[aria-labelledby="tesla-heading"]'],
  ]
  for (const [sec, sel] of SECTIONS) {
    const el = await page.$(sel)
    if (!el) { console.log(`  ✗ ${sec}: nf`); continue }
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await el.screenshot({ path: join(OUT, `${slug}-${sec}.png`) })
    console.log(`  ✓ ${slug}-${sec}.png`)
  }
}
await browser.close()
