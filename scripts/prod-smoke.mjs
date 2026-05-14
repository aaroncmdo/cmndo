// Live-Smoke gegen claimondo.de (Production).
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/prod-live'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

const TARGETS = [
  ['home', 'https://claimondo.de/'],
  ['koeln', 'https://claimondo.de/kfz-gutachter/koeln'],
  ['hannover', 'https://claimondo.de/kfz-gutachter/hannover'],
  ['leipzig', 'https://claimondo.de/kfz-gutachter/leipzig'],
  ['nuernberg', 'https://claimondo.de/kfz-gutachter/nuernberg'],
]

for (const [slug, url] of TARGETS) {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  console.log(`${slug}: Status ${resp?.status()}`)
  try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(300) } } catch {}
  await page.evaluate(async () => {
    await new Promise((r) => { let y = 0; const s = () => { window.scrollTo(0, y); y += 600; if (y > document.body.scrollHeight) return r(); setTimeout(s, 120) }; s() })
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true })
  console.log(`  ✓ ${slug}.png`)
}

// Home: content + umlauts
await page.goto('https://claimondo.de/', { waitUntil: 'networkidle' })
const text = await page.evaluate(() => document.body.innerText)
const CHECKS = [
  '110+ DAT-Gutachter bundesweit verfügbar',
  'Wir regeln Ihren Kfz-Schaden vollständig',
  '8 BGH-Urteile, die Ihre Ansprüche absichern',
  'BGH VI ZR 38/22',
  'ControlExpert',
  '7 Fehler, die Sie nach einem Unfall vermeiden',
  '110+ DAT-Sachverständige · Schwerpunkt NRW',
  'Ein Berater. Eine Nummer.',
  'Hannover',
  'Leipzig',
]
let pass = 0
for (const c of CHECKS) { const ok = text.includes(c); console.log(`${ok ? '✓' : '✗'} ${c}`); if (ok) pass++ }
const ASCII = /\b(Fuer|fuer|naechst|Naechst|ueber|Ueber|aendern|Aenderung|loesch|Loesch|grosse|groesse|moegli|spaet|haeuf|jaehr|geprueft|fuehrt|gehoer|verfueg|muess|Schaeden|Anwaelte)\b/g
const hits = [...new Set(text.match(ASCII) ?? [])]
console.log(`\n${pass}/${CHECKS.length} content-checks pass on claimondo.de`)
console.log(`ASCII-Ersatz-Funde: ${hits.length === 0 ? 'KEINE' : hits.join(', ')}`)

// Sitemap-Test
const smResp = await page.context().request.get('https://claimondo.de/sitemap.xml')
const smText = await smResp.text()
const cityCount = new Set([...smText.matchAll(/\/kfz-gutachter\/([a-z-]+)/g)].map(m => m[1])).size
console.log(`Sitemap: Status ${smResp.status()}, ${cityCount} unique city slugs`)

// Robots-Test
const rbResp = await page.context().request.get('https://claimondo.de/robots.txt')
const rbText = await rbResp.text()
const aiBots = ['GPTBot', 'ClaudeBot', 'PerplexityBot'].filter(b => rbText.includes(b))
console.log(`Robots: Status ${rbResp.status()}, AI-Bots gefunden: ${aiBots.join(', ') || 'KEINE'}`)

await browser.close()
