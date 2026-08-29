// E8 · /check (Anspruchs-Pruefung) — der letzte Einstieg des Sweeps.
//
// Der erste Anlauf (28.08.) meldete "kein <form> gefunden" und blieb offen. Das war eine
// MESSFRAGE, kein Produktbefund: der Funnel ist state-basiert (3 Options-Fragen -> Ergebnis
// -> Kontaktfelder) und ruft die Server-Action submitCheckLead direkt auf. Eine Heuristik,
// die "das <form> mit den meisten Feldern" sucht, findet dort nichts.
//
// Gefahren wird der volle Weg mit echter Eingabe: 3 Fragen klicken, Kontaktdaten tippen,
// Ortsvorschlag WAEHLEN (nicht blind tippen — genau daran hing der Koeln->Duesseldorf-Bug
// #5709), absenden, Folgezustand lesen. Danach DB-Gegenprobe: Lead? FlowLink? Claim?
//
// Identitaet: das Formular erhebt KEINE E-Mail (nur Name/Telefon/Ort). Die uebliche
// @claimondo.de-Markierung greift hier also nicht — der Marker sitzt im NAMEN, damit der
// Cleanup ihn findet. Kunden-Comms sind trotzdem kein Risiko: notify-new-lead sendet
// ausschliesslich an WA_EMPFAENGER (feste Team-Nummern), nie an den Melder.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync } from 'node:fs'

const MARKER = 'EPSWEEP'
const NAME = `${MARKER} Achtcheck`
const TEL = process.env.EP_TELEFON || '+491633628571'
const ORT_EINGABE = 'Domkloster 4, 50667 Köln'
// Gegen prod (Default) ODER gegen einen lokalen Dev-Server (EP_BASE=http://localhost:3001),
// um einen Fix VOR dem Merge zu beweisen statt erst nach dem Deploy.
const BASE = process.env.EP_BASE || 'https://claimondo.de'
const URL = `${BASE}/check`
const NUR_UI = process.env.EP_NUR_UI === '1' // lokal: keine DB-Gegenprobe (schreibt in prod)
const SHOTS = 'scripts/smoke/.ep-shots'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  return createClient(url, key, { auth: { persistSession: false } })
}

mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const protokoll = []
const log = (s) => { console.log(s); protokoll.push(s) }

await page.goto(URL, { waitUntil: 'networkidle' })
log(`[1] ${URL} geladen — Titel: ${await page.title()}`)

// Auf die Interaktivitaet WARTEN, nicht einmal raten: "leer" und "noch nicht fertig" sehen
// identisch aus. Lokal kompiliert der Dev-Server das Client-Bundle erst beim ersten Aufruf.
await page.locator('button[type="button"]').filter({ hasText: '›' }).first()
  .waitFor({ state: 'visible', timeout: 90_000 })
  .catch(() => log('[1] ⚠ Funnel-Optionen auch nach 90 s nicht sichtbar'))

// ── Die drei Fragen ────────────────────────────────────────────────────────
// Jeweils die ERSTE Option: gegner (unverschuldet) / unter_woche / nein (kein Gutachten).
// Das ist exakt der nur_gutachter-Haftpflicht-Fall, den der Sweep durchspielt.
//
// ⚠ NICHT generisch nach button[type="button"] greifen: der erste Anlauf traf damit den
// SPRACHWAEHLER (🇩🇪) statt der Funnel-Optionen — dieselbe Falle, die im Sweep-Doc schon
// steht. Die Options-Buttons tragen als einzige ein '›'-Span (CheckFunnelClient.tsx:192).
for (let frage = 1; frage <= 3; frage++) {
  // Der Fortschritt steht als "Schritt X von Y" im Funnel — erst warten, dann greifen.
  await page.waitForTimeout(700)
  const optionen = page.locator('button[type="button"]').filter({ hasText: '›' })
  const sichtbar = []
  const n = await optionen.count()
  for (let i = 0; i < n; i++) {
    const el = optionen.nth(i)
    if (await el.isVisible()) sichtbar.push({ el, text: (await el.innerText()).trim() })
  }
  if (sichtbar.length === 0) { log(`[2.${frage}] KEINE Optionen sichtbar — Abbruch`); break }
  log(`[2.${frage}] Optionen: ${sichtbar.map((s) => `"${s.text}"`).join(' | ')}`)
  await sichtbar[0].el.click()
  log(`[2.${frage}] geklickt: "${sichtbar[0].text}"`)
}

await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOTS}/e8-nach-fragen.png`, fullPage: true })

// ── Kontaktfelder ──────────────────────────────────────────────────────────
const nameFeld = page.locator('input[name="name"]')
if (await nameFeld.count() === 0) {
  log('[3] KEIN Kontaktformular erschienen — der Funnel endet vor der Lead-Erfassung')
} else {
  await nameFeld.fill(NAME)
  await page.locator('input[name="phone"]').fill(TEL)
  log(`[3] Name + Telefon getippt (${NAME} / ${TEL})`)

  // Ort: tippen und den VORSCHLAG waehlen. Blind Enter/ArrowDown waere genau der Fehler,
  // der beim Mini-Wizard "Altstadt" statt "Koeln" gespeichert hat.
  const ortFeld = page.locator('input[type="text"]').filter({ hasNot: page.locator('[name="name"]') }).last()
  await ortFeld.click()
  await ortFeld.type(ORT_EINGABE, { delay: 60 })
  await page.waitForTimeout(2200)
  // Die Vorschlaege sind <button type="button" class="w-full text-left …"> — NICHT <li>/[role=option].
  // Den echten Knoten treffen, sonst bleibt die Liste offen und der Befund waere ein Messfehler.
  const vorschlaege = page.locator('button[type="button"].text-left')
  const anzahl = await vorschlaege.count()
  if (anzahl > 0) {
    const txt = (await vorschlaege.first().innerText()).trim()
    await vorschlaege.first().click()
    log(`[4] Ortsvorschlag GEWAEHLT (${anzahl} angeboten): "${txt}"`)
  } else {
    log('[4] ⚠ kein Vorschlag sichtbar — Freitext bleibt stehen')
  }
  await page.waitForTimeout(1200)

  // ── Overlay-Messung: liegt nach der Auswahl noch etwas ueber dem Button? ──
  // Gemessen wird das VERHALTEN (was traefe ein echter Klick), nicht das Markup.
  const submit = page.locator('button[type="submit"]').first()
  const offeneListe = await vorschlaege.count()
  const treffer = await submit.evaluate((btn) => {
    const r = btn.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { tag: el?.tagName, text: (el?.textContent ?? '').trim().slice(0, 60), istButton: el === btn || btn.contains(el) }
  })
  log(`[5] Nach der Auswahl noch offene Vorschlaege: ${offeneListe}`)
  log(`[5] Klick auf die Button-Mitte traefe: <${treffer.tag}> "${treffer.text}" — Absende-Button? ${treffer.istButton ? 'JA' : 'NEIN ← VERDECKT'}`)
  await page.screenshot({ path: `${SHOTS}/e8-vor-absenden.png`, fullPage: true })

  // ── Absenden ─────────────────────────────────────────────────────────────
  // ⚠ Im NUR_UI-Modus NICHT absenden: der lokale Dev-Server haengt an der prod-DB,
  // ein Submit erzeugte dort einen echten Lead. Fuer den Fix-Beweis genuegt die
  // Overlay-Messung oben — sie ist der Kern der Aussage.
  if (NUR_UI) {
    log('[6] NUR_UI: nicht abgesendet (lokaler Server schreibt in die prod-DB)')
  } else {
  log(`[5] Absende-Button: "${(await submit.innerText()).trim()}"`)
  await submit.click({ timeout: 15000 }).catch(async (e) => {
    log(`[5] ⚠ normaler Klick abgefangen (${String(e.message).split('\n')[0]}) — weiche auf force aus`)
    await submit.click({ force: true })
  })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${SHOTS}/e8-nach-absenden.png`, fullPage: true })

  // Folgezustand: was SIEHT der Kunde? (innerText, nicht HTML — es geht um das Gerenderte)
  const sichtbarerText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900)
  log(`[6] Sichtbar nach dem Absenden: ${sichtbarerText}`)
  }
}

await browser.close()

// ── DB-Gegenprobe ──────────────────────────────────────────────────────────
if (NUR_UI) {
  console.log('\n──── PROTOKOLL (NUR_UI, keine DB-Gegenprobe) ────')
  console.log(protokoll.join('\n'))
  process.exit(0)
}
const db = svc()
// Spaltennamen nachgeschlagen, nicht geraten: leads hat vorname/nachname (kein `name`)
// und unfallort_ort/unfallort_plz/kunde_plz (kein `kunde_ort`).
const { data: leads, error } = await db
  .from('leads')
  .select('id, vorname, nachname, telefon, source_channel, unfallort, unfallort_plz, unfallort_ort, kunde_plz, created_at, status')
  .or(`vorname.ilike.%${MARKER}%,nachname.ilike.%${MARKER}%`)
  .order('created_at', { ascending: false })
  .limit(5)

if (error) { log(`[7] Lead-Query FEHLER: ${error.message}`) }
else if (!leads?.length) { log('[7] KEIN Lead mit Marker entstanden') }
else {
  for (const l of leads) {
    log(`[7] Lead ${l.id} · ${l.vorname} ${l.nachname} · kanal=${l.source_channel} · status=${l.status}`)
    log(`     ort: unfallort=${l.unfallort} unfallort_plz=${l.unfallort_plz} unfallort_ort=${l.unfallort_ort} kunde_plz=${l.kunde_plz}`)
    const { data: fls } = await db.from('flow_links').select('id, token').eq('lead_id', l.id)
    log(`     FlowLinks: ${fls?.length ?? 0}${fls?.length ? ` (${fls[0].token})` : ' ← KEIN Weg zurueck in den Vorgang'}`)
    const { data: cl } = await db.from('claims').select('id, claim_nummer').eq('lead_id', l.id)
    log(`     Claims: ${cl?.length ?? 0}${cl?.length ? ` (${cl[0].claim_nummer})` : ''}`)
    const { data: na } = await db.from('nachrichten').select('id, kanal, richtung').eq('lead_id', l.id).limit(10)
    log(`     Nachrichten am Lead: ${na?.length ?? 0}`)
  }
}

console.log('\n──── PROTOKOLL ────')
console.log(protokoll.join('\n'))
