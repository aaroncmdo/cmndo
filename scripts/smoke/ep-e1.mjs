// E1 — Marketing Mini-Wizard /schaden-melden, anonym, bis zum Lead + FlowLink.
// Danach ist der Weg identisch mit allen anderen Einstiegen (/flow), das faehrt ep-flow.mjs.
//
// Telefon bleibt LEER, solange die Form es zulaesst: eine erfundene Nummer koennte real
// vergeben sein, und dann ginge eine echte WhatsApp an einen Fremden.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKETING, identitaet, svc, zustand, zusammenfassung } from './ep-lib.mjs'

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-walk')
mkdirSync(SHOTS, { recursive: true })
const mitTelefon = process.argv.includes('--telefon')
const ident = identitaet('E1')
console.log('Identitaet:', ident.email, mitTelefon ? `| tel ${ident.telefon}` : '| tel LEER')

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })
const page = await ctx.newPage()
const konsole = []
const posts = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 200)) })
page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url().slice(0, 130)) })

await page.goto(`${MARKETING}/schaden-melden`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})

// Hydration abwarten: erst auf ein Element warten, dann agieren (count() liefert sonst 0)
const schuldOption = page.getByRole('radio').first()
await schuldOption.waitFor({ state: 'visible', timeout: 30_000 })

// ── Schuldfrage: voller Optionstitel (has-text matcht Substring + case-insensitiv) ──
await page.locator('label', { hasText: 'Der Gegner ist schuld' }).first().click()

// ── Unfalldatum: input[type=date] erwartet ISO ──
const gestern = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10)
await page.locator('#unfalldatum').fill(gestern)

// ── Unfallort: Google-Places braucht getippte Zeichen + Auswahl, nicht fill().
// ⚠ Blindes ArrowDown+Enter waehlt irgendeinen Vorschlag ("Domkloster 4, Köln" wurde so
// zu "Altstadt"). Deshalb die Vorschlagsliste LESEN und den passenden per Text treffen.
const ortFeld = page.locator('input[placeholder*="Stra"]').first()
await ortFeld.click()
await ortFeld.pressSequentially('Domkloster 4, 50667 Köln', { delay: 90 })
await page.waitForTimeout(3000)
const vorschlaege = await page.evaluate(() =>
  [...document.querySelectorAll('[role="option"], li, [class*="suggestion"], [class*="autocomplete"] div')]
    .map((el) => (el.innerText || '').trim())
    .filter((t) => t && t.length < 120 && /Domkloster|Köln/i.test(t))
    .slice(0, 6),
)
console.log('Places-Vorschlaege:', JSON.stringify(vorschlaege))
// Gezielt die OPTION treffen (role=option), nicht irgendeinen Text auf der Seite —
// getByText traf zuvor daneben und im Feld landete "Altstadt".
const option = page.locator('[role="option"]').filter({ hasText: /Domkloster/i }).first()
if (await option.count()) {
  console.log('  Option geklickt:', (await option.innerText()).replace(/\s+/g, ' '))
  await option.click()
} else {
  const liOption = page.locator('li').filter({ hasText: /Domkloster 4/i }).first()
  if (await liOption.count()) { await liOption.click() }
  else { console.log('  kein Domkloster-Vorschlag klickbar -> Freitext (fail-soft-Pfad)'); await page.keyboard.press('Escape') }
}
await page.waitForTimeout(1500)
const ortWert = await ortFeld.inputValue()
console.log('Unfallort im Feld NACH Auswahl:', JSON.stringify(ortWert))
if (ortWert && !/Domkloster/i.test(ortWert)) {
  console.log('  ⚠ BEFUND-KANDIDAT: gewaehlt wurde "Domkloster 4, 50667 Köln", im Feld steht etwas anderes.')
}

// ── Kontakt ──
await page.locator('#vorname').fill(ident.vorname)
await page.locator('#nachname').fill(ident.nachname)
await page.locator('#email').fill(ident.email)
// ⚠ Telefon ist hier PFLICHT (leeres Feld -> "Ungültiges Telefon-Format", Submit blockiert),
// obwohl die Kopfzeile "per WhatsApp ODER E-Mail" verspricht. Deshalb Aarons freigegebene
// Nummer — die Send-Isolation greift ohnehin ueber die interne @claimondo.de-Adresse.
await page.locator('#telefon').fill(process.env.EP_TELEFON || '+491633628571')

// ── DSGVO ── ⚠ die ERSTE Checkbox im DOM ist aria-hidden (Deko eines Custom-Controls);
// .check() laeuft dort in den Timeout. Ueber das Label gehen, das den Einwilligungstext traegt.
const dsgvoLabel = page.locator('label', { hasText: 'Ich willige ein' }).first()
if (await dsgvoLabel.count()) {
  await dsgvoLabel.click()
} else {
  await page.locator('input[type="checkbox"]:not([aria-hidden="true"])').first().check()
}
const gehakt = await page.evaluate(() =>
  [...document.querySelectorAll('input[type=checkbox]')].filter((c) => c.checked).length,
)
console.log('Gehakte Checkboxen:', gehakt)

await page.screenshot({ path: join(SHOTS, 'e1-vor-submit.png'), fullPage: true })

// ── Absenden: NICHT .first() auf submit (traefe in Portalen den Abmelden-Button) ──
const absenden = page.getByRole('button', { name: /Sicheren Link erhalten/i })
const n = await absenden.count()
console.log('Absende-Button gefunden:', n)
if (n !== 1) throw new Error(`Absende-Button nicht eindeutig (${n})`)
const vorherUrl = page.url()
await absenden.click()

// Folgezustand abwarten: Redirect ODER sichtbare Bestaetigung
await page.waitForURL((u) => u.toString() !== vorherUrl, { timeout: 45_000 }).catch(() => {})
await page.waitForTimeout(4000)
console.log('URL nach Submit:', page.url())
const sichtbar = await page.evaluate(() => (document.body?.innerText || '').slice(0, 600))
console.log('Seitentext:', sichtbar.replace(/\s+/g, ' ').slice(0, 300))
await page.screenshot({ path: join(SHOTS, 'e1-nach-submit.png'), fullPage: true })

console.log('\nPOSTs:', posts.length)
console.log('Konsolenfehler:', konsole.length, konsole.slice(0, 3))
await browser.close()

// ── DB-Gegenprobe: was ist wirklich entstanden? ──
await new Promise((r) => setTimeout(r, 6000)) // Skizze/Sends sind fire-and-forget
const db = svc()
const z = await zustand(db, ident.email)
console.log('\n=== DB-Zustand ===')
console.log(JSON.stringify(zusammenfassung(z), null, 2))
if (z.leads[0]) {
  const l = z.leads[0]
  console.log('Lead-Details:', JSON.stringify({ id: l.id, schuldfrage: l.schuldfrage, status: l.status, phase: l.phase, kennzeichen: l.kennzeichen }, null, 2))
}
if (z.flowLinks[0]) console.log('FlowLink-Token:', z.flowLinks[0].token)
console.log('Nachrichten:', JSON.stringify(z.nachrichten.map((n) => ({ kanal: n.kanal, status: n.status, tpl: n.template_key })), null, 2))
console.log('Mails:', JSON.stringify(z.mails.map((m) => ({ tpl: m.template, status: m.status })), null, 2))

writeFileSync(join(SHOTS, 'e1-ergebnis.json'), JSON.stringify({ ident, zustand: z }, null, 2))
console.log('\n-> scripts/smoke/.ep-walk/e1-ergebnis.json')
