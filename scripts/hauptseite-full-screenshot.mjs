// Full-Page + per-Section-Screenshots der neuen HauptseitePremium.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/premium-v2'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 })

// Cookie-Consent wegklicken
try {
  const btn = await page.$('button:has-text("Alle akzeptieren")')
  if (btn) { await btn.click(); await page.waitForTimeout(400) }
} catch {}

// Lazy-Bilder laden lassen
await page.evaluate(async () => {
  await new Promise((resolve) => {
    let y = 0
    const step = () => {
      window.scrollTo(0, y); y += 600
      if (y > document.body.scrollHeight) { resolve(); return }
      setTimeout(step, 150)
    }
    step()
  })
})
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(500)

// Full-Page
await page.screenshot({ path: join(OUT, 'full-page.png'), fullPage: true })
console.log('✓ full-page.png')

// Per-Section
const SECTIONS = [
  ['1-hero-band', 'section:has-text("Sofort nach dem Unfall")'],
  ['2-hero-form', 'section[aria-labelledby="hero-heading"]'],
  ['4-ansprueche', 'section[aria-labelledby="ansprueche-heading"]'],
  ['5-bgh', 'section[aria-labelledby="bgh-heading-premium"]'],
  ['6-prozess', 'section[aria-labelledby="prozess-heading"]'],
  ['7-einsatzgebiet', 'section[aria-labelledby="einsatzgebiet-heading"]'],
  ['8-berater', 'section[aria-labelledby="berater-heading"]'],
  ['9-faq', 'section[aria-labelledby="faq-heading"]'],
]
for (const [slug, sel] of SECTIONS) {
  const el = await page.$(sel)
  if (!el) { console.log(`✗ ${slug}: nicht gefunden`); continue }
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await el.screenshot({ path: join(OUT, `${slug}.png`) })
  console.log(`✓ ${slug}.png`)
}

await browser.close()
