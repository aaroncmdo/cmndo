#!/usr/bin/env node
/**
 * Regel-4-Smoke: Auszahlungsart aendern — beide Rollen, und die Gutachten-Sperre.
 *
 * OPERATIVES SOLL (Aaron 30.08.):
 *   „beide sollen es ändern können. aber das gutachten ist final."
 *   „danach soll es nicht mehr änderbar sein."
 *
 *   1. Solange KEIN fertiges Gutachten vorliegt, darf der KUNDE die Abrechnungsart umstellen.
 *   2. Ebenso der SACHVERSTAENDIGE — er sieht den Schaden und erkennt z.B. einen
 *      Totalschaden, bei dem eine Reparatur nicht mehr sinnvoll ist.
 *   3. Sobald das Gutachten fertiggestellt ist, ist der Wert FINAL: keine der beiden
 *      Rollen aendert ihn noch.
 *   4. Jede Aenderung ist nachvollziehbar (Timeline: wer, wann, worauf).
 *
 * DER ENTSCHEIDENDE TEIL IST 3. Die Punkte 1+2 zeigen nur, dass etwas geht; erst der
 * gesperrte Zustand zeigt, dass die Zusage haelt. Der Lauf faehrt deshalb BEIDE Zustaende
 * am selben Claim: erst offen (Aenderung muss greifen), dann mit fertigem Gutachten
 * (Aenderung muss abprallen). Ein Lauf, der nur den offenen Zustand testet, wuerde eine
 * voellig fehlende Sperre nicht bemerken.
 *
 * SICHERHEIT: Fixture-Claim des Test-SV mit smoke-kunde@ als Kunde; telefon NULL.
 * Der Ausgangszustand (reparaturwunsch + ein evtl. gesetztes fertiggestellt_am) wird am
 * Ende wiederhergestellt und zurueckgelesen.
 *
 *   node --env-file=.env.local scripts/smoke/auszahlungsart-aendern-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const CLAIM = 'fbc10002-0000-4000-8000-000000000002' // CLM-2026-00834 — Test-SV + smoke-kunde@
const SV = { mail: process.env.TEST_SV_EMAIL || 'test-sv@claimondo.de', pw: process.env.TEST_SV_PASSWORD || '' }
const KUNDE = { mail: process.env.SMOKE_KUNDE_EMAIL || 'smoke-kunde@claimondo.de', pw: process.env.SMOKE_KUNDE_PASS || '' }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const fehler = []
const pruefe = (b, was) => { console.log(`   ${b ? '✓' : '✗'} ${was}`); if (!b) fehler.push(was) }
const lies = async () => {
  const { data } = await db.from('claims').select('reparaturwunsch').eq('id', CLAIM).single()
  return data?.reparaturwunsch ?? null
}

// ── Ausgangszustand sichern ──
const START_WERT = await lies()
const { data: gutachtenVorher } = await db
  .from('gutachten').select('id, fertiggestellt_am').eq('claim_id', CLAIM).limit(1).maybeSingle()
console.log(`Ausgangszustand: reparaturwunsch=${START_WERT}, Gutachten=${gutachtenVorher?.id ?? 'keins'} (fertig: ${gutachtenVorher?.fertiggestellt_am ?? 'nein'})`)

// Der Lauf braucht einen NICHT-finalen Ausgangszustand, sonst misst er nur die Sperre.
if (gutachtenVorher?.fertiggestellt_am) {
  const { error } = await db.from('gutachten').update({ fertiggestellt_am: null }).eq('id', gutachtenVorher.id)
  if (error) { console.error('Seed (entsperren) fehlgeschlagen:', error.message); process.exit(1) }
  console.log('   Gutachten fuer den Lauf voruebergehend auf "nicht fertig" gesetzt.')
}

const browser = await chromium.launch({ headless: true })
const neueSeite = async () => (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
const login = async (p, konto) => {
  const antwort = await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const status = antwort?.status() ?? 0
  if (status === 401) throw new Error(`${BASE} verlangt HTTP-Basic-Auth (401) — von hier nicht fahrbar.`)
  if ((await p.locator('input[type="email"]').count()) === 0) throw new Error(`Keine Login-Maske (HTTP ${status})`)
  await p.fill('input[type="email"]', konto.mail)
  await p.fill('input[type="password"]', konto.pw)
  await p.click('button[type="submit"]')
  try {
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 })
  } catch {
    throw new Error(`Login fehlgeschlagen: ${konto.mail} — ${p.url()}`)
  }
  await p.waitForLoadState('networkidle').catch(() => {})
}
/**
 * Klickt die Auswahl-Karte und wartet auf die Server-Antwort.
 *
 * ⚠ Der `name` einer Rollen-Abfrage ist der ACCESSIBLE NAME — und der enthaelt bei diesen
 * Karten Label UND Hinweiszeile ("Reparatur" + "Das Fahrzeug wird in einer Werkstatt instand
 * gesetzt."). Ein verankertes `^Reparatur$` matcht deshalb NIE. Genau daran ist der erste Lauf
 * gescheitert: Schritt 2 meldete "SV kann nicht klicken", obwohl Schritt 3 dieselbe Auswahl
 * fand — ein Testfehler, der wie ein Produktfehler aussah, plus drei Folgefehler.
 * Deshalb: Teilstring-Suche ohne Anker.
 */
const waehle = async (p, label) => {
  const karte = p.getByRole('button', { name: new RegExp(label, 'i') }).first()
  if (!(await karte.count())) return false
  if (await karte.isDisabled().catch(() => false)) return 'gesperrt'
  await karte.click()
  await p.waitForTimeout(4000)
  return true
}

try {
  // ─── ① Kunde aendert ──────────────────────────────────────────────
  console.log('\n① Kunde stellt auf „Fiktive Abrechnung" um')
  const kunde = await neueSeite()
  await login(kunde, KUNDE)
  await kunde.goto(`${BASE}/kunde/faelle/${CLAIM}`, { waitUntil: 'networkidle' })
  await kunde.waitForTimeout(4000)
  const kText = await kunde.evaluate(() => document.body.innerText)
  pruefe(/Abrechnungsart/i.test(kText), 'die Auswahl ist in der Kundenansicht sichtbar')
  const k1 = await waehle(kunde, 'Fiktive Abrechnung')
  pruefe(k1 === true, 'der Kunde kann die Auswahl anklicken')
  pruefe((await lies()) === 'fiktiv', 'der DB-Wert steht auf „fiktiv" (nicht nur die Anzeige)')

  // ─── ② SV aendert ─────────────────────────────────────────────────
  console.log('\n② Sachverständiger stellt zurück auf „Reparatur"')
  const sv = await neueSeite()
  await login(sv, SV)
  await sv.goto(`${BASE}/gutachter/fall/${CLAIM}`, { waitUntil: 'networkidle' })
  await sv.waitForTimeout(4000)
  const sText = await sv.evaluate(() => document.body.innerText)
  pruefe(/Abrechnungsart ändern/i.test(sText), 'die Auswahl ist in der SV-Fallakte sichtbar')
  // Der Hinweistext ist eindeutig — "Reparatur" allein kaeme auch in anderen Karten vor.
  const s1 = await waehle(sv, 'Das Fahrzeug wird in einer Werkstatt')
  pruefe(s1 === true, 'der SV kann die Auswahl anklicken')
  pruefe((await lies()) === 'reparatur', 'der DB-Wert steht auf „reparatur"')

  // ─── ③ Gutachten fertigstellen -> beide gesperrt ───────────────────
  console.log('\n③ Gutachten fertiggestellt — die Wahl ist final')
  if (!gutachtenVorher?.id) {
    console.log('   ⚠ Kein Gutachten am Fixture-Claim — Schritt 3 NICHT nachgewiesen.')
    fehler.push('Sperre nicht nachgewiesen (kein Gutachten am Fixture)')
  } else {
    const { error } = await db.from('gutachten')
      .update({ fertiggestellt_am: new Date().toISOString() }).eq('id', gutachtenVorher.id)
    if (error) throw new Error(`Gutachten-Seed fehlgeschlagen: ${error.message}`)

    await kunde.reload({ waitUntil: 'networkidle' })
    await kunde.waitForTimeout(3500)
    const kGesperrt = await kunde.evaluate(() => document.body.innerText)
    pruefe(/nicht mehr änderbar/i.test(kGesperrt), 'der Kunde sieht die Sperre BEGRÜNDET')
    const k2 = await waehle(kunde, 'Fiktive Abrechnung')
    pruefe(k2 === 'gesperrt', 'die Auswahl ist für den Kunden deaktiviert')

    await sv.reload({ waitUntil: 'networkidle' })
    await sv.waitForTimeout(3500)
    const s2 = await waehle(sv, 'Fiktive Abrechnung')
    pruefe(s2 === 'gesperrt', 'die Auswahl ist auch für den SV deaktiviert')

    // Der eigentliche Beweis: der Wert hat sich trotz zweier Versuche NICHT geaendert.
    pruefe((await lies()) === 'reparatur', 'der DB-Wert ist unverändert — die Sperre hält')
  }

  // ─── ④ Nachvollziehbarkeit ────────────────────────────────────────
  console.log('\n④ Protokoll')
  const { data: eintraege } = await db.from('timeline')
    .select('titel, beschreibung, created_at').eq('claim_id', CLAIM)
    .ilike('titel', '%Abrechnungsart%').order('created_at', { ascending: false }).limit(5)
  pruefe((eintraege?.length ?? 0) >= 2, `beide Änderungen stehen in der Timeline (${eintraege?.length ?? 0})`)
  for (const e of eintraege ?? []) console.log(`   · ${e.titel} — ${e.beschreibung}`)
} catch (err) {
  console.error(`\n   ✗ Abbruch: ${err.message}`)
  fehler.push(`Abbruch: ${err.message}`)
} finally {
  // Ausgangszustand wiederherstellen — auch nach Abbruch.
  try {
    await db.from('claims').update({ reparaturwunsch: START_WERT }).eq('id', CLAIM)
    if (gutachtenVorher?.id) {
      await db.from('gutachten')
        .update({ fertiggestellt_am: gutachtenVorher.fertiggestellt_am ?? null })
        .eq('id', gutachtenVorher.id)
    }
    const zurueck = await lies()
    console.log(`\nZurückgesetzt auf: ${zurueck} ${zurueck === START_WERT ? '✓' : '✗ ABWEICHUNG'}`)
  } catch (e) { console.error('WARNUNG: Ruecksetzen fehlgeschlagen —', e.message) }
  await browser.close()
}

console.log(`\n${'─'.repeat(64)}`)
if (fehler.length === 0) console.log('ERGEBNIS: alle Prüfungen grün.')
else { console.log(`ERGEBNIS: ${fehler.length} rot:`); for (const f of fehler) console.log(`  ✗ ${f}`) }
process.exit(fehler.length ? 1 : 0)
