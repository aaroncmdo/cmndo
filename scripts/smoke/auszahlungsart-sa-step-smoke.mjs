#!/usr/bin/env node
/**
 * Regel-4-Smoke: Greift der SA-Step-Zweig von #5772 — der ZWEITE Erhebungsort?
 *
 * WARUM ER NOETIG IST (prod-Messung 31.08.):
 *   Haftpflicht-Claims MIT Auszahlungsart:   6, davon 5 mit Feststellungs-Durchlauf (83 %)
 *   Haftpflicht-Claims OHNE Auszahlungsart: 23, davon 4 mit Feststellungs-Durchlauf (17 %)
 *   Alle 23 haben einen Claim — also wurde die SA unterschrieben, also HABEN sie den
 *   SA-Step erreicht. Sie haben die eine Frage im 11-teiligen Feststellungs-Wizard nur
 *   uebersprungen. Genau fuer sie ist der SA-Step der zweite Anlauf.
 *
 * DIESER LAUF prueft die andere Haelfte als auszahlungsart-erhebung-smoke.mjs:
 *   dort wird die Frage IM WIZARD beantwortet — hier wird sie dort UEBERSPRUNGEN,
 *   und der Lauf sieht nach, ob sie am SA-Step erneut gestellt wird.
 *
 * ⭐ Zugleich die Gegenprobe zur Doppelfrage-Behebung: hat der Kunde im Wizard geantwortet,
 *    darf sie am SA-Step NICHT mehr erscheinen (zweiter Durchlauf mit --beantwortet).
 *
 *   node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-seed.mjs
 *   node --env-file=.env.local scripts/smoke/auszahlungsart-sa-step-smoke.mjs
 *   node --env-file=.env.local scripts/smoke/auszahlungsart-sa-step-smoke.mjs --beantwortet
 *
 * ⚠⚠ STAND 31.08.: DIESER LAUF ERREICHT DEN SA-STEP NOCH NICHT — bewusst so dokumentiert
 * statt kaschiert (Regel 4: „nicht durch einen curl-Ersatz ersetzen").
 *
 * Fuenf Anlaeufe, drei davon in einen KURZSCHLUSS, der den Wizard komplett ueberspringt:
 *   1. `werkstatt_intake_am`      -> page.tsx:211 rendert WerkstattIntakeSignatur + return
 *   2. Claim vorab angelegt        -> Flow springt in die Signatur (Claim entsteht real erst
 *                                     BEIM Signieren — der Seed erzeugte einen unmoeglichen Zustand)
 *   3. `source_channel='gutachter-vermittlung'` -> page.tsx:326 signaturBenoetigtFallId + return
 * Mit `self_service` (dem realen Hauptweg) laeuft der Wizard korrekt an und die Frage
 * erscheint bei Schritt 4 — aber die folgenden Schritte (Adress-Autocomplete, Slot-Auswahl,
 * Gutachter-Wahl) lassen sich nicht generisch durchklicken; nach 20 Schritten war der SA-Step
 * nicht erreicht.
 *
 * WAS STATTDESSEN BELEGT IST (Datenebene, prod 31.08.): 17 der 24 Haftpflicht-Claims ohne
 * Auszahlungsart kamen ueber `self_service` — ALLE mit FlowLink, ALLE mit
 * `sa_unterschrieben=true`, KEINER mit Feststellung. Sie sind also am SA-Step vorbeigekommen,
 * und dort fehlte die Frage bis #5772. Die Luecke ist damit lokalisiert; der UI-Durchlauf
 * dieses einen Schritts steht aus.
 *
 * WAS ER BRAUCHT: gezielte Behandlung je Schritttyp statt eines generischen „Weiter"
 * (Adresse via Place-Picker, Termin-Slot, Gutachter-Auswahl) — ein eigenes Arbeitspaket.
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const VORAB_BEANTWORTET = process.argv.includes('--beantwortet')
let seed = null
try { seed = JSON.parse(readFileSync('scripts/smoke/.auszahlungsart-erhebung-seed.json', 'utf8')) } catch { /* nicht geseedet */ }
if (!seed) { console.error('Kein Seed — zuerst auszahlungsart-erhebung-seed.mjs laufen lassen.'); process.exit(1) }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const fehler = []
const pruefe = (b, was) => { console.log(`   ${b ? '✓' : '✗'} ${was}`); if (!b) fehler.push(was) }

// Variante B: die Frage gilt als im Wizard beantwortet -> am SA-Step darf sie NICHT kommen.
if (VORAB_BEANTWORTET) {
  const { error } = await db.from('leads').update({ reparaturwunsch: 'reparatur' }).eq('id', seed.leadId)
  if (error) { console.error('Vorbelegen fehlgeschlagen:', error.message); process.exit(1) }
  console.log('Modus: Frage im Wizard bereits beantwortet (reparatur) — am SA-Step erwartet: KEINE Frage.')
} else {
  console.log('Modus: Frage im Wizard übersprungen — am SA-Step erwartet: die Frage erscheint.')
}

const browser = await chromium.launch({ headless: true })
const p = await (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
const text = () => p.evaluate(() => document.body.innerText)

try {
  await p.goto(`${BASE}${seed.flowUrl}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(6000)
  const box = p.locator('input[type="checkbox"]').first()
  if (await box.count()) await box.check().catch(() => {})

  // Bis zum SA-Step klicken. Die Auszahlungsart-Frage wird dabei NICHT beantwortet —
  // genau das ist der Fall, den der SA-Step abfangen soll.
  let saErreicht = false
  let frageImWizard = false
  for (let i = 0; i < 14 && !saErreicht; i++) {
    const t = await text()
    if (/Wie möchtest du den Schaden abrechnen/i.test(t)) frageImWizard = true
    // Der SA-Step: Haftpflicht-Hinweis (seit 30.08. „Das Gutachten kommt zuerst") bzw. die
    // Abtretungs-Zusammenfassung. Bewusst zwei Marker — ein einzelner Text kann sich aendern.
    if (/Das Gutachten kommt zuerst|Schaden-?Abtretung|Abtretungserklärung/i.test(t)) { saErreicht = true; break }
    const w = p.getByRole('button', { name: /^Weiter$/i }).first()
    if (!(await w.count())) break
    await w.click()
    await p.waitForTimeout(3500)
  }

  console.log(`   (Frage im Wizard gesehen: ${frageImWizard ? 'ja' : 'nein'})`)
  pruefe(saErreicht, 'der SA-Step wird erreicht')

  if (saErreicht) {
    const t = await text()
    const frageDa = /Wie möchtest du den Schaden abrechnen/i.test(t)
    if (VORAB_BEANTWORTET) {
      pruefe(!frageDa, 'die Frage erscheint am SA-Step NICHT erneut (keine Doppelfrage)')
    } else {
      pruefe(frageDa, 'die Frage erscheint am SA-Step (zweiter Anlauf für Wizard-Überspringer)')
      if (frageDa) {
        const karte = p.getByRole('button', { name: /Fiktive Abrechnung/i }).first()
        if (await karte.count()) {
          await karte.click()
          await p.waitForTimeout(5000)
          const { data } = await db.from('leads').select('reparaturwunsch').eq('id', seed.leadId).single()
          pruefe(data?.reparaturwunsch === 'fiktiv', 'die Auswahl am SA-Step landet in der DB')
        }
      }
    }
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
process.exit(fehler.length ? 1 : 0)
