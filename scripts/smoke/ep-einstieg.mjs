// Generischer Einstiegs-Fahrer: faehrt einen beliebigen oeffentlichen Meldeweg anonym
// bis zum Lead + FlowLink und meldet, was entstanden ist.
//
// Aufruf: node --env-file=… scripts/smoke/ep-einstieg.mjs <id> [--headed] [--max=N]
//   id = e4 | e5 | e6 | e7 | e8 | e9 | e2 (Rueckruf) | e11
//
// Danach: scripts/smoke/ep-flow.mjs <token>  (der gemeinsame Rest des Wegs)

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKETING, APP, identitaet, svc, zustand, zusammenfassung } from './ep-lib.mjs'

const id = process.argv[2]
const headed = process.argv.includes('--headed')
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=14').split('=')[1])

const ZIELE = {
  e2: { url: `${MARKETING}/schaden-melden`, frame: null, name: 'Rueckruf-Widget (Marketing)', start: 'Rückruf anfordern' },
  e4: { url: `${MARKETING}/gutachter-finden`, frame: 'embed/gutachter-finder', name: 'Gutachter-Finder (iframe)' },
  e5: { url: `${MARKETING}/werkstatt-finden`, frame: 'embed/werkstatt-finder', name: 'Werkstatt-Finder (iframe)' },
  e6: { url: `${MARKETING}/kfz-gutachter/koeln`, frame: 'embed/gutachter-finder', name: 'Stadtseite Koeln' },
  e7: { url: `${MARKETING}/kfzgutachter-lp`, frame: null, name: 'Ads-Landing' },
  e8: { url: `${MARKETING}/check`, frame: null, name: 'Anspruch pruefen' },
  e9: { url: `${MARKETING}/`, frame: null, name: 'Startseite' },
  e11: { url: `${MARKETING}/schaden-melden/selbstverschulden`, frame: 'embed', name: 'Selbstverschulden' },
  a1: { url: `${APP}/embed/gutachter-finder`, frame: null, name: 'Embed-Finder direkt' },
  a2: { url: `${APP}/embed/werkstatt-finder`, frame: null, name: 'Embed-Werkstatt direkt' },
}
const ziel = ZIELE[id]
if (!ziel) { console.error('Unbekannte ID. ' + Object.keys(ZIELE).join(' | ')); process.exit(1) }

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-walk')
mkdirSync(SHOTS, { recursive: true })
const ident = identitaet(id.toUpperCase())
const TEL = process.env.EP_TELEFON || '+491633628571'
const HERGANG = 'Ich stand an der roten Ampel, der Hintermann bremste zu spaet und fuhr mir ins Heck. Stossfaenger und Heckklappe sind eingedrueckt.'
console.log(`\n### ${id.toUpperCase()} — ${ziel.name}`)
console.log('Identitaet:', ident.email)

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 200 : 0 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })
const page = await ctx.newPage()
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 180)) })

await page.goto(ziel.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})

/** iframe gezielt adressieren UND auf Inhalt warten ("leer" != "noch nicht fertig"). */
async function ctxFrame() {
  if (!ziel.frame) return page.mainFrame()
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find((x) => x.url().includes(ziel.frame))
    if (f) {
      for (let j = 0; j < 15; j++) {
        const len = await f.evaluate(() => (document.body?.innerText || '').length).catch(() => 0)
        if (len > 200) return f
        await page.waitForTimeout(1000)
      }
      return f
    }
    await page.waitForTimeout(1000)
  }
  console.log('⚠ iframe nicht gefunden — messe das Hauptdokument')
  return page.mainFrame()
}
let F = await ctxFrame()
await page.waitForTimeout(2500)

// Optionaler Start-Klick (z.B. Rueckruf-Modal oeffnen)
if (ziel.start) {
  const b = page.getByRole('button', { name: new RegExp(ziel.start, 'i') }).first()
  if (await b.count()) { await b.click(); await page.waitForTimeout(2000); console.log(`→ Start-Klick "${ziel.start}"`) }
}

const protokoll = []
for (let s = 1; s <= MAX; s++) {
  const l = await F.evaluate(() => {
    const sichtbar = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' }
    const txt = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ')
    return {
      titel: [...document.querySelectorAll('h1,h2,h3,legend')].filter(sichtbar).map(txt).filter(Boolean).slice(0, 5),
      felder: [...document.querySelectorAll('input,textarea,select')].filter(sichtbar).map((el, i) => ({
        idx: i,
        typ: el.getAttribute('type') || el.tagName.toLowerCase(), name: el.getAttribute('name') || '',
        ph: el.getAttribute('placeholder') || '', leer: !el.value, wert: (el.value || '').slice(0, 30),
        label: (el.labels?.[0]?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 45),
        // autocomplete ist der stabilste Anker, wenn name/id/placeholder fehlen —
        // im Finder tragen die Kontaktfelder nur das (given-name/family-name/tel/email).
        ac: el.getAttribute('autocomplete') || '',
      })),
      buttons: [...new Set([...document.querySelectorAll('button')].filter(sichtbar).map((el) => txt(el) + (el.disabled ? '[aus]' : '')).filter((t) => t && t.length < 80))],
      body: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2000),
    }
  })
  console.log(`\n── Schritt ${s} ── ${l.titel.join(' | ')}`)
  console.log('  Felder :', l.felder.map((f) => `${f.typ}${f.name ? '#' + f.name : ''}${f.leer ? '(leer)' : '=' + f.wert}${f.label ? ' <' + f.label + '>' : ''}`).join('  ') || '—')
  console.log('  Buttons:', l.buttons.slice(0, 16).join(' | '))
  await page.screenshot({ path: join(SHOTS, `${id}-${String(s).padStart(2, '0')}.png`), fullPage: true }).catch(() => {})
  protokoll.push({ s, titel: l.titel, felder: l.felder, buttons: l.buttons })

  if (protokoll.filter((p) => p.titel.join() === l.titel.join()).length >= 3) {
    console.log('✖ SCHLEIFE — Abbruch'); break
  }
  if (/vielen dank|geschafft|erhalten|melden uns|kümmern uns/i.test(l.body) && !l.buttons.some((b) => /weiter|absenden|senden/i.test(b))) {
    console.log('>>> Bestaetigung erreicht'); break
  }

  // Felder fuellen. `adressGesetzt` merkt, ob dieser Schritt durch die Ortswahl bereits
  // weitergesprungen ist — danach zeigt `l.buttons` einen veralteten Stand (der Klick
  // lief sonst auf einen Uhrzeit-Chip, den es nicht mehr gibt).
  let adressGesetzt = false
  for (const f of l.felder) {
    if (!f.leer || f.typ === 'checkbox' || f.typ === 'radio') continue
    const b = `${f.name} ${f.ph} ${f.label} ${f.ac}`.toLowerCase()
    // Adressierung: name → placeholder → autocomplete → INDEX. `getByLabel(…, exact:false)`
    // war unbrauchbar (traf mehrere Felder, die E-Mail bekam den Namen).
    let loc = null
    if (f.name) loc = F.locator(`[name="${f.name}"]`).first()
    else if (f.ph) loc = F.locator(`[placeholder="${f.ph}"]`).first()
    else if (f.ac) loc = F.locator(`[autocomplete="${f.ac}"]`).first()
    else loc = F.locator('input:visible, textarea:visible').nth(f.idx)
    if (!loc || !(await loc.count().catch(() => 0))) continue
    try {
      if (/vorname|first/.test(b)) await loc.fill(ident.vorname)
      else if (/nachname|last/.test(b)) await loc.fill(ident.nachname)
      else if (/name/.test(b) && !/nach|vor|firma/.test(b)) await loc.fill(`${ident.vorname} ${ident.nachname}`)
      else if (/mail/.test(b)) await loc.fill(ident.email)
      else if (/telefon|mobil|handy|phone/.test(b)) await loc.fill(TEL)
      else if (/kennzeichen/.test(b)) await loc.fill(ident.kennzeichen)
      else if (/hersteller|marke/.test(b)) await loc.fill('BMW')
      else if (/modell/.test(b)) await loc.fill('3er')
      else if (f.typ === 'textarea' || /hergang|beschreib|nachricht|anliegen|passiert/.test(b)) await loc.fill(HERGANG)
      else if (f.typ === 'date') await loc.fill(new Date(Date.now() - 864e5).toISOString().slice(0, 10))
      else if (/adresse|stra|ort|plz|wo /.test(b)) {
        await loc.click(); await loc.pressSequentially('Domkloster 4, 50667 Köln', { delay: 70 })
        await page.waitForTimeout(2800)
        const opt = F.locator('[role="option"], li').filter({ hasText: /Domkloster/i }).first()
        if (await opt.count()) { await opt.click(); adressGesetzt = true } else await page.keyboard.press('Escape')
        await page.waitForTimeout(1500)
        const nachher = await loc.inputValue().catch(() => '(Feld weg)')
        console.log('  → Adressfeld nach Auswahl:', JSON.stringify(nachher))
      }
    } catch (e) { console.log(`  ! ${f.name || f.ph}: ${String(e).slice(0, 70)}`) }
  }

  if (adressGesetzt) {
    console.log('  → Ortswahl hat den Schritt weitergetragen')
    await page.waitForTimeout(2500)
    F = await ctxFrame()
    continue
  }

  // Erste Auswahl-Option treffen — bewusst NUR echte Radios. `[data-value]` traf im
  // Finder die Datums-Chips und setzte den gerade gewaehlten Ort zurueck.
  const optionen = F.locator('[role="radio"]')
  if (await optionen.count()) { await optionen.first().click().catch(() => {}) }

  // Checkboxen (aria-hidden ueberspringen — die erste im DOM ist oft Deko)
  const boxen = F.locator('input[type="checkbox"]:not([aria-hidden="true"])')
  for (let i = 0; i < (await boxen.count()); i++) {
    const cb = boxen.nth(i)
    if (!(await cb.isChecked().catch(() => true))) {
      await cb.check({ timeout: 4000 }).catch(async () => {
        const cid = await cb.getAttribute('id')
        if (cid) await F.locator(`label[for="${cid}"]`).click().catch(() => {})
      })
    }
  }

  // Termin-Slots tragen Datum+Uhrzeit im Text ("Fr., 28.08., 11:00 Uhr")
  const slot = F.locator('button').filter({ hasText: /\d{2}\.\d{2}\.,?\s*\d{1,2}:\d{2}\s*Uhr/ }).first()
  if (await slot.count()) {
    const t = (await slot.innerText()).trim().replace(/\s+/g, ' ')
    await slot.click()
    console.log(`  → Slot gewaehlt: "${t}"`)
    await page.waitForTimeout(3500)
    F = await ctxFrame()
    continue
  }

  // ⚠ "Termin ändern" darf NIE als Weiter gelten — es fuehrt zurueck und erzeugt eine
  // Endlosschleife (real passiert: reservieren ↔ ändern ↔ Schadentyp).
  const weiter = F.getByRole('button', { name: /^(Weiter|Absenden|Senden|Sicheren Link erhalten|Rückruf anfordern|Jetzt anfragen|Anfrage senden|Termin reservieren|Jetzt reservieren|Reservieren|Verbindlich|Kostenlos|Prüfen|Los)/i })
  const n = await weiter.count()
  let ok = false
  for (let i = 0; i < n; i++) {
    const btn = weiter.nth(i)
    if (await btn.isDisabled().catch(() => true)) continue
    const t = (await btn.innerText()).trim().replace(/\s+/g, ' ')
    await btn.click(); console.log(`  → geklickt: "${t}"`); ok = true; break
  }
  // Auswahl-Schritte ohne Weiter (Schadentyp, Ja/Nein): eine sinnvolle Option klicken.
  // Navigation, Modal-Schliesser und Rueckruf-CTA bewusst ausschliessen.
  if (!ok) {
    // Ausschluss-Liste: Navigation, Modal-Schliesser, Rueckruf-CTA — und alles, was einen
    // Datei-Dialog oder eine KI-Analyse startet statt den Schritt zu beantworten.
    // ("Fotos auswählen" liess den Werkstatt-Finder in einer Schleife stehen, weil der
    //  eigentlich verlangte Klick eine Schadens-KATEGORIE war.)
    const AUS = /^(zurück|beratung vereinbaren|×|x|anderer ort|abbrechen|schließen|überspringen|fotos auswählen|foto aufnehmen|beschreibung analysieren|unfallhergang einsprechen)$/i
    const wahl = l.buttons.map((t) => t.replace(/\[aus\]$/, '')).find((t) => !AUS.test(t.trim()) && t.length < 40 && !/\d{2}\.\d{2}\./.test(t))
    if (wahl) {
      const btn = F.locator('button').filter({ hasText: wahl }).first()
      if (await btn.count() && !(await btn.isDisabled().catch(() => true))) {
        await btn.click()
        console.log(`  → Auswahl geklickt: "${wahl}"`)
        await page.waitForTimeout(3000)
        F = await ctxFrame()
        continue
      }
    }
  }

  if (!ok) {
    // Kein Weiter-Button heisst nicht "Ende": manche Schritte gehen bei einer Auswahl
    // von selbst weiter (Finder springt nach der Ortswahl) oder laden gerade nach.
    // "Leer" und "noch nicht fertig" sehen identisch aus -> beobachten statt raten.
    const vorher = l.body.slice(0, 300)
    let veraendert = false
    for (let w = 0; w < 8; w++) {
      await page.waitForTimeout(2000)
      F = await ctxFrame()
      const jetzt = await F.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300)).catch(() => '')
      if (jetzt && jetzt !== vorher) { veraendert = true; break }
    }
    if (!veraendert) { console.log('  ✖ kein Weiter-Button und keine Veraenderung:', vorher.slice(0, 200)); break }
    console.log('  → Schritt lief ohne Klick weiter')
    continue
  }
  await page.waitForTimeout(3500)
  F = await ctxFrame()
}

console.log('\nKonsolenfehler:', konsole.length, konsole.slice(0, 2))
await page.waitForTimeout(2000)
await browser.close()

await new Promise((r) => setTimeout(r, 5000))
const db = svc()
const z = await zustand(db, ident.email)
console.log('\n=== DB ===')
console.log(JSON.stringify(zusammenfassung(z), null, 2))
if (z.flowLinks[0]) console.log('FlowLink-Token:', z.flowLinks[0].token)
if (z.leads[0]) console.log('Lead:', z.leads[0].id, '| unfallort:', JSON.stringify(z.leads[0].unfallort), '| standort:', JSON.stringify(z.leads[0].fahrzeug_standort_adresse))
console.log('WA/Mails:', z.nachrichten.length, '/', z.mails.length)
writeFileSync(join(SHOTS, `${id}-ergebnis.json`), JSON.stringify({ ident, protokoll, zustand: z }, null, 2))
