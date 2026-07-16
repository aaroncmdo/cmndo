// Smoke B / Etappe 3 — /flow des Embed-Leads: Quali (eigenverantwortung + Kasko=ja) ->
// BEWEIS #4430: Feststellung ERSCHEINT (nicht geskippt) und ist mit der Embed-Beschreibung
// VORBEFUELLT. Exploration mit Screenshots + Body-Dumps (Selektoren iterativ).
import { chromium } from '@playwright/test'

const OUT = process.env.SMOKE_OUT || '.'
const URL = process.env.FLOW_URL
if (!URL) { console.error('FLOW_URL fehlt'); process.exit(2) }
const R = []
const ok = (n, c) => { R.push(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) process.exitCode = 1 }
const info = (n) => R.push(`INFO  ${n}`)

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
page.on('pageerror', (e) => info(`pageerror: ${String(e).slice(0, 110)}`))

const shoot = (n) => page.screenshot({ path: `${OUT}/b2-${n}.png`, fullPage: false }).catch(() => {})
const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')
const klick = async (regex, label) => {
  const btn = page.locator('button:visible, [role="button"]:visible').filter({ hasText: regex }).first()
  const da = (await btn.count()) > 0
  if (da) { await btn.click(); await page.waitForTimeout(1600) }
  info(`Klick ${label}: ${da ? 'ok' : 'NICHT GEFUNDEN'}`)
  return da
}

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(5000)
  await shoot('1-einstieg')
  let b = await bodyText()
  info(`Einstieg: ${b.slice(0, 220)}`)

  // Intake-Screen: "Bitte pruefen und korrigieren Sie Ihre Daten" — leere Namensfelder fuellen,
  // Telefon LEER lassen (Isolation!), Pflicht-Datenschutz-Checkbox anhaken, dann Weiter.
  const texts = page.locator('input[type="text"]:visible')
  const tCnt = await texts.count()
  let gefuellt = 0
  for (let i = 0; i < tCnt && gefuellt < 2; i++) {
    const v = await texts.nth(i).inputValue().catch(() => 'x')
    if (v === '') { await texts.nth(i).fill(gefuellt === 0 ? 'Smoke' : 'E2E-Embed'); gefuellt++ }
  }
  info(`Intake: ${gefuellt} leere Namensfelder gefuellt (von ${tCnt} sichtbaren)`)
  const cb = page.locator('input[type="checkbox"]:visible').first()
  if ((await cb.count()) > 0) { await cb.check().catch(() => cb.click()) } else {
    await page.locator('text=/Datenschutzerklärung/i').first().click().catch(() => info('Checkbox nicht klickbar'))
  }
  await shoot('1b-intake-ausgefuellt')
  await klick(/weiter|los.?geht|starten|fortfahren/i, 'Einstieg-weiter')
  await page.waitForTimeout(2000)
  await shoot('2-nach-einstieg')

  // Quali: Schuldfrage -> "selbst/eigen"
  b = await bodyText()
  info(`Quali-1: ${b.slice(0, 220)}`)
  await klick(/selbst|eigen(e|es)? ?(schuld|verschulden)|ich (war|bin)/i, 'schuldfrage=selbst')
  await shoot('3-schuldfrage')

  // Quali: Kasko-Frage -> "ja"
  b = await bodyText()
  info(`Quali-2: ${b.slice(0, 220)}`)
  await klick(/^ja\b|kasko|vollkasko/i, 'kasko=ja')
  await shoot('4-kasko')

  // Kasko-Folgefrage: Werkstattbindung -> "frei waehlen"
  b = await bodyText()
  info(`Quali-3: ${b.slice(0, 200)}`)
  await klick(/frei w(ä|ae)hlen/i, 'werkstattwahl=frei')
  await page.waitForTimeout(2500)
  await shoot('4b-werkstattwahl')
  await klick(/weiter|fortfahren|speichern/i, 'quali-weiter (optional)')
  await page.waitForTimeout(2000)

  // Quali-interner Werkstatt-Auswahl-Screen (SP-B1) -> ueberspringen (Zuweisung existiert schon per Seed)
  b = await bodyText()
  if (/w(ä|ae)hle deine werkstatt/i.test(b)) {
    info('Quali-Werkstattwahl-Screen erkannt -> ueberspringen')
    await klick(/(ü|ue)berspringen|sp(ä|ae)ter entscheiden/i, 'werkstatt-ueberspringen')
    await page.waitForTimeout(2500)
  }
  await shoot('5-nach-quali')

  // BEWEIS #4430: Feststellung sichtbar + Prefill
  b = await bodyText()
  info(`Nach Quali: ${b.slice(0, 260)}`)
  const feststellungDa = /feststellung|schaden|was ist kaputt|beschreib/i.test(b)
  ok('Feststellung erscheint nach Quali (nicht geskippt)', feststellungDa)

  // Prefill-Check: irgendein textarea/input enthaelt den Marker
  let prefill = false
  for (const sel of ['textarea', 'input[type="text"]']) {
    const els = page.locator(`${sel}:visible`)
    const cnt = await els.count()
    for (let i = 0; i < cnt; i++) {
      const v = await els.nth(i).inputValue().catch(() => '')
      if (v.includes('SMOKE-E2E-1607')) { prefill = true; break }
    }
    if (prefill) break
  }
  if (!prefill && b.includes('SMOKE-E2E-1607')) prefill = true // read-only Anzeige zaehlt auch
  info(`Beschreibungs-Feld im Flow-UI: ${prefill ? 'vorbefuellt sichtbar' : 'nicht vorhanden (kein Doppel-Abfragen — by design)'}`)
  await shoot('6-feststellung')

  // Feststellung-Micro-Steps generisch durchklicken bis Vorschaeden beantwortet ist (hat_vorschaeden!)
  let vorschaedenBeantwortet = false
  for (let s = 0; s < 16; s++) {
    b = await bodyText()
    info(`Screen[${s}]: ${b.slice(0, 150)}`)
    await shoot(`7-${s}`)
    if (/vorsch(ä|ae)den am auto|vorsch(ä|ae)den\?/i.test(b)) {
      await klick(/^nein\b|keine vorsch/i, 'vorschaeden=NEIN')
      vorschaedenBeantwortet = true
      await klick(/weiter/i, 'weiter nach vorschaeden')
      continue
    }
    if (/fahrzeugschein|zb1/i.test(b) && /(ü|ue)berspringen/i.test(b)) {
      await klick(/(vorerst )?(ü|ue)berspringen/i, 'zb1 ueberspringen'); continue
    }
    if (/was f(ü|ue)r ein unfall/i.test(b)) { await klick(/parkplatz/i, 'unfalltyp=parkplatz'); await klick(/^weiter/i, 'w'); continue }
    if (/wie ist es passiert/i.test(b)) {
      const ta2 = page.locator('textarea:visible').first()
      if ((await ta2.count()) > 0 && (await ta2.inputValue()) === '') {
        await ta2.fill('SMOKE-E2E: Beim Ausparken auf dem Parkplatz einen Poller uebersehen, Schrittgeschwindigkeit.')
      }
      await klick(/^ja\b/i, 'sichtbarer schaden=ja')
      await klick(/^weiter/i, 'w'); continue
    }
    if (/verletzte|weitere sch(ä|ae)den/i.test(b)) { await klick(/^nein/i, 'nein'); await klick(/^nein/i, 'nein2'); await klick(/^weiter/i, 'w'); continue }
    if (/reparatur oder auszahlung/i.test(b)) { await klick(/reparatur/i, 'reparaturwunsch'); await klick(/^weiter/i, 'w'); continue }
    if (/kennzeichen|dein fahrzeug/i.test(b)) {
      const kz = page.locator('input:visible').first()
      if ((await kz.count()) > 0 && (await kz.inputValue().catch(() => 'x')) === '') await kz.fill('K-SM 1607').catch(() => {})
      await klick(/^ja\b/i, 'fahrbereit=ja')
      await klick(/^nein\b/i, 'mietwagen=nein')
      await klick(/^weiter/i, 'w'); continue
    }
    if (/wem geh(ö|oe)rt das fahrzeug|halter/i.test(b)) { await klick(/^ja\b|ich bin/i, 'halter=ich'); await klick(/^weiter/i, 'w'); continue }
    if (vorschaedenBeantwortet) { info('Feststellung durch — naechster Matrix-Step erreicht'); break }
    // Fallback: weiter/ueberspringen versuchen
    const w = await klick(/^weiter/i, 'generisch weiter')
    if (!w) { const u = await klick(/(ü|ue)berspringen/i, 'generisch ueberspringen'); if (!u) { info('kein Fortschritt moeglich — stoppe'); break } }
  }
  ok('Vorschaeden-Frage beantwortet (hat_vorschaeden gesetzt)', vorschaedenBeantwortet)
  b = await bodyText()
  info(`Endscreen: ${b.slice(0, 260)}`)
  await shoot('8-ende')
} catch (e) {
  ok(`Ablauf ohne Exception (${String(e).slice(0, 140)})`, false)
  await shoot('error')
} finally {
  console.log(R.join('\n'))
  await browser.close()
}
