// Schreibt das Startseiten-Formular ueberhaupt?
//
// Anlass (30.08.): Die Tabelle `anfragen` enthaelt ueber die GESAMTE Historie genau EINE Zeile
// (claimondo-check, 14.07., ein Test). Ueber `claimondo-home-hero` und `kfzgutachter-ads-lp`
// ist NIE eine Anfrage entstanden. Zwei Erklaerungen sind moeglich und sehen in der DB
// identisch aus:
//   a) es kommt kein Traffic     -> Formular in Ordnung, Marketing-Frage
//   b) der Write ist tot         -> jeder Interessent ging verloren
// Trennen laesst sich das nur, indem man es AUSFUELLT UND ABSENDET.
//
// Der Lauf erzeugt einen echten Lead auf prod. Deshalb: erkennbarer Marker im Namen, und
// danach ep-cleanup.mjs. Es gehen keine Kunden-Comms raus — notifyNewLead sendet an feste
// Team-Empfaenger, nicht an den Melder.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.EP_BASE || 'https://claimondo.de'
const PFAD = process.env.EP_PFAD || '/'
const MARKER = 'EPSWEEP'
const NAME = `${MARKER} Startseite`
const TEL = process.env.EP_TELEFON || '+491633628571'
const ORT = 'Domkloster 4, 50667 Köln'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase-ENV fehlt')
  return createClient(url, key, { auth: { persistSession: false } })
}

const db = svc()
const vorher = await db.from('anfragen').select('id', { count: 'exact', head: true })
console.log(`anfragen VOR dem Lauf: ${vorher.count}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'de-DE' })
const posts = []
page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url().slice(0, 90)) })
const fehler = []
page.on('pageerror', (e) => fehler.push(String(e.message).slice(0, 120)))

await page.goto(BASE + PFAD, { waitUntil: 'networkidle', timeout: 90_000 })
await page.waitForTimeout(2000)

const form = page.locator('[data-tracking^="lead-form"]').first()
if (!(await form.count())) { console.log('🔴 KEIN Lead-Formular gefunden'); await browser.close(); process.exit(1) }

// Felder: die Formulare haben Name / Telefon / Ort (Ort per Autocomplete).
const felder = form.locator('input:visible')
const anzahl = await felder.count()
console.log(`Formular gefunden, ${anzahl} sichtbare Eingabefelder`)
for (let i = 0; i < anzahl; i++) {
  const f = felder.nth(i)
  const ph = (await f.getAttribute('placeholder')) || ''
  const name = (await f.getAttribute('name')) || ''
  const typ = (await f.getAttribute('type')) || 'text'
  console.log(`   [${i}] name="${name}" type="${typ}" placeholder="${ph.slice(0, 40)}"`)
}

// Name + Telefon anhand von type/placeholder, Ort ist das letzte Textfeld.
await form.locator('input[type="text"]:visible, input:not([type]):visible').first().fill(NAME)
const tel = form.locator('input[type="tel"]:visible').first()
if (await tel.count()) await tel.fill(TEL)

const ortFeld = form.locator('input[type="text"]:visible, input:not([type]):visible').last()
await ortFeld.click()
await ortFeld.fill('')
await ortFeld.type(ORT, { delay: 55 })
await page.waitForTimeout(2500)
const vorschlaege = page.locator('button[type="button"].text-left')
if (await vorschlaege.count()) {
  console.log(`Ortsvorschlag gewaehlt: "${(await vorschlaege.first().innerText()).trim()}"`)
  await vorschlaege.first().click()
} else {
  console.log('⚠ kein Ortsvorschlag — Freitext bleibt stehen')
}
await page.waitForTimeout(1000)

// Absenden. Den Button an eine Scroll-Position bringen, an der ihn nichts verdeckt
// (der StickyCallBar-Fix ist noch nicht auf prod) — ein echter Nutzer scrollt auch.
const submit = form.locator('button[type="submit"]').first()
await submit.evaluate((btn) => {
  const r = btn.getBoundingClientRect()
  window.scrollBy({ top: r.top - window.innerHeight * 0.45, behavior: 'instant' })
})
await page.waitForTimeout(600)
const frei = await submit.evaluate((btn) => {
  const r = btn.getBoundingClientRect()
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { frei: el === btn || btn.contains(el), text: (el?.textContent || '').trim().slice(0, 40) }
})
console.log(`Absende-Button: "${(await submit.innerText()).trim()}" — ${frei.frei ? 'frei' : `VERDECKT von "${frei.text}"`}`)

await submit.click({ timeout: 20_000 })
await page.waitForTimeout(7000)

const sichtbar = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
// Nur der Bereich um das Formular ist aussagekraeftig, nicht die ganze Seite.
const nahe = (await form.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
console.log(`\nFormular-Bereich nach dem Absenden:\n  ${nahe || '(Formular weg — meist das Erfolgs-Zeichen)'}`)
console.log(`\nPOSTs waehrend des Laufs: ${posts.length}`)
console.log(`Konsolen-Fehler: ${fehler.length}${fehler.length ? ' — ' + fehler[0] : ''}`)

await page.screenshot({ path: 'scripts/smoke/.ep-shots/startseite-nach-absenden.png', fullPage: false })
await browser.close()

// ── Die Wahrheit steht in der DB, nicht auf der Seite ──────────────────────
await new Promise((r) => setTimeout(r, 3000))
const nachher = await db.from('anfragen').select('id', { count: 'exact', head: true })
console.log(`\nanfragen NACH dem Lauf: ${nachher.count} (vorher ${vorher.count})`)

const { data: neu } = await db.from('anfragen')
  .select('id, quelle, kontakt_name, kontakt_telefon, kontakt_plz_oder_stadt, lead_id, konvertier_status, konvertier_fehler')
  .ilike('kontakt_name', `%${MARKER}%`).order('created_at', { ascending: false }).limit(3)
console.log('Neue Anfragen mit Marker:', JSON.stringify(neu ?? [], null, 2))

const { data: leads } = await db.from('leads')
  .select('id, vorname, nachname, source_channel, telefon, created_at')
  .or(`vorname.ilike.%${MARKER}%,nachname.ilike.%${MARKER}%`).order('created_at', { ascending: false }).limit(3)
for (const l of leads ?? []) {
  const { data: fl } = await db.from('flow_links').select('id, token').eq('lead_id', l.id)
  const { data: na } = await db.from('nachrichten').select('id, kanal, richtung').eq('lead_id', l.id)
  console.log(`Lead ${l.id} · ${l.vorname} ${l.nachname} · kanal=${l.source_channel}`)
  console.log(`   FlowLinks: ${fl?.length ?? 0}${fl?.length ? '' : '  ← kein Weg in die App'}`)
  console.log(`   Nachrichten am Lead: ${na?.length ?? 0}`)
}

console.log(`\n=== URTEIL ===`)
console.log(nachher.count > vorher.count
  ? '✅ Das Formular SCHREIBT. Die leere Historie ist dann eine Traffic-/Conversion-Frage, kein toter Write.'
  : '🔴 Das Formular schreibt NICHT — abgesendet, aber keine anfragen-Zeile entstanden.')
