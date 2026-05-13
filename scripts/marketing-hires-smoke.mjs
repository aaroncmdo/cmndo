// High-Res-Screenshots der drei neuen Hauptseiten-Sections + Hero.
import { chromium } from 'playwright'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots/hires'

import { mkdir } from 'node:fs/promises'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })

// Cookie-Consent wegklicken, falls da
try {
  const consentBtn = await page.$('button:has-text("Alle akzeptieren")')
  if (consentBtn) { await consentBtn.click(); await page.waitForTimeout(300) }
} catch {}

const TARGETS = [
  ['hero', 'section[aria-labelledby="hero-heading"]'],
  ['bgh', 'section[aria-labelledby="bgh-authority-heading"]'],
  ['versicherer', 'section[aria-labelledby="versicherer-taktiken-heading"]'],
  ['fehler', 'section[aria-labelledby="sieben-fehler-heading"]'],
]

for (const [slug, sel] of TARGETS) {
  const el = await page.$(sel)
  if (!el) { console.log(`✗ ${slug}: nicht gefunden`); continue }
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  // Topbar wegscrollen — manuell etwas runter
  await page.evaluate((selector) => {
    const e = document.querySelector(selector)
    if (e) {
      const r = e.getBoundingClientRect()
      window.scrollBy(0, r.top - 20)
    }
  }, sel)
  await page.waitForTimeout(300)
  const box = await el.boundingBox()
  if (!box) { console.log(`✗ ${slug}: kein box`); continue }
  const file = join(OUT, `${slug}.png`)
  await el.screenshot({ path: file })
  console.log(`✓ ${slug} -> ${file} (${Math.round(box.width)}×${Math.round(box.height)})`)
}

await browser.close()
