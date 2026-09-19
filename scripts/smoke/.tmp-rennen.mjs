import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))
const page = await ctx.newPage()
await page.goto('https://claimondo.de/gutachter-finden', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{})
// akzeptieren, damit beide starten duerfen
for (const t of ['Alle akzeptieren','Akzeptieren','Alles akzeptieren']) {
  const k = page.getByRole('button', { name: new RegExp('^'+t,'i') })
  if (await k.count() && await k.first().isVisible().catch(()=>false)) { await k.first().click(); break }
}
await page.waitForTimeout(12000)

const lies = async (ctxName, target) => {
  const r = await target.evaluate(() => {
    const w = window
    return {
      hatClarity: typeof w.clarity !== 'undefined',
      // Clarity legt seine Projekt-ID in einer internen Variablen bzw. im Script-Tag ab
      scriptIds: [...document.querySelectorAll('script')].map(s => s.src).filter(u => /clarity\.ms\/tag\//.test(u)).map(u => u.split('/tag/')[1]?.split('?')[0]),
      cookies: document.cookie.split('; ').filter(c => /^_cl/.test(c)).map(c => c.split('=')[0]),
    }
  }).catch(e => ({ fehler: String(e).slice(0,80) }))
  console.log(`${ctxName}:`, JSON.stringify(r))
}
await lies('ELTERNSEITE (claimondo.de)', page)
const f = page.frames().find(x => x.url().includes('embed/gutachter-finder'))
if (f) await lies('EMBED  (app.claimondo.de)', f); else console.log('EMBED-Frame nicht gefunden')
await b.close()
