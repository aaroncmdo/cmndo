// Komplett-Smoke aller Premium-Pages in Production.
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = 'docs/13.05.2026/marketing-rework/screenshots/full-prod-final'
await mkdir(OUT, { recursive: true })

const PAGES = [
  ['home', 'https://claimondo.de/'],
  ['vorteile', 'https://claimondo.de/vorteile'],
  ['wie-es-funktioniert', 'https://claimondo.de/wie-es-funktioniert'],
  ['faq', 'https://claimondo.de/faq'],
  ['ueber-uns', 'https://claimondo.de/ueber-uns'],
  ['schadensreport-2026', 'https://claimondo.de/schadensreport-2026'],
  ['ersteinschaetzung', 'https://claimondo.de/ersteinschaetzung'],
  ['gutachter-finden', 'https://claimondo.de/gutachter-finden'],
  ['kfz-gutachter-koeln-ads', 'https://claimondo.de/kfz-gutachter-koeln'],
  ['stadt-koeln', 'https://claimondo.de/kfz-gutachter/koeln'],
  ['stadt-berlin', 'https://claimondo.de/kfz-gutachter/berlin'],
  ['stadt-muenchen', 'https://claimondo.de/kfz-gutachter/muenchen'],
  ['stadt-leipzig', 'https://claimondo.de/kfz-gutachter/leipzig'],
  ['stadt-saarbruecken', 'https://claimondo.de/kfz-gutachter/saarbruecken'],
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

const results = []
for (const [slug, url] of PAGES) {
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
    const status = resp?.status() ?? 0
    try { const b = await page.$('button:has-text("Alle akzeptieren")'); if (b) { await b.click(); await page.waitForTimeout(300) } } catch {}
    await page.evaluate(async () => { let y=0; await new Promise(r => { const s=()=>{ window.scrollTo(0,y); y+=600; if (y>document.body.scrollHeight) return r(); setTimeout(s,80) }; s() }) })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    const file = join(OUT, `${slug}.png`)
    await page.screenshot({ path: file, fullPage: true })
    const text = await page.evaluate(() => document.body.innerText)
    const trustStrip = text.includes('Sechs Gründe') || text.includes('110+') || text.includes('Wir regeln') || text.includes('5 Schritten') || text.includes('Q&As mit BGH') || text.includes('Ein Berater') || text.includes('Schadensreport') || text.includes('In Sekunden bewertet') || text.includes('Häufige Fragen') || text.includes('Tesla, Polestar')
    results.push({ slug, status, len: text.length, trustOK: text.includes('claimondo'), screenshotKB: 0, ok: status === 200 && trustStrip })
    console.log(`${status === 200 ? '✓' : '✗'} ${slug.padEnd(28)} ${status} · ${text.length} chars`)
  } catch (err) {
    results.push({ slug, error: err.message })
    console.log(`✗ ${slug}: ${err.message}`)
  }
}

// Spezial-Endpoints
console.log('\n--- Special Endpoints ---')
for (const [url, marker] of [
  ['https://claimondo.de/sitemap.xml', 'kfz-gutachter/koeln'],
  ['https://claimondo.de/robots.txt', 'GPTBot'],
  ['https://claimondo.de/llms.txt', 'Vollständige Kfz-Schadensregulierung'],
  ['https://claimondo.de/llms-full.txt', 'Komplett-Dump'],
]) {
  const resp = await page.context().request.get(url)
  const text = await resp.text()
  const ok = resp.status() === 200 && text.includes(marker)
  console.log(`${ok ? '✓' : '✗'} ${url}: ${resp.status()} · "${marker}" ${text.includes(marker) ? 'found' : 'MISSING'}`)
}

console.log(`\n${results.filter(r => r.ok).length}/${results.length} pages OK`)
await browser.close()
