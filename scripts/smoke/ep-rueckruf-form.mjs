// Die drei identischen Rückruf-Formulare (Startseite, Ads-Landing, Stadtseite):
// "Ihr Name" · "Ihre Telefonnummer" · "Köln oder PLZ" → "Jetzt kostenlosen Rückruf erhalten".
// Sauber: Felder WIRKLICH fuellen, Vorschlag waehlen, absenden, Netzwerk + DB pruefen.
//
// ⚠ Zwei eigene Messfehler, die hier bewusst vermieden werden:
//   1. "Bestaetigung sichtbar" per Regex /erhalten/ — das Wort steht im BUTTON selbst.
//      Erfolg wird deshalb am POST + am DB-Zustand gemessen, nicht am Seitentext.
//   2. Suche nur ueber die Email — diese Formulare erheben gar keine. Suche ueber NAME.
import { chromium } from 'playwright'
import { join } from 'node:path'
import { MARKETING, identitaet, svc } from './ep-lib.mjs'

const ZIELE = {
  e9: `${MARKETING}/`,
  e7: `${MARKETING}/kfzgutachter-lp`,
  e6: `${MARKETING}/kfz-gutachter/koeln`,
}
const id = process.argv[2]
if (!ZIELE[id]) { console.error('e6 | e7 | e9'); process.exit(1) }

const ident = identitaet(id.toUpperCase())
const TEL = process.env.EP_TELEFON || '+491633628571'
const NAME = `${ident.vorname} ${ident.nachname}`
console.log(`\n### ${id.toUpperCase()} — ${ZIELE[id]}`)
console.log('Name:', NAME)

const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'de-DE' })).newPage()
const posts = []
page.on('response', async (r) => {
  if (r.request().method() !== 'POST') return
  const u = r.url()
  if (u.includes('analytics') || u.includes('googletagmanager') || u.includes('doubleclick')) return
  posts.push({ url: u.slice(0, 90), status: r.status() })
})
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 160)) })

await page.goto(ZIELE[id], { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})
await page.waitForTimeout(3000)

const idx = await page.evaluate(() => {
  const s = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const f = [...document.querySelectorAll('form')].map((x, i) => ({ i, n: [...x.querySelectorAll('input')].filter(s).length })).sort((a, b) => b.n - a.n)[0]
  return f ? f.i : -1
})
const form = page.locator('form').nth(idx)
await form.scrollIntoViewIfNeeded()
await page.waitForTimeout(1000)

await form.locator('input#name, input[placeholder*="Mustermann"]').first().fill(NAME)
await form.locator('input#phone, input[type="tel"]').first().fill(TEL)
const ort = form.locator('input[placeholder*="PLZ"], input[placeholder*="Köln"]').first()
await ort.click()
await ort.pressSequentially('Köln', { delay: 120 })
await page.waitForTimeout(3000)
const opt = page.locator('[role="option"], li, button').filter({ hasText: /^Köln, Nordrhein/i }).first()
if (await opt.count()) await opt.click()
await page.waitForTimeout(1200)

const werte = await form.evaluate((f) => [...f.querySelectorAll('input')].map((el) => ({ typ: el.type, wert: el.value })))
console.log('Formular gefuellt:', JSON.stringify(werte))

const btn = page.getByRole('button', { name: /Jetzt kostenlosen Rückruf erhalten/i }).first()
let echterKlick = true
try { await btn.click({ timeout: 8000 }) } catch {
  echterKlick = false
  console.log('⚠ echter Klick blockiert (Overlay) → JS-Klick zur Pruefung der Aktion')
  await btn.evaluate((el) => el.click())
}
console.log('Button per echtem Klick erreichbar:', echterKlick)
await page.waitForTimeout(7000)

console.log('POSTs (ohne Analytics):', JSON.stringify(posts))
const text = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
// Erfolgsmeldung NUR ausserhalb des Buttons suchen
const bestaetigung = /wir melden uns|rückruf ist unterwegs|vielen dank|in kürze bei ihnen|anfrage eingegangen/i.test(text)
console.log('Bestaetigungstext (ohne Button-Wortlaut):', bestaetigung ? 'JA' : 'nein')
await page.screenshot({ path: join(process.cwd(), `scripts/smoke/.ep-walk/${id}-rueckruf-danach.png`), fullPage: false })
console.log('Konsolenfehler:', konsole.length, konsole.slice(0, 2))
await browser.close()

await new Promise((r) => setTimeout(r, 7000))
const db = svc()
const { data: gfa } = await db.from('gutachter_finder_anfragen')
  .select('id, vorname, nachname, telefon, source, status, stadt_slug, schadenort, konvertiert_zu_lead_id, erstellt_am')
  .ilike('nachname', `%${ident.nachname}%`)
const { data: leads } = await db.from('leads')
  .select('id, vorname, nachname, telefon, source_channel, status')
  .ilike('nachname', `%${ident.nachname}%`)
console.log('\n=== DB (per NAME gesucht) ===')
console.log('Anfragen:', JSON.stringify(gfa))
console.log('Leads   :', JSON.stringify(leads))
