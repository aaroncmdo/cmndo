// Side-by-Side Screenshots: prototype.html (Vorgabe) ↔ live claimondo.de
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROTOTYPE = 'C:/Users/Aaron Sprafke/Downloads/SEO UND GEO-20260513T180924Z-3-001/SEO UND GEO/marketing-landing-koeln/übergabe/prototype.html'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/compare'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })

// 1. Prototype rendern
const protoCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const protoPage = await protoCtx.newPage()
await protoPage.goto(pathToFileURL(PROTOTYPE).href, { waitUntil: 'networkidle', timeout: 60000 })
// Tailwind CDN braucht eine kleine Verzögerung
await protoPage.waitForTimeout(1500)
await protoPage.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
await protoPage.evaluate(() => window.scrollTo(0, 0))
await protoPage.waitForTimeout(500)
await protoPage.screenshot({ path: join(OUT, 'prototype-full.png'), fullPage: true })
console.log('✓ prototype-full.png')

// 2. Live claimondo.de / + /kfz-gutachter/koeln
const liveCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const livePage = await liveCtx.newPage()

const TARGETS = [
  ['home-live', 'https://claimondo.de/'],
  ['koeln-live', 'https://claimondo.de/kfz-gutachter/koeln'],
]
for (const [slug, url] of TARGETS) {
  await livePage.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  try { const b = await livePage.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await livePage.waitForTimeout(400) } } catch {}
  await livePage.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,150) }; s() }) })
  await livePage.evaluate(() => window.scrollTo(0, 0))
  await livePage.waitForTimeout(500)
  await livePage.screenshot({ path: join(OUT, `${slug}-full.png`), fullPage: true })
  console.log(`✓ ${slug}-full.png`)
}

await browser.close()
