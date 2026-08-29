// Gezielt: das Rückruf-Formular der Stadtseite (300+ Seiten teilen es).
// Frage: entsteht ein Lead? Frueherer Befund sagt "war tot" — also sauber messen:
// Vorschlag WAEHLEN (nicht Escape), dann absenden, dann Netzwerk + DB pruefen.
import { chromium } from 'playwright'
import { join } from 'node:path'
import { MARKETING, identitaet, svc, zustand, zusammenfassung } from './ep-lib.mjs'

const ident = identitaet('E6R')
const TEL = process.env.EP_TELEFON || '+491633628571'
console.log('Identitaet:', ident.email, '| Name:', ident.vorname, ident.nachname)

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'de-DE' })).newPage()
const posts = []
const antworten = []
page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url().slice(0, 140)) })
page.on('response', async (r) => {
  if (r.request().method() !== 'POST') return
  antworten.push({ url: r.url().slice(0, 100), status: r.status(), revalidated: r.headers()['x-action-revalidated'] || '' })
})
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 200)) })

await page.goto(`${MARKETING}/kfz-gutachter/koeln`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})
await page.waitForTimeout(2500)

// Das Formular mit den meisten sichtbaren Feldern suchen — `#name` allein ist auf der
// langen Stadtseite nicht eindeutig/sofort sichtbar.
const idx = await page.evaluate(() => {
  const sichtbar = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const f = [...document.querySelectorAll('form')]
    .map((x, i) => ({ i, n: [...x.querySelectorAll('input')].filter(sichtbar).length }))
    .sort((a, b) => b.n - a.n)[0]
  return f ? f.i : -1
})
console.log('Formular-Index:', idx)
const form = page.locator('form').nth(idx)
await form.scrollIntoViewIfNeeded()
await page.waitForTimeout(1200)

const name = form.locator('input#name, input[placeholder*="Mustermann"]').first()
await name.waitFor({ state: 'visible', timeout: 20_000 })
await name.fill(`${ident.vorname} ${ident.nachname}`)
await form.locator('input#phone, input[type="tel"]').first().fill(TEL)

const ort = form.locator('input[placeholder*="PLZ"]').first()
await ort.click()
await ort.pressSequentially('Köln', { delay: 120 })
await page.waitForTimeout(3000)
// Den Vorschlag WAEHLEN — eine offene Liste ueberdeckt sonst den Absende-Button.
const opt = page.locator('[role="option"], li, button').filter({ hasText: /^Köln, Nordrhein/i }).first()
console.log('Vorschlag "Köln, Nordrhein…" gefunden:', await opt.count())
if (await opt.count()) await opt.click()
await page.waitForTimeout(1500)
console.log('Ortsfeld:', JSON.stringify(await ort.inputValue()))

// Ist der Absende-Button jetzt frei? (Overlay-Falle: der Klick kann das Overlay treffen)
const btn = page.getByRole('button', { name: /Jetzt kostenlosen Rückruf erhalten/i }).first()
await btn.scrollIntoViewIfNeeded()
const box = await btn.boundingBox()
const obenAufDemPunkt = box
  ? await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el ? { tag: el.tagName, text: (el.innerText || '').slice(0, 50), cls: (el.className || '').toString().slice(0, 60) } : null
    }, [box.x + box.width / 2, box.y + box.height / 2])
  : null
console.log('Element auf der Button-Mitte:', JSON.stringify(obenAufDemPunkt))
console.log('Button deaktiviert?', await btn.isDisabled().catch(() => '?'))

const vorher = posts.length
// Zwei Fragen sauber trennen:
//  (a) Ist der Button fuer einen echten Klick erreichbar? -> normaler Klick mit kurzem Timeout
//  (b) Funktioniert die Aktion ueberhaupt? -> notfalls per JS-Klick (umgeht Overlays)
let echterKlick = true
try {
  await btn.click({ timeout: 8000 })
  console.log('→ echter Klick hat den Button erreicht')
} catch {
  echterKlick = false
  console.log('⚠ BEFUND: echter Klick erreicht den Button NICHT (Overlay faengt ihn ab)')
  await btn.evaluate((el) => el.click())
  console.log('→ ersatzweise per JS geklickt, um die Aktion selbst zu pruefen')
}
console.log('Erreichbar fuer echten Klick:', echterKlick)
await page.waitForTimeout(7000)
console.log('\nPOSTs waehrend des Absendens:', posts.length - vorher)
console.log('Antworten:', JSON.stringify(antworten.slice(-4), null, 2))
const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500))
console.log('Seitentext danach:', text.slice(0, 300))
await page.screenshot({ path: join(process.cwd(), 'scripts/smoke/.ep-walk/e6-rueckruf-danach.png'), fullPage: false })
console.log('Konsolenfehler:', konsole.length, konsole.slice(0, 3))
await browser.close()

await new Promise((r) => setTimeout(r, 6000))
const db = svc()
const z = await zustand(db, ident.email)
console.log('\n=== DB (per Email) ===')
console.log(JSON.stringify(zusammenfassung(z), null, 2))
// Der Rueckruf erhebt evtl. gar keine Email -> zusaetzlich ueber Name/Telefon suchen
const { data: perName } = await db.from('leads')
  .select('id, vorname, nachname, telefon, email, source_channel, status, created_at')
  .ilike('nachname', `%${ident.nachname}%`)
console.log('Leads per Nachname:', JSON.stringify(perName))
const { data: frisch } = await db.from('leads')
  .select('id, vorname, nachname, telefon, source_channel, created_at')
  .gte('created_at', new Date(Date.now() - 6 * 60_000).toISOString())
console.log('Leads der letzten 6 Minuten (alle):', JSON.stringify(frisch))
