#!/usr/bin/env node
/**
 * Regel-4-Smoke zu #5772: Wird die Auszahlungsart im Kunden-Flow ERHOBEN?
 *
 * OPERATIVES SOLL (Aaron 30.08.): „die auszahlungsart soll vor dem gutachten erhoben
 * werden — und dann final durch das gutachten bestätigt oder eben abgeändert."
 *
 * Der Kunde durchlaeuft seinen FlowLink und wird VOR der Beauftragung gefragt, wie der
 * Schaden abgerechnet werden soll (Reparatur | fiktiv | noch offen). Bis #5772 wurde die
 * Frage NIE gestellt: sie ist seit 02.07. konfiguriert, war im Flow aber von einem
 * hartkodierten Filter ausgesperrt — messbar daran, dass 42 von 48 Haftpflicht-Claims
 * keinen Wert trugen, waehrend Kasko/Selbstzahler ihn zu 100 % hatten (dort wird er
 * ABGELEITET, nicht gefragt).
 *
 * ALLES PER UI: anonymer FlowLink, echte Klicks, echte Auswahl. Nur der Ausgangszustand
 * ist geseedet (auszahlungsart-erhebung-seed.mjs) — der Weg selbst wird geklickt.
 *
 * Voraussetzung: node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-seed.mjs
 *   node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
let seed = null
try { seed = JSON.parse(readFileSync('scripts/smoke/.auszahlungsart-erhebung-seed.json', 'utf8')) } catch { /* nicht geseedet */ }
if (!seed) { console.error('Kein Seed — zuerst auszahlungsart-erhebung-seed.mjs laufen lassen.'); process.exit(1) }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const fehler = []
const pruefe = (b, was) => { console.log(`   ${b ? '✓' : '✗'} ${was}`); if (!b) fehler.push(was) }
const leadWert = async () => {
  const { data } = await db.from('leads').select('reparaturwunsch').eq('id', seed.leadId).single()
  return data?.reparaturwunsch ?? null
}
/**
 * ⭐ Der Wert im LEAD beweist nur die halbe Kette. Kunde, Werkstatt und SV lesen
 * `claims.reparaturwunsch` — genau die Lücke, die #5761 geschlossen hat
 * (spiegleQualiAufClaim in speichereFeststellungFlow). Ein Lauf, der nur den Lead prüft,
 * wäre derselbe Fehler wie der, den er absichern soll: an der Schreib- statt an der
 * Lese-Stelle messen.
 */
const claimWert = async () => {
  if (!seed.claimId) return undefined
  const { data } = await db.from('claims').select('reparaturwunsch').eq('id', seed.claimId).single()
  return data?.reparaturwunsch ?? null
}

console.log(`Seed-Lead ${seed.leadId} — Startwert: ${await leadWert() ?? 'null'}`)

const browser = await chromium.launch({ headless: true })
const p = await (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
/** Klickt „Weiter" und wartet auf den Schrittwechsel. */
const weiter = async () => {
  const b = p.getByRole('button', { name: /^Weiter$/i }).first()
  if (!(await b.count())) return false
  await b.click()
  await p.waitForTimeout(4500)
  return true
}

try {
  // ── Schritt 1: Zusammenfassung (Datenschutz + Weiter) ──
  console.log('\n① Zusammenfassung')
  await p.goto(`${BASE}${seed.flowUrl}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(6000)
  pruefe(/Hallo Smoke/i.test(await p.evaluate(() => document.body.innerText)), 'FlowLink oeffnet (anon, kein Login)')
  const box = p.locator('input[type="checkbox"]').first()
  if (await box.count()) await box.check().catch(() => {})
  pruefe(await weiter(), 'Schritt 1 abgeschlossen')

  // ── Schritt 2..n: bis zum SA-Step durchklicken ──
  // Bewusst als Schleife mit Abbruch: die Zwischenschritte sind config-getrieben und
  // koennen sich aendern — der Lauf soll dann melden, WO er haengt, statt blind zu klicken.
  console.log('\n② Weiter bis zur Abrechnungsart-Frage')
  let gefunden = false
  for (let i = 0; i < 4 && !gefunden; i++) {
    const text = await p.evaluate(() => document.body.innerText)
    gefunden = /Wie möchtest du den Schaden abrechnen/i.test(text)
    if (gefunden) break
    console.log(`   … Schritt ${i + 2}: ${text.split('\n').map((z) => z.trim()).filter(Boolean).slice(2, 4).join(' / ').slice(0, 80)}`)
    // Pflichtfelder der Feststellung minimal befuellen, damit „Weiter" nicht blockt.
    for (const feld of await p.locator('textarea, input[type="text"]').all()) {
      if (!(await feld.inputValue().catch(() => 'x'))) await feld.fill('Smoke-Eingabe').catch(() => {})
    }
    if (!(await weiter())) break
  }
  pruefe(gefunden, 'die Frage „Wie möchtest du den Schaden abrechnen?" erscheint')

  if (gefunden) {
    // ── Die eigentliche Erhebung ──
    console.log('\n③ Auswahl treffen')
    const text = await p.evaluate(() => document.body.innerText)
    pruefe(/Fiktive Abrechnung/i.test(text), 'die Option „Fiktive Abrechnung" wird angeboten')
    pruefe(/Reparatur/i.test(text), 'die Option „Reparatur" wird angeboten')

    const karte = p.getByRole('button', { name: /Fiktive Abrechnung/i }).first()
    pruefe((await karte.count()) > 0, 'die Option ist anklickbar')
    if (await karte.count()) {
      await karte.click()
      await p.waitForTimeout(3000)
    }

    // ⚠ AN DER RICHTIGEN STELLE IM ABLAUF MESSEN: Der Feststellungs-Wizard speichert beim
    // SCHRITTWECHSEL, nicht beim Klick. Gemessen (31.08., prod):
    //     nach dem Klick   -> DB null,   0 POSTs
    //     nach „Weiter"    -> DB fiktiv, 1 POST
    // Der erste Lauf prüfte direkt nach dem Klick und meldete „Wert kommt nicht an" — ein
    // Messfehler, der wie ein Speicher-Bug aussah. Ein fehlender POST ist der Hinweis:
    // ohne Request kann nichts angekommen sein, also war der Auslöser noch nicht dran.
    pruefe((await leadWert()) === null, 'vor dem Schrittwechsel ist noch nichts gespeichert (erwartet)')
    await weiter()
    // Der Beweis ist der DB-Wert, nicht die Anzeige.
    pruefe((await leadWert()) === 'fiktiv', 'nach dem Schrittwechsel steht der Wert im Lead')
    // ⭐ Und die eigentliche Zusage: er erreicht die Tabelle, aus der die Anzeige liest.
    pruefe((await claimWert()) === 'fiktiv', 'der Wert erreicht den CLAIM (Kunde/Werkstatt/SV lesen dort)')
  }
} catch (err) {
  console.error(`\n   ✗ Abbruch: ${err.message}`)
  fehler.push(`Abbruch: ${err.message}`)
} finally {
  await browser.close()
}

console.log(`\n${'─'.repeat(64)}`)
if (fehler.length === 0) console.log('ERGEBNIS: alle Prüfungen grün.')
else { console.log(`ERGEBNIS: ${fehler.length} rot:`); for (const f of fehler) console.log(`  ✗ ${f}`) }
console.log('Aufräumen: node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-seed.mjs --clean')
process.exit(fehler.length ? 1 : 0)
