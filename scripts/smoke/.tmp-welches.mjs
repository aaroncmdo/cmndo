import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
const page = await ctx.newPage()
const tags = []
page.on('request', (r) => {
  const u = r.url()
  if (!/clarity\.ms|googletagmanager/.test(u)) return
  let h = '-'; try { const f = r.frame(); h = f ? (f.url().includes('embed/gutachter-finder') ? 'EMBED' : 'ELTERN') : '-' } catch {}
  const m = u.match(/\/tag\/([a-z0-9]+)/)
  tags.push({ h, tag: m ? m[1] : null, gtm: /googletagmanager/.test(u), collect: /\/collect/.test(u), u: u.slice(0,80) })
})
// Schritt 1: ablehnen
await page.goto('https://claimondo.de/gutachter-finden', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{})
await page.waitForTimeout(2500)
for (const t of ['Alle ablehnen','Ablehnen','Nur notwendige']) {
  const k = page.getByRole('button', { name: new RegExp('^'+t,'i') })
  if (await k.count() && await k.first().isVisible().catch(()=>false)) { await k.first().click(); break }
}
await page.waitForTimeout(3500)
tags.length = 0
// Schritt 2: neu laden, Widerspruch liegt vor
await page.goto('https://claimondo.de/gutachter-finden', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{})
await page.waitForTimeout(14000)

console.log('=== Clarity-TAGS geladen (Widerspruch liegt vor) ===')
for (const t of tags.filter(x => x.tag)) console.log(`  ${t.h}: Projekt ${t.tag}  ${t.u.includes('ref=gtm') ? '(via GTM!)' : t.u.includes('ref=npm') ? '(via npm)' : ''}`)
console.log('=== GTM im EMBED geladen? ===')
const gtmImEmbed = tags.filter(x => x.gtm && x.h === 'EMBED')
console.log('  ', gtmImEmbed.length ? gtmImEmbed[0].u : 'NEIN — kein GTM im Embed')
console.log('=== COLLECT nach Frame ===')
console.log('  EMBED:', tags.filter(x=>x.collect&&x.h==='EMBED').length, '| ELTERN:', tags.filter(x=>x.collect&&x.h==='ELTERN').length)
// Welches Projekt haelt window.clarity im Embed?
const f = page.frames().find(x => x.url().includes('embed/gutachter-finder'))
if (f) {
  const ids = await f.evaluate(() => [...document.querySelectorAll('script')].map(s=>s.src).filter(u=>/clarity\.ms\/tag\//.test(u))).catch(()=>[])
  console.log('=== Scripts IM EMBED ==='); for (const i of ids) console.log('  ', i)
}
await b.close()
