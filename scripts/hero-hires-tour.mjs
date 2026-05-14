// Hi-Res-Tour aller Premium-Pages: nur Hero-Sektionen + 1-2 Highlight-
// Sections — damit die Bilder im Chat nicht stark skaliert werden.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/hero-tour'
await mkdir(OUT, { recursive: true })

const TARGETS = [
  ['home', 'https://claimondo.de/', null],
  ['vorteile', 'https://claimondo.de/vorteile', 'section[aria-labelledby="vorteile-hero"]'],
  ['wie-es-funktioniert', 'https://claimondo.de/wie-es-funktioniert', 'section[aria-labelledby="wef-hero"]'],
  ['faq', 'https://claimondo.de/faq', 'section[aria-labelledby="faq-hero"]'],
  ['ueber-uns', 'https://claimondo.de/ueber-uns', 'section[aria-labelledby="ueber-uns-hero"]'],
  ['schadensreport', 'https://claimondo.de/schadensreport-2026', 'section[aria-labelledby="report-hero"]'],
  ['ersteinschaetzung', 'https://claimondo.de/ersteinschaetzung', 'section[aria-labelledby="ee-hero"]'],
  ['stadt-koeln-hero', 'https://claimondo.de/kfz-gutachter/koeln', 'section[aria-labelledby="hero-heading"]'],
  ['stadt-berlin-hero', 'https://claimondo.de/kfz-gutachter/berlin', 'section[aria-labelledby="hero-heading"]'],
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()

for (const [slug, url, heroSel] of TARGETS) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
    try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(300) } } catch {}
    await page.waitForTimeout(500)
    if (heroSel) {
      const el = await page.$(heroSel)
      if (el) {
        await el.screenshot({ path: join(OUT, `${slug}.png`) })
        console.log(`✓ ${slug}.png (hero)`)
        continue
      }
    }
    // Fallback: top-1000-pixel viewport-clip
    await page.screenshot({ path: join(OUT, `${slug}.png`), clip: { x: 0, y: 0, width: 1280, height: 1000 } })
    console.log(`✓ ${slug}.png (top-1000)`)
  } catch (err) {
    console.log(`✗ ${slug}: ${err.message}`)
  }
}

await browser.close()
