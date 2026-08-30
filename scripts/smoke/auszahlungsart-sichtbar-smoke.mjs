#!/usr/bin/env node
/**
 * Regel-4-Smoke: Sieht jede Rolle die Auszahlungsart des Claims? (PR #5746)
 *
 * OPERATIVES SOLL (aus der Fachlogik, nicht aus dem Code — Aaron 30.08.):
 *   Ein Schaden wird entweder REPARIERT oder FIKTIV abgerechnet. Diese Entscheidung
 *   bestimmt, was jede Beteiligte tut:
 *     - Der KUNDE muss sehen, worauf sein Vorgang laeuft.
 *     - Die WERKSTATT muss wissen, ob real repariert oder nur kalkuliert wird —
 *       bei fiktiv gibt es keinen Reparaturauftrag, wohl aber einen Kostenvoranschlag.
 *     - Der SACHVERSTAENDIGE muss es wissen, weil er bei fiktiver Abrechnung
 *       UPE-Zuschlaege und Verbringungskosten anders ausweist.
 *   Steht die Auszahlungsart nirgends, arbeiten drei Parteien auf verschiedenen Annahmen.
 *
 * NACHWEIS-GRENZE (ehrlich benannt): Die Auszahlungsart ist eine ANZEIGE — es gibt an
 * dieser Stelle kein Formular. Die echte Eingabe des Laufs ist der Login je Rolle
 * (tippen + absenden + Folgezustand). Das Setzen des Werts durch den Kunden laeuft im
 * /flow-Wizard und ist ein eigener Smoke.
 *
 * POSITIVKONTROLLE: Derselbe Detektor laeuft gegen einen zweiten Claim OHNE
 * Auszahlungsart. Meldet er dort ebenfalls einen Treffer, ist er blind — dann ist
 * jedes gruene Ergebnis oben wertlos.
 *
 * Start:  node --env-file=.env.local scripts/smoke/auszahlungsart-sichtbar-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const MIT = 'fbc10002-0000-4000-8000-000000000002'   // CLM-2026-00834 — geseedet auf fiktiv
const OHNE = 'fbc10004-0000-4000-8000-000000000004'  // CLM-2026-00837 — reparaturwunsch NULL
const SV = { mail: process.env.TEST_SV_EMAIL || 'test-sv@claimondo.de', pw: process.env.TEST_SV_PASSWORD || 'Claimondo2026!' }
const KUNDE = { mail: process.env.SMOKE_KUNDE_EMAIL || 'smoke-kunde@claimondo.de', pw: process.env.SMOKE_KUNDE_PASS || 'Claimondo2026!' }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const fehler = []
const pruefe = (bedingung, was) => {
  console.log(`   ${bedingung ? '✓' : '✗'} ${was}`)
  if (!bedingung) fehler.push(was)
}

// ── Ausgangszustand verifizieren (nicht annehmen) ──
{
  const { data } = await db.from('claims').select('id, claim_nummer, reparaturwunsch').in('id', [MIT, OHNE])
  const mit = (data ?? []).find((c) => c.id === MIT)
  const ohne = (data ?? []).find((c) => c.id === OHNE)
  console.log(`Ausgangszustand: ${mit?.claim_nummer}=${mit?.reparaturwunsch} | ${ohne?.claim_nummer}=${ohne?.reparaturwunsch ?? 'NULL'}`)
  if (mit?.reparaturwunsch !== 'fiktiv' || ohne?.reparaturwunsch) {
    console.error('ABBRUCH: Der Lauf braucht genau EINEN Claim mit und EINEN ohne Auszahlungsart.')
    process.exit(1)
  }
}

// Der Detektor: sucht die Auszahlungsart im SICHTBAREN Text (innerText, nicht HTML).
// Bewusst breit: das Label kann "Fiktive Abrechnung", "fiktiv" oder "Fiktivabrechnung" lauten —
// der Smoke prueft, ob die INFORMATION ankommt, nicht ob sie eine bestimmte Formulierung hat.
const findeAuszahlungsart = (text) => {
  const t = text.toLowerCase()
  return { fiktiv: /fiktiv/.test(t), reparatur: /\breparatur\b/.test(t) }
}

const browser = await chromium.launch({ headless: true })
const neuerKontext = async () => (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
const login = async (p, konto) => {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', konto.mail)
  await p.fill('input[type="password"]', konto.pw)
  await p.click('button[type="submit"]')
  // Auf den Zustandswechsel warten, nicht auf eine feste Frist: die Weiterleitung braucht
  // auf prod gelegentlich laenger — ein fixes Timeout meldet dann faelschlich "Login kaputt".
  try {
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 })
  } catch {
    throw new Error(`Login fehlgeschlagen (keine Weiterleitung in 45 s): ${konto.mail} — ${p.url()}`)
  }
  await p.waitForLoadState('networkidle').catch(() => {})
}
const seitenText = async (p, pfad) => {
  await p.goto(`${BASE}${pfad}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)   // Client-Nachladungen; "leer" und "noch nicht fertig" sehen gleich aus
  return p.evaluate(() => document.body.innerText)
}

try {
  // ── ① Sachverstaendiger ──
  console.log('\n① SV-Sicht')
  const svSeite = await neuerKontext()
  await login(svSeite, SV)
  const svMit = await seitenText(svSeite, `/gutachter/fall/${MIT}`)
  const svTrefferMit = findeAuszahlungsart(svMit)
  pruefe(svMit.length > 500, `Fallseite gerendert (${svMit.length} Zeichen)`)
  pruefe(svTrefferMit.fiktiv, 'SV sieht die Auszahlungsart „fiktiv"')

  // Positivkontrolle: derselbe Detektor auf dem Claim OHNE Auszahlungsart
  const svOhne = await seitenText(svSeite, `/gutachter/fall/${OHNE}`)
  const svTrefferOhne = findeAuszahlungsart(svOhne)
  pruefe(svOhne.length > 500, `Kontroll-Fallseite gerendert (${svOhne.length} Zeichen)`)
  pruefe(!svTrefferOhne.fiktiv, 'Positivkontrolle: OHNE Auszahlungsart meldet der Detektor NICHT „fiktiv"')

  // ── ② Kunde ──
  console.log('\n② Kunden-Sicht')
  const kundeSeite = await neuerKontext()
  await login(kundeSeite, KUNDE)
  const kundeMit = await seitenText(kundeSeite, `/kunde/faelle/${MIT}`)
  const kundeTreffer = findeAuszahlungsart(kundeMit)
  pruefe(kundeMit.length > 500, `Kunden-Claimseite gerendert (${kundeMit.length} Zeichen)`)
  pruefe(kundeTreffer.fiktiv, 'Kunde sieht die Auszahlungsart „fiktiv"')

  const kundeOhne = await seitenText(kundeSeite, `/kunde/faelle/${OHNE}`)
  pruefe(!findeAuszahlungsart(kundeOhne).fiktiv, 'Positivkontrolle (Kunde): OHNE Auszahlungsart kein „fiktiv"')

  // Belegtexte fuer den PR — der zusammenhaengende Block, nicht gefilterte Einzelzeilen
  // (eine Zeilenfilterung hatte am 29.08. Werte gegeneinander verschoben und beinahe
  // einen Label-Bug gemeldet, den es nicht gab).
  const auszug = (t) => t.split('\n').map((z) => z.trim()).filter(Boolean)
    .filter((z) => /fiktiv|abrechnung|auszahlung/i.test(z)).slice(0, 6)
  console.log('\nBelegtext SV:   ', JSON.stringify(auszug(svMit)))
  console.log('Belegtext Kunde:', JSON.stringify(auszug(kundeMit)))
} catch (err) {
  // Nicht abstuerzen: ein Crash verschluckt genau die Bilanz, die der Lauf liefern soll.
  console.error('\nAbbruch:', err.message)
  fehler.push(`Ausnahme: ${err.message}`)
} finally {
  await browser.close()
}

console.log(`\n${'─'.repeat(60)}`)
if (fehler.length === 0) {
  console.log('ERGEBNIS: alle Prüfungen grün.')
} else {
  console.log(`ERGEBNIS: ${fehler.length} Prüfung(en) rot:`)
  for (const f of fehler) console.log(`  ✗ ${f}`)
}
process.exit(fehler.length ? 1 : 0)
