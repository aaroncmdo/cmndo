// Marketing-Page-Smoke-Screenshots fuer Hauptseite + Stadt-Pages.
// Erzeugt PNGs unter docs/13.05.2026/marketing-rework/screenshots/.
//
// Voraussetzung: Production-Server laeuft auf SCREENSHOT_BASE_URL.
// Aufruf:  node scripts/marketing-smoke-screenshot.mjs
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:3002'
const OUT = process.env.SCREENSHOT_OUT_DIR ?? 'docs/13.05.2026/marketing-rework/screenshots'

const TARGETS = [
  ['home-desktop', '/', 'desktop'],
  ['home-mobile', '/', 'mobile'],
  ['koeln-desktop', '/kfz-gutachter/koeln', 'desktop'],
  ['hannover-desktop', '/kfz-gutachter/hannover', 'desktop'],
  ['leipzig-desktop', '/kfz-gutachter/leipzig', 'desktop'],
]

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []

for (const [slug, path, vp] of TARGETS) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp] })
  const page = await ctx.newPage()
  const url = `${BASE}${path}`
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
    const status = resp?.status() ?? 0
    // Scroll waehrend Rendering um Lazy-Loads zu triggern
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0
        const step = () => {
          window.scrollTo(0, y); y += 400
          if (y > document.body.scrollHeight) { resolve(); return }
          setTimeout(step, 80)
        }
        step()
      })
    })
    await page.evaluate(() => window.scrollTo(0, 0))
    const file = join(OUT, `${slug}.png`)
    await page.screenshot({ path: file, fullPage: true })
    // Body-Text fuer Umlaut-Check sichern
    const text = await page.evaluate(() => document.body.innerText)
    results.push({ slug, path, status, file, textLen: text.length, text })
    console.log(`✓ ${slug} -> ${file} (${status}, ${text.length} chars)`)
  } catch (err) {
    results.push({ slug, path, error: err.message })
    console.log(`✗ ${slug}: ${err.message}`)
  } finally {
    await ctx.close()
  }
}
await browser.close()

// Umlaut-Audit: ASCII-Ersaetze in jeder Page suchen
const ASCII_REPLACEMENTS = /\b(Fuer|fuer|naechst|Naechst|ueber|Ueber|aendern|Aenderung|loesch|Loesch|grosse|groesse|moegli|Moegli|spaet|Spaet|haeuf|Haeuf|jaehr|Jaehr|geprueft|gepruef|fuehrt|Fuehrt|gehoer|Gehoer|verfueg|Verfueg|muess|Muess|Schaeden|schaeden|Anwaelte|anwaelte)\b/g
for (const r of results) {
  if (!r.text) continue
  const hits = r.text.match(ASCII_REPLACEMENTS)
  r.umlautIssues = hits ? [...new Set(hits)] : []
}

const summary = results.map(r => ({
  slug: r.slug, status: r.status ?? 'ERR', umlautIssues: r.umlautIssues ?? null, error: r.error ?? null
}))
console.log('\n--- SUMMARY ---')
console.log(JSON.stringify(summary, null, 2))
