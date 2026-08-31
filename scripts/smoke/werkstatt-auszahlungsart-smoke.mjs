#!/usr/bin/env node
/**
 * Regel-4-Smoke: Sieht die WERKSTATT die Auszahlungsart ihres Auftrags? (PR #5746)
 *
 * OPERATIVES SOLL (Fachlogik, Aaron 30.08.):
 *   Die Werkstatt muss wissen, ob der Schaden real repariert oder FIKTIV abgerechnet wird.
 *   Bei fiktiver Abrechnung gibt es keinen Reparaturauftrag — der Kunde laesst sich auf
 *   Gutachtenbasis auszahlen. Aaron ausdruecklich: auch dann wird eine Werkstatt
 *   vorgeschlagen und angeboten; sie muss die Auszahlungsart aber sehen, sonst plant sie
 *   eine Reparatur ein, die nie kommt.
 *
 * A/B AM SELBEN AUFTRAG (Positivkontrolle in ihrer staerksten Form):
 *   Lauf 1 mit reparaturwunsch='reparatur'  -> „Fiktiv" darf NICHT erscheinen
 *   Lauf 2 mit reparaturwunsch='fiktiv'     -> „Fiktiv" MUSS erscheinen
 *   Ein Detektor, der beide Male dasselbe meldet, ist blind — dann ist der Lauf wertlos.
 *
 * SICHERHEIT: CLM-2026-00816 ist ein Testdatensatz — Werkstatt „Test Werkstatt",
 * KEIN Kunde verknuepft, Lead-telefon NULL. Es kann keine Nachricht an echte
 * Empfaenger ausgeloest werden. Der Ausgangswert wird am Ende wiederhergestellt.
 *
 * Start:  node --env-file=.env.local scripts/smoke/werkstatt-auszahlungsart-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const CLAIM = '39734007-2680-44b9-b05a-4c317ae10bc7'   // CLM-2026-00816
const WERKSTATT = {
  mail: process.env.TEST_WERKSTATT_EMAIL || 'nicolas.kitta+testwerkstatt@claimondo.de',
  pw: process.env.TEST_WERKSTATT_PASSWORD || '',
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const fehler = []
const pruefe = (bedingung, was) => {
  console.log(`   ${bedingung ? '✓' : '✗'} ${was}`)
  if (!bedingung) fehler.push(was)
}

const setzeAuszahlungsart = async (wert) => {
  const { error } = await db.from('claims').update({ reparaturwunsch: wert }).eq('id', CLAIM)
  if (error) throw new Error(`Seed fehlgeschlagen: ${error.message}`)
  // Zuruecklesen: ein fehlerfreies UPDATE beweist nicht, dass der Wert steht.
  const { data } = await db.from('claims').select('reparaturwunsch').eq('id', CLAIM).single()
  if (data?.reparaturwunsch !== wert) throw new Error(`Seed nicht angekommen: ${data?.reparaturwunsch}`)
}

const { data: vorher } = await db.from('claims').select('claim_nummer, reparaturwunsch').eq('id', CLAIM).single()
console.log(`Ausgangszustand: ${vorher?.claim_nummer} = ${vorher?.reparaturwunsch}`)
const URSPRUNG = vorher?.reparaturwunsch ?? null

const browser = await chromium.launch({ headless: true })
let seite
try {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })
  seite = await ctx.newPage()

  await seite.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await seite.fill('input[type="email"]', WERKSTATT.mail)
  await seite.fill('input[type="password"]', WERKSTATT.pw)
  await seite.click('button[type="submit"]')
  try {
    await seite.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 })
  } catch {
    throw new Error(`Login fehlgeschlagen (keine Weiterleitung in 45 s) — ${seite.url()}`)
  }
  await seite.waitForLoadState('networkidle').catch(() => {})
  console.log(`   eingeloggt als Werkstatt → ${new URL(seite.url()).pathname}`)

  const auftragText = async () => {
    await seite.goto(`${BASE}/werkstatt/auftraege/${CLAIM}`, { waitUntil: 'networkidle' })
    await seite.waitForTimeout(2500)
    return seite.evaluate(() => document.body.innerText)
  }

  // ── Lauf 1: reparatur ──
  console.log('\n① Auftrag mit Auszahlungsart „reparatur"')
  await setzeAuszahlungsart('reparatur')
  const textA = await auftragText()
  pruefe(textA.length > 500, `Auftragsseite gerendert (${textA.length} Zeichen)`)
  const fiktivInA = /fiktiv/i.test(textA)
  pruefe(!fiktivInA, 'zeigt NICHT „fiktiv" (korrekt — es wird repariert)')

  // ── Lauf 2: fiktiv (Aarons kniffliger Fall) ──
  console.log('\n② Derselbe Auftrag, umgestellt auf „fiktiv"')
  await setzeAuszahlungsart('fiktiv')
  const textB = await auftragText()
  pruefe(textB.length > 500, `Auftragsseite gerendert (${textB.length} Zeichen)`)
  const fiktivInB = /fiktiv/i.test(textB)
  pruefe(fiktivInB, 'Werkstatt sieht die Auszahlungsart „fiktiv"')

  // Der A/B-Beweis: die Anzeige muss sich MIT dem Wert geaendert haben.
  pruefe(fiktivInA !== fiktivInB, 'A/B: die Anzeige folgt dem Wert (nicht konstant)')

  const auszug = (t) => t.split('\n').map((z) => z.trim()).filter(Boolean)
    .filter((z) => /fiktiv|reparatur|abrechnung/i.test(z)).slice(0, 5)
  console.log('\nBelegtext bei reparatur:', JSON.stringify(auszug(textA)))
  console.log('Belegtext bei fiktiv:   ', JSON.stringify(auszug(textB)))
} catch (err) {
  console.error('\nAbbruch:', err.message)
  fehler.push(`Ausnahme: ${err.message}`)
} finally {
  // Ausgangswert wiederherstellen — auch wenn der Lauf abgebrochen ist.
  try {
    await db.from('claims').update({ reparaturwunsch: URSPRUNG }).eq('id', CLAIM)
    const { data } = await db.from('claims').select('reparaturwunsch').eq('id', CLAIM).single()
    console.log(`\nZurueckgesetzt auf: ${data?.reparaturwunsch}`)
  } catch (e) { console.error('WARNUNG: Ruecksetzen fehlgeschlagen —', e.message) }
  await browser.close()
}

console.log(`\n${'─'.repeat(60)}`)
if (fehler.length === 0) console.log('ERGEBNIS: alle Prüfungen grün.')
else { console.log(`ERGEBNIS: ${fehler.length} rot:`); for (const f of fehler) console.log(`  ✗ ${f}`) }
process.exit(fehler.length ? 1 : 0)
