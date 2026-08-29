// Gezielt: die Marketing-Lead-Formulare (Stadtseite, Startseite, Ads-Landing, /check).
// Sie teilen sich die Muster von StadtLeadFormClient / HomeLeadFormClient / LeadFormClient
// — und alle vier tragen `setCity(r.stadt || r.plz || r.adresse)` (Befund 1).
//
// Aufruf: node --env-file=… scripts/smoke/ep-marketing-form.mjs <e6|e7|e8|e9> [--headed]
//
// Der Walker arbeitet BEWUSST innerhalb des <form> mit den meisten Feldern — die
// generische Heuristik traf sonst die Seiten-Navigation (einmal den Sprachwähler "🇩🇪").

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKETING, identitaet, svc, zustand, zusammenfassung } from './ep-lib.mjs'

const id = process.argv[2]
const headed = process.argv.includes('--headed')
const URLS = {
  e6: `${MARKETING}/kfz-gutachter/koeln`,
  e7: `${MARKETING}/kfzgutachter-lp`,
  e8: `${MARKETING}/check`,
  e9: `${MARKETING}/`,
}
if (!URLS[id]) { console.error('e6 | e7 | e8 | e9'); process.exit(1) }

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-walk')
mkdirSync(SHOTS, { recursive: true })
const ident = identitaet(id.toUpperCase())
const TEL = process.env.EP_TELEFON || '+491633628571'
console.log(`\n### ${id.toUpperCase()} — ${URLS[id]}`)
console.log('Identitaet:', ident.email)

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 200 : 0 })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'de-DE' })).newPage()
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 160)) })

await page.goto(URLS[id], { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})
await page.waitForTimeout(3000)

/** Das Formular mit den meisten sichtbaren Feldern — das ist der Lead-Funnel. */
const formInfo = await page.evaluate(() => {
  const sichtbar = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const formen = [...document.querySelectorAll('form')].map((f, i) => ({
    i, n: [...f.querySelectorAll('input,textarea,select')].filter(sichtbar).length,
    text: (f.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  })).filter((f) => f.n > 0).sort((a, b) => b.n - a.n)
  return formen
})
console.log('Formulare:', JSON.stringify(formInfo.slice(0, 4)))
if (!formInfo.length) {
  console.log('KEIN Formular mit Feldern gefunden — Seite ist reiner CTA-Router.')
  await page.screenshot({ path: join(SHOTS, `${id}-kein-form.png`), fullPage: false })
  await browser.close(); process.exit(0)
}
const form = page.locator('form').nth(formInfo[0].i)

for (let runde = 1; runde <= 8; runde++) {
  const felder = await form.evaluate((f) =>
    [...f.querySelectorAll('input,textarea,select')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      .map((el, i) => ({ i, typ: el.type || el.tagName.toLowerCase(), name: el.name, ph: el.placeholder, ac: el.getAttribute('autocomplete') || '', leer: !el.value, wert: (el.value || '').slice(0, 30), label: (el.labels?.[0]?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40) })),
  )
  const buttons = await form.evaluate((f) =>
    [...f.querySelectorAll('button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 })
      .map((el) => ({ t: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60), aus: el.disabled })),
  )
  console.log(`\n── Runde ${runde} ──`)
  console.log('  Felder :', felder.map((f) => `${f.typ}${f.name ? '#' + f.name : ''}${f.leer ? '(leer)' : '=' + f.wert}${f.label ? ' <' + f.label + '>' : ''}${f.ph ? ' "' + f.ph + '"' : ''}`).join('  ') || '—')
  console.log('  Buttons:', buttons.map((b) => b.t + (b.aus ? '[aus]' : '')).join(' | '))
  await page.screenshot({ path: join(SHOTS, `${id}-form-${runde}.png`), fullPage: false }).catch(() => {})

  for (const f of felder) {
    if (!f.leer || f.typ === 'checkbox' || f.typ === 'radio' || f.typ === 'hidden') continue
    const b = `${f.name} ${f.ph} ${f.label} ${f.ac}`.toLowerCase()
    const loc = form.locator('input:visible, textarea:visible, select:visible').nth(f.i)
    try {
      if (/vorname|given/.test(b)) await loc.fill(ident.vorname)
      else if (/nachname|family/.test(b)) await loc.fill(ident.nachname)
      else if (/mail/.test(b)) await loc.fill(ident.email)
      else if (/telefon|tel|mobil|handy/.test(b)) await loc.fill(TEL)
      else if (/kennzeichen/.test(b)) await loc.fill(ident.kennzeichen)
      else if (/name/.test(b)) await loc.fill(`${ident.vorname} ${ident.nachname}`)
      else if (f.typ === 'date') await loc.fill(new Date(Date.now() - 864e5).toISOString().slice(0, 10))
      else if (/plz|ort|stadt|adresse|stra|wo /.test(b)) {
        await loc.click()
        await loc.pressSequentially('Domkloster 4, 50667 Köln', { delay: 80 })
        await page.waitForTimeout(2800)
        const opt = page.locator('[role="option"], li').filter({ hasText: /Domkloster/i }).first()
        if (await opt.count()) await opt.click(); else await page.keyboard.press('Escape')
        await page.waitForTimeout(1200)
        const wert = await loc.inputValue().catch(() => '?')
        console.log('  → Ortsfeld nach Auswahl:', JSON.stringify(wert),
          /Domkloster/i.test(wert) ? '(vollstaendig ✓)' : '⚠ VERKUERZT/ERSETZT')
      } else if (f.typ === 'textarea') await loc.fill('Auffahrunfall an der Ampel, Heck beschaedigt.')
    } catch (e) { console.log(`  ! Feld ${f.i}: ${String(e).slice(0, 70)}`) }
  }

  // Checkboxen im Formular (aria-hidden ueberspringen)
  const boxen = form.locator('input[type="checkbox"]:not([aria-hidden="true"])')
  for (let i = 0; i < (await boxen.count()); i++) {
    const cb = boxen.nth(i)
    if (!(await cb.isChecked().catch(() => true))) {
      await cb.check({ timeout: 4000 }).catch(async () => {
        const cid = await cb.getAttribute('id')
        if (cid) await page.locator(`label[for="${cid}"]`).click().catch(() => {})
      })
    }
  }
  // Radios: erste Option je Gruppe
  const radios = form.locator('input[type="radio"]')
  if (await radios.count()) await radios.first().check().catch(() => {})

  const aktiv = buttons.filter((b) => !b.aus && b.t)
  if (!aktiv.length) { console.log('  ✖ kein aktiver Button'); break }
  const ziel = aktiv.find((b) => /weiter|senden|absenden|erhalten|anfrage|prüfen|melden|kostenlos|jetzt/i.test(b.t)) || aktiv[0]
  const btn = form.locator('button').filter({ hasText: ziel.t.slice(0, 25) }).first()
  await btn.click().catch(() => {})
  console.log(`  → geklickt: "${ziel.t}"`)
  await page.waitForTimeout(4000)

  const jetzt = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
  if (/vielen dank|erhalten|melden uns|link versendet|kümmern uns|in kürze/i.test(jetzt.slice(0, 1200))) {
    console.log('  >>> Bestaetigung sichtbar')
    break
  }
  if (page.url() !== URLS[id]) { console.log('  → Redirect:', page.url()) }
}

await page.screenshot({ path: join(SHOTS, `${id}-form-ende.png`), fullPage: false }).catch(() => {})
console.log('\nEnd-URL:', page.url())
console.log('Konsolenfehler:', konsole.length, konsole.slice(0, 2))
await browser.close()

await new Promise((r) => setTimeout(r, 6000))
const db = svc()
const z = await zustand(db, ident.email)
console.log('\n=== DB ===')
console.log(JSON.stringify(zusammenfassung(z), null, 2))
if (z.leads[0]) {
  const l = z.leads[0]
  console.log('Ort-Achsen:', JSON.stringify({ unfallort: l.unfallort, plz: l.unfallort_plz, lat: l.unfallort_lat, standort: l.fahrzeug_standort_adresse }, null, 2))
}
if (z.flowLinks[0]) console.log('FlowLink:', z.flowLinks[0].token)
writeFileSync(join(SHOTS, `${id}-marketing-ergebnis.json`), JSON.stringify({ ident, zustand: z }, null, 2))
