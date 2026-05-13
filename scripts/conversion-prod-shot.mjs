import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/conversion-prod'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

for (const slug of ['vorteile', 'wie-es-funktioniert']) {
  await page.goto(`https://claimondo.de/${slug}`, { waitUntil: 'networkidle', timeout: 90000 })
  try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}
  await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${slug}-full.png`), fullPage: true })
  console.log(`✓ ${slug}-full.png`)
  // Hero
  const hero = await page.$(`section[aria-labelledby="${slug === 'vorteile' ? 'vorteile-hero' : 'wef-hero'}"]`)
  if (hero) { await hero.scrollIntoViewIfNeeded(); await hero.screenshot({ path: join(OUT, `${slug}-hero.png`) }); console.log(`✓ ${slug}-hero.png`) }
}
await browser.close()
