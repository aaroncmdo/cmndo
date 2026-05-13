import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/faq-prod'
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto('https://claimondo.de/faq', { waitUntil: 'networkidle', timeout: 90000 })
try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(400) } } catch {}
await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(500)
await page.screenshot({ path: join(OUT, 'faq-full.png'), fullPage: true })
const hero = await page.$('section[aria-labelledby="faq-hero"]')
if (hero) { await hero.scrollIntoViewIfNeeded(); await hero.screenshot({ path: join(OUT, 'faq-hero.png') }) }
console.log('✓ faq-full.png + faq-hero.png')
const text = await page.evaluate(() => document.body.innerText)
const checks = [
  'Häufige Fragen',
  'BGH-belegt',
  'Quotenvorrecht',
  'Scheckheft',
  'Restwert',
  'Springen Sie direkt zum Thema',
  '45',
  '14',
]
for (const c of checks) console.log(`${text.includes(c) ? '✓' : '✗'} ${c}`)
await browser.close()
