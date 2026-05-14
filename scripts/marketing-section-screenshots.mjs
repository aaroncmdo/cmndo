// Section-Level-Screenshots der 3 neuen Hauptseiten-Sections.
import { chromium } from 'playwright'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const OUT = 'docs/13.05.2026/marketing-rework/screenshots'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 })

const SELECTORS = [
  ['section-bgh', 'section[aria-labelledby="bgh-authority-heading"]'],
  ['section-versicherer', 'section[aria-labelledby="versicherer-taktiken-heading"]'],
  ['section-fehler', 'section[aria-labelledby="sieben-fehler-heading"]'],
]

for (const [slug, selector] of SELECTORS) {
  const el = await page.$(selector)
  if (!el) { console.log(`✗ ${slug}: selector not found`); continue }
  const file = join(OUT, `${slug}.png`)
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await el.screenshot({ path: file })
  console.log(`✓ ${slug} -> ${file}`)
}

await browser.close()
