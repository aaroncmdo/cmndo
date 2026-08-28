// /flow/[token] — der Konvergenzpunkt. Faehrt den Wizard bis zum Claim,
// Variante "Nur Gutachten" (service_typ='nur_gutachter').
//
// Aufruf: node --env-file=… scripts/smoke/ep-flow.mjs <token> [--headed] [--max=N]
//
// Der Walker ist selbstbeobachtend: er protokolliert bei JEDEM Schritt, was die Seite
// anbietet, fuellt was leer ist, trifft die Weichen bewusst und klickt Weiter. So faellt
// eine Aenderung im Wizard sofort auf, statt in einem Timeout zu enden.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP, svc } from './ep-lib.mjs'

const token = process.argv[2]
if (!token) { console.error('Token fehlt'); process.exit(1) }
const headed = process.argv.includes('--headed')
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=22').split('=')[1])

const SHOTS = join(process.cwd(), 'scripts/smoke/.ep-walk')
mkdirSync(SHOTS, { recursive: true })

const HERGANG =
  'Ich stand an der roten Ampel. Der Fahrer hinter mir bremste zu spaet und fuhr mir mit etwa 20 km/h ins Heck. Stossfaenger und Heckklappe sind eingedrueckt, die Heckscheibe hat einen Riss.'
const KENNZEICHEN = process.env.EP_KENNZEICHEN || 'K-EP1234'

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 200 : 0 })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'de-DE' })
const page = await ctx.newPage()
const konsole = []
page.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text().slice(0, 200)) })

await page.goto(`${APP}/flow/${token}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForLoadState('networkidle', { timeout: 40_000 }).catch(() => {})
await page.waitForTimeout(2500)

const protokoll = []

async function lage() {
  return page.evaluate(() => {
    const sichtbar = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const txt = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ')
    return {
      titel: [...document.querySelectorAll('h1,h2,h3,legend')].filter(sichtbar).map(txt).filter(Boolean).slice(0, 6),
      felder: [...document.querySelectorAll('input,textarea,select')].filter(sichtbar).map((el) => ({
        tag: el.tagName.toLowerCase(), typ: el.getAttribute('type') || '', name: el.getAttribute('name') || '',
        ph: el.getAttribute('placeholder') || '', wert: (el.value || '').slice(0, 40),
        leer: !el.value, label: (el.labels?.[0]?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      })),
      buttons: [...document.querySelectorAll('button')].filter(sichtbar)
        .map((el) => ({ text: txt(el).slice(0, 90), aus: el.disabled })).filter((b) => b.text),
      canvas: document.querySelectorAll('canvas').length,
      // ⚠ lang genug: mit 400 Zeichen lag die Service-Wahl ausserhalb des Auszugs und
      // die Weiche wurde nie erkannt — der Walker lief am Kernschritt vorbei.
      body: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000),
    }
  })
}

/** Klickt eine Option ueber ihren VOLLEN Titel (Substring-Matches treffen sonst daneben). */
async function waehle(titel) {
  for (const sel of [
    page.getByRole('radio', { name: new RegExp(titel, 'i') }),
    page.locator('button', { hasText: titel }),
    page.locator('label', { hasText: titel }),
    page.getByText(titel, { exact: false }),
  ]) {
    if (await sel.count()) { await sel.first().click(); return true }
  }
  return false
}

for (let schritt = 1; schritt <= MAX; schritt++) {
  const l = await lage()
  const titel = l.titel.join(' | ')
  console.log(`\n═══ Schritt ${schritt} ═══ ${titel}`)
  console.log('  Felder :', l.felder.map((f) => `${f.tag}[${f.typ}]${f.name ? '#' + f.name : ''}${f.leer ? '(leer)' : '=' + f.wert}${f.label ? ' <' + f.label + '>' : ''}`).join('  ') || '—')
  console.log('  Buttons:', [...new Set(l.buttons.map((b) => b.text + (b.aus ? '[aus]' : '')))].slice(0, 14).join(' | '))
  if (l.canvas) console.log('  Canvas :', l.canvas)
  protokoll.push({ schritt, titel, felder: l.felder, buttons: l.buttons.map((b) => b.text), body: l.body })
  await page.screenshot({ path: join(SHOTS, `flow-${String(schritt).padStart(2, '0')}.png`), fullPage: true }).catch(() => {})

  // ── Endzustand? (praezise: der Abschluss-Screen, nicht irgendein "abgeschlossen" im Text) ──
  if (/Ihr Fall wurde angelegt|Wir haben alles|Vielen Dank für Ihren Auftrag|Fall-Nummer/i.test(l.body)) {
    console.log('\n>>> Endzustand erreicht.')
    break
  }
  // Schleifen-Erkennung: derselbe Titel zum dritten Mal = wir kommen nicht weiter
  const gleicheTitel = protokoll.filter((p) => p.titel === titel).length
  if (gleicheTitel >= 3) {
    console.log(`\n✖ SCHLEIFE: "${titel}" zum ${gleicheTitel}. Mal — Abbruch.`)
    break
  }

  // ── Weichen bewusst stellen ──────────────────────────────────────────────
  const b = l.body

  // Service-Wahl: DIE Weiche dieses Auftrags. Erkennung ueber die BUTTONS (der Body-Auszug
  // reicht nicht immer bis dorthin) — die Karte traegt Titel + Beschreibung in einem Button.
  const serviceBtn = l.buttons.find((x) => /Nur Gutachten/i.test(x.text) && !x.aus)
  const schonGewaehlt = await page.evaluate(() =>
    document.querySelector('[data-feld="service_typ"][data-value="nur_gutachter"]')?.getAttribute('data-active') === 'true',
  )
  if (serviceBtn && !schonGewaehlt) {
    const vorher = await page.evaluate(() => /Anwalt-Wahl|Partnerkanzlei/i.test(document.body.innerText))
    const karte = page.locator('button').filter({ hasText: 'Nur Gutachten' }).first()
    await karte.click()
    console.log('  → Service-Wahl "Nur Gutachten" geklickt')
    await page.waitForTimeout(1800)
    const nachher = await page.evaluate(() => /Anwalt-Wahl|Partnerkanzlei/i.test(document.body.innerText))
    console.log(`  → Anwalt-Frage: vorher ${vorher ? 'sichtbar' : 'aus'} / nachher ${nachher ? 'SICHTBAR (Befund!)' : 'aus (korrekt)'}`)
    // Auswahl am DOM gegenpruefen, nicht nur "geklickt" behaupten
    const gewaehlt = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Nur Gutachten/i.test(x.innerText))
      return b ? { aria: b.getAttribute('aria-pressed'), cls: (b.className || '').slice(0, 120) } : null
    })
    console.log('  → Zustand der Karte:', JSON.stringify(gewaehlt))
  }

  // Reparatur-Intent bewusst setzen: `brauchtWerkstattVermittlung` verlangt
  // reparaturwunsch ∈ {reparatur, fiktiv}. Ohne diese Antwort lehnt die Server-Action
  // jede Werkstattwahl ab — der Step wird aber trotzdem angezeigt.
  if (/Reparatur oder Auszahlung/i.test(b)) {
    const rep = page.locator('button').filter({ hasText: 'Reparatur (in der Werkstatt)' }).first()
    if (await rep.count()) {
      await rep.click()
      console.log('  → Reparatur-Intent: "Reparatur (in der Werkstatt)"')
      await page.waitForTimeout(1500)
    }
  }

  // Quali-Step: Schuldfrage nachfragen (greift, wenn der Einstieg sie nicht erhoben hat —
  // z.B. der Gutachter-Finder). ⚠ VOLLER Optionstitel: "Der Unfallgegner", nicht "Der Gegner";
  // ein Substring-Match traf hier schon einmal die Option "Noch unklar" ("n·ich·t eindeutig").
  if (/Wer hat den Unfall verursacht|Wer ist schuld|Schuldfrage/i.test(b) && !/Service-Umfang/i.test(b)) {
    const opt = page.locator('button').filter({ hasText: 'Der Unfallgegner' }).first()
    if (await opt.count()) {
      await opt.click()
      console.log('  → Schuldfrage: "Der Unfallgegner" (Haftpflicht-Weg)')
      await page.waitForTimeout(2500)
      continue
    }
    await waehle('Der Gegner ist schuld')
    await page.waitForTimeout(800)
  }

  // ── Felder fuellen ───────────────────────────────────────────────────────
  for (const f of l.felder) {
    if (!f.leer) continue
    const beschriftung = `${f.name} ${f.ph} ${f.label}`.toLowerCase()
    const loc = f.name
      ? page.locator(`[name="${f.name}"]`).first()
      : f.ph
        ? page.locator(`[placeholder="${f.ph}"]`).first()
        : null
    if (!loc || !(await loc.count())) continue
    try {
      if (f.typ === 'checkbox') continue // separat (aria-hidden-Fallen)
      else if (/kennzeichen/.test(beschriftung)) await loc.fill(KENNZEICHEN)
      else if (f.tag === 'textarea' || /hergang|passiert|beschreib/.test(beschriftung)) await loc.fill(HERGANG)
      else if (/telefon/.test(beschriftung)) await loc.fill(process.env.EP_TELEFON || '+491633628571')
      else if (/mail/.test(beschriftung)) continue // vorbefuellt lassen
      else if (f.typ === 'date') await loc.fill(new Date(Date.now() - 864e5).toISOString().slice(0, 10))
      else if (/adresse|stra|ort|wo steht/.test(beschriftung)) {
        await loc.click()
        await loc.pressSequentially('Domkloster 4, 50667 Köln', { delay: 80 })
        await page.waitForTimeout(2800)
        const opt = page.locator('[role="option"], li').filter({ hasText: /Domkloster/i }).first()
        if (await opt.count()) await opt.click()
        else await page.keyboard.press('Escape')
        await page.waitForTimeout(800)
        console.log('  → Adresse gesetzt, Feldwert:', JSON.stringify(await loc.inputValue()))
      }
    } catch (e) { console.log(`  ! Feld ${f.name || f.ph}: ${String(e).slice(0, 80)}`) }
  }

  // ── Checkboxen (aria-hidden ueberspringen) ───────────────────────────────
  const boxen = page.locator('input[type="checkbox"]:not([aria-hidden="true"])')
  const nBoxen = await boxen.count()
  for (let i = 0; i < nBoxen; i++) {
    const cb = boxen.nth(i)
    if (!(await cb.isChecked().catch(() => true))) await cb.check({ timeout: 5000 }).catch(async () => {
      // Fallback ueber das Label (custom controls)
      const id = await cb.getAttribute('id')
      if (id) await page.locator(`label[for="${id}"]`).click().catch(() => {})
    })
  }

  // ── Signatur-Canvas ──────────────────────────────────────────────────────
  if (l.canvas > 0 && /unterschrift|signatur|unterschreiben/i.test(b)) {
    const cv = page.locator('canvas').first()
    const box = await cv.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 40, box.y + box.height * 0.6)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(box.x + 40 + i * (box.width - 80) / 12, box.y + box.height * (0.6 + 0.22 * Math.sin(i)))
      }
      await page.mouse.up()
      console.log('  → Signatur gezeichnet')
      await page.waitForTimeout(900)
    }
  }

  // ── Terminwahl: Slot-Buttons tragen Datum+Uhrzeit als Text ("Fr., 28.08., 10:20 Uhr") ──
  if (/Gutachter-Termin|Wunschtermin|Termin wählen/i.test(b)) {
    const schonVersucht = protokoll.filter((p) => /Gutachter-Termin/.test(p.titel)).length
    const gescheitert = /konnte leider nicht abgeschlossen/i.test(b)
    if (gescheitert || schonVersucht > 1) {
      // Regulaerer Ausweg des Kunden, wenn kein Termin zustande kommt.
      const spaeter = page.getByRole('button', { name: /Termin lieber später vereinbaren/i }).first()
      if (await spaeter.count()) {
        console.log('  → Buchung nicht moeglich → "Termin lieber später vereinbaren"')
        await spaeter.click()
        await page.waitForTimeout(3500)
        continue
      }
    }
    const slot = page.locator('button').filter({ hasText: /\d{2}\.\d{2}\.,?\s*\d{1,2}:\d{2}\s*Uhr/ }).first()
    if (await slot.count()) {
      const t = (await slot.innerText()).trim().replace(/\s+/g, ' ')
      await slot.click()
      console.log(`  → Slot gewaehlt: "${t}"`)
      await page.waitForTimeout(3500)
      const danach = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
      if (/konnte leider nicht abgeschlossen/i.test(danach)) {
        console.log('  ⚠ BEFUND: Buchung abgelehnt — Meldung: "Diese Buchung konnte leider nicht abgeschlossen werden"')
      }
      continue
    }
  }

  // ── Werkstattwahl: "Auswählen" schreibt nichts (belegt: reparatur_werkstatt_id blieb
  // nach 3 Klicks null). Einmal versuchen, dann den Kundenweg "Überspringen" nehmen. ──
  if (/Wählen Sie Ihre Werkstatt/i.test(b)) {
    const versuche = protokoll.filter((p) => /Wählen Sie Ihre Werkstatt/.test(p.titel)).length
    if (versuche >= 2) {
      const skip = page.getByRole('button', { name: /^Überspringen/i }).first()
      if (await skip.count()) {
        console.log('  ⚠ BEFUND: "Auswählen" ohne Wirkung → "Überspringen"')
        await skip.click()
        await page.waitForTimeout(3000)
        continue
      }
    }
  }

  // ── Weiter ───────────────────────────────────────────────────────────────
  const weiter = page.getByRole('button', { name: /^(Weiter|Absenden|Bestätigen|Fertig|Jetzt unterschreiben|Unterschreiben|SA unterzeichnen|Speichern|Auswählen|Termin bestätigen|Ohne Termin fortfahren|Termin lieber später vereinbaren|Diesen Gutachter beauftragen|Auftrag erteilen|Konto erstellen|Später)/i })
  const nW = await weiter.count()
  if (!nW) {
    console.log('  ✖ kein Weiter-Button — Ende des fahrbaren Wegs.')
    break
  }
  let geklickt = false
  for (let i = 0; i < nW; i++) {
    const btn = weiter.nth(i)
    if (await btn.isDisabled().catch(() => true)) continue
    const t = (await btn.innerText()).trim()
    await btn.click()
    console.log(`  → geklickt: "${t}"`)
    geklickt = true
    break
  }
  if (!geklickt) {
    console.log('  ✖ alle Weiter-Buttons deaktiviert — Blocker. Sichtbarer Text:')
    console.log('   ', b.slice(0, 300))
    break
  }
  await page.waitForTimeout(3500)
}

console.log('\nKonsolenfehler:', konsole.length)
if (konsole.length) console.log(konsole.slice(0, 5))
writeFileSync(join(SHOTS, `flow-protokoll-${token.slice(0, 8)}.json`), JSON.stringify(protokoll, null, 2))
await browser.close()

// ── DB-Gegenprobe ──
const db = svc()
const { data: fl } = await db.from('flow_links').select('lead_id, status').eq('token', token).maybeSingle()
if (fl?.lead_id) {
  const { data: lead } = await db.from('leads').select('id, email, status, service_typ, kanzlei_wunsch, schuldfrage, kennzeichen, unfallhergang, unfallskizze_svg, sa_unterschrieben').eq('id', fl.lead_id).maybeSingle()
  const { data: claims } = await db.from('claims').select('id, claim_nummer, operative_status, service_typ, kanzlei_wunsch, abrechnungsweg, sa_unterschrieben, sv_id').eq('lead_id', fl.lead_id)
  const { data: term } = await db.from('gutachter_termine').select('id, status, start_zeit, assignee_id, bezug_typ').eq('bezug_id', fl.lead_id)
  console.log('\n=== DB nach Flow ===')
  console.log('FlowLink-Status:', fl.status)
  console.log('Lead  :', JSON.stringify({ ...lead, unfallhergang: lead?.unfallhergang?.slice(0, 50), unfallskizze_svg: lead?.unfallskizze_svg ? `${lead.unfallskizze_svg.length}B` : null }, null, 2))
  console.log('Claims:', JSON.stringify(claims, null, 2))
  console.log('Termine:', JSON.stringify(term, null, 2))
}
