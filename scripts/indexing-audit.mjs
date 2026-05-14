// Indexing-Audit: prüft die technischen Voraussetzungen für saubere
// Indexierung durch Google + AI-Crawler.
import { chromium } from 'playwright'

const PAGES = [
  'https://claimondo.de/',
  'https://claimondo.de/vorteile',
  'https://claimondo.de/wie-es-funktioniert',
  'https://claimondo.de/faq',
  'https://claimondo.de/ueber-uns',
  'https://claimondo.de/schadensreport-2026',
  'https://claimondo.de/ersteinschaetzung',
  'https://claimondo.de/gutachter-finden',
  'https://claimondo.de/kfz-gutachter/koeln',
  'https://claimondo.de/kfz-gutachter/berlin',
  'https://claimondo.de/kfz-gutachter-koeln',
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()

console.log('=== robots.txt ===')
const robotsResp = await page.context().request.get('https://claimondo.de/robots.txt')
const robots = await robotsResp.text()
const aiBots = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended']
for (const b of aiBots) {
  const allowed = robots.includes(`User-Agent: ${b}`) || robots.includes(`User-agent: ${b}`)
  console.log(`  ${allowed ? '✓' : '✗'} ${b}`)
}
const disallowsRoot = /Disallow: \/$/m.test(robots)
console.log(`  ${disallowsRoot ? '✗' : '✓'} Root nicht gesperrt`)

console.log('\n=== sitemap.xml ===')
const smResp = await page.context().request.get('https://claimondo.de/sitemap.xml')
const sm = await smResp.text()
const smPaths = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
console.log(`  Total URLs: ${smPaths.length}`)
const expected = ['/', '/vorteile', '/wie-es-funktioniert', '/faq', '/ueber-uns', '/schadensreport-2026', '/ersteinschaetzung', '/gutachter-finden', '/kfz-gutachter-koeln', '/kfz-gutachter']
for (const path of expected) {
  const url = path === '/' ? 'https://claimondo.de/' : `https://claimondo.de${path}`
  const inSm = smPaths.includes(url)
  console.log(`  ${inSm ? '✓' : '✗'} ${url}`)
}
const stadtUrls = smPaths.filter(u => /\/kfz-gutachter\/[a-z-]+$/.test(u) && !u.endsWith('/koeln-')).length
console.log(`  ${stadtUrls >= 72 ? '✓' : '✗'} ${stadtUrls} Stadt-URLs (Soll: 72+)`)

console.log('\n=== Per-Page Indexierungs-Voraussetzungen ===')
for (const url of PAGES) {
  const resp = await page.context().request.get(url)
  const status = resp.status()
  const html = await resp.text()

  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)
  const xRobotsTag = (resp.headers()['x-robots-tag'] ?? '').toLowerCase().includes('noindex')
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/)
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/)?.[1]
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["']/) !== null
  const jsonLdCount = (html.match(/<script[^>]+application\/ld\+json/g) ?? []).length
  const h1Match = html.match(/<h1[^>]*>([^<]+)/)

  const ok = status === 200 && !noindex && !xRobotsTag && titleMatch && descMatch && canonical && ogTitle && jsonLdCount > 0
  console.log(`${ok ? '✓' : '✗'} ${url}`)
  if (status !== 200) console.log(`    Status: ${status}`)
  if (noindex || xRobotsTag) console.log(`    BLOCKER: noindex (meta=${noindex} xtag=${xRobotsTag})`)
  console.log(`    title: ${titleMatch?.[1]?.slice(0, 70) ?? 'MISSING'}`)
  console.log(`    desc:  ${descMatch?.[1]?.slice(0, 90) ?? 'MISSING'}`)
  console.log(`    canonical: ${canonical ?? 'MISSING'}`)
  console.log(`    og:title: ${ogTitle ? 'set' : 'MISSING'}, json-ld: ${jsonLdCount}, h1: ${h1Match ? 'present' : 'MISSING'}`)
}

console.log('\n=== AI-Crawler-Discovery (llms.txt + llms-full.txt) ===')
for (const path of ['/llms.txt', '/llms-full.txt']) {
  const r = await page.context().request.get(`https://claimondo.de${path}`)
  console.log(`  ${r.status() === 200 ? '✓' : '✗'} ${path}: ${r.status()} (${r.headers()['content-type']})`)
}

await browser.close()
