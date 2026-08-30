#!/usr/bin/env node
/**
 * Regel-4-Smoke: der ganze Termin-Verlegungs-Workflow (Aaron 29.08.).
 *
 * SOLL (Fachlogik, nicht aus dem Code gelesen):
 *   ① Ein bestätigter Termin wird vom SV verlegt. Der Kunde SIEHT den Vorschlag.
 *   ② Der Kunde nimmt an — der neue Termin gilt, der alte ist weg.
 *   ③ Das muss WIEDERHOLBAR sein: ein bestätigter Termin ist kein Endzustand.
 *
 * Alles per UI (echte Logins, echte Eingaben, echte Klicks über beide Rollen).
 * Nur der Ausgangszustand ist geseedet — ein bevorstehender bestätigter Termin.
 *
 * ⚠ Der Termin ist BEZUG-NATIV (`bezug_typ`+`bezug_id`, Legacy-Spalten NULL). Genau das
 * ist der scharfe Fall: zwei Bugs hingen daran (Waisen-Slot #5740, wirkungsloses
 * „Bestätigen" #5751). Ein Legacy-Termin würde beide NICHT zeigen.
 *
 *   node --env-file=.env.local scripts/smoke/termin-verlegung-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_BASE_URL || 'https://app.claimondo.de'
const FALL = 'fbc10002-0000-4000-8000-000000000002'   // CLAIMS.c2, gehört smoke-kunde@
const TERMIN = '3762b752-f9cb-4109-95c7-940f64abe31d'
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
const termineDesFalls = async () => {
  const { data } = await db.from('gutachter_termine')
    .select('id, status, start_zeit, bezug_typ, bezug_id, fall_id, claim_id, verlegung_quelle_id, cancelled_at')
    .or(`bezug_id.eq.${FALL},fall_id.eq.${FALL}`)
    .order('created_at', { ascending: false }).limit(6)
  return data ?? []
}

// ── Ausgangszustand: EIN bestätigter Termin in der Zukunft, bezug-nativ ──
{
  const start = new Date(Date.now() + 6 * 864e5); start.setUTCHours(9, 0, 0, 0)
  const u = await db.from('gutachter_termine')
    .update({ status: 'bestaetigt', start_zeit: start.toISOString(),
              end_zeit: new Date(start.getTime() + 90 * 60000).toISOString(),
              cancelled_at: null, verlegung_quelle_id: null, verlegung_grund: null })
    .eq('id', TERMIN).select('id')
  if (u.error || u.data.length !== 1) { console.error('Seed fehlgeschlagen:', u.error?.message); process.exit(1) }
  // Reste früherer Läufe stilllegen, damit „genau ein aktiver Termin" gilt.
  await db.from('gutachter_termine').update({ status: 'storniert' })
    .eq('verlegung_quelle_id', TERMIN).in('status', ['verlegung_pending', 'verlegt', 'bestaetigt'])
  const t = await db.from('gutachter_termine').select('status, bezug_typ, bezug_id').eq('id', TERMIN).maybeSingle()
  console.log('Seed:', JSON.stringify(t.data))
  if (!t.data?.bezug_id) { console.error('ABBRUCH: Termin ist nicht bezug-nativ — der Lauf wäre stumpf.'); process.exit(1) }
}

const browser = await chromium.launch({ headless: true })
const neuerKontext = async () => (await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' })).newPage()
const login = async (p, konto) => {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', konto.mail)
  await p.fill('input[type="password"]', konto.pw)
  await p.click('button[type="submit"]')
  // ⚠ NICHT nach festen 4 s auf die URL schauen: die Weiterleitung braucht auf prod
  // gelegentlich länger, dann steht dort noch `/login`, obwohl die Session längst besteht
  // (einmal als „Login fehlgeschlagen" fehldiagnostiziert — `auth.users.last_sign_in_at`
  // zeigte den erfolgreichen Login zur selben Minute). Auf den Zustandswechsel warten.
  try {
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 45000 })
  } catch {
    throw new Error(`Login fehlgeschlagen (keine Weiterleitung in 45 s): ${konto.mail} — ${p.url()}`)
  }
  await p.waitForLoadState('networkidle').catch(() => {})
  await p.waitForTimeout(2500)
}
const svVerlegt = async (p, tageVoraus, grund) => {
  await p.goto(`${BASE}/gutachter/fall/${FALL}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(6000)
  const trigger = p.getByRole('button', { name: /^Termin verlegen$/ }).first()
  // Kein Absturz, wenn der Button fehlt: das ist selbst ein Befund (nach einem
  // fehlgeschlagenen Schritt ② gibt es keinen bestaetigten Termin mehr zum Verlegen).
  // Ein harter Throw wuerde die Bilanz am Ende verschlucken — genau das hat schon beim
  // zb1-Smoke den eigentlichen Nachweis verhindert.
  if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false))) return null
  await trigger.click()
  await p.waitForTimeout(4000)
  const d = new Date(Date.now() + tageVoraus * 864e5)
  const wert = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T14:00`
  await p.locator('input[type="datetime-local"]').first().fill(wert)
  const g = p.getByPlaceholder(/Grund für die Verlegung/i).first()
  if (await g.count()) await g.fill(grund)
  await p.waitForTimeout(1000)
  await p.getByRole('button', { name: /^Vorschlag senden$/i }).first().click()
  await p.waitForTimeout(9000)
  return wert
}

try {
  // ─── ① SV verlegt ───────────────────────────────────────────────────
  console.log('\n① SV verlegt per UI')
  const svSeite = await neuerKontext()
  await login(svSeite, SV)
  const wert1 = await svVerlegt(svSeite, 9, 'E2E Schritt 1: SV schlaegt neuen Termin vor')
  console.log(`   getippt: ${wert1}`)
  let t = await termineDesFalls()
  const pending1 = t.find((x) => x.status === 'verlegung_pending')
  pruefe(t.find((x) => x.id === TERMIN)?.status === 'verlegt', 'alter Termin steht auf verlegt')
  pruefe(!!pending1, 'ein verlegung_pending-Slot existiert')
  pruefe(!!pending1 && !!(pending1.bezug_id ?? pending1.fall_id ?? pending1.claim_id),
         'der neue Slot hat einen Fallbezug (sonst Waise — #5740)')

  // ─── ② Kunde sieht den Vorschlag und nimmt an ───────────────────────
  console.log('\n② Kunde sieht den Vorschlag und bestätigt')
  const kundeSeite = await neuerKontext()
  await login(kundeSeite, KUNDE)
  await kundeSeite.goto(`${BASE}/kunde/faelle/${FALL}`, { waitUntil: 'networkidle' })
  await kundeSeite.waitForTimeout(8000)
  const text = await kundeSeite.locator('body').innerText()
  pruefe(/möchte den Termin verlegen/i.test(text), 'das Verlegungs-Banner ist sichtbar')
  const btn = kundeSeite.getByRole('button', { name: /^Verlegung bestätigen$/i }).first()
  pruefe(await btn.count() > 0, 'der Bestätigen-Button ist da')
  if (await btn.count()) { await btn.click(); await kundeSeite.waitForTimeout(11000) }

  t = await termineDesFalls()
  pruefe(t.find((x) => x.id === pending1?.id)?.status === 'bestaetigt',
         'der neue Termin ist jetzt bestaetigt (sonst wirkungsloser Klick — #5751)')
  pruefe(t.find((x) => x.id === TERMIN)?.status === 'verschoben', 'der alte Termin ist verschoben')

  // ─── ③ Erneut verlegen — ein bestaetigter Termin ist kein Endzustand ─
  console.log('\n③ SV verlegt ERNEUT (Wiederholbarkeit)')
  const wert2 = await svVerlegt(svSeite, 13, 'E2E Schritt 3: zweite Verlegung')
  pruefe(wert2 !== null, 'ein bestaetigter Termin ist erneut verlegbar (Button vorhanden)')
  if (wert2) {
    console.log(`   getippt: ${wert2}`)
    t = await termineDesFalls()
    const pending2 = t.find((x) => x.status === 'verlegung_pending')
    pruefe(!!pending2 && pending2.id !== pending1?.id, 'eine ZWEITE Verlegung wurde angelegt')
    pruefe(!!pending2 && !!(pending2.bezug_id ?? pending2.fall_id ?? pending2.claim_id),
           'auch der zweite Slot hat einen Fallbezug')
  }
} finally {
  await browser.close()
}

console.log('\n' + '='.repeat(64))
console.log(fehler.length === 0
  ? '✅ GRUEN — verschieben, annehmen, erneut verschieben laufen durch.'
  : `❌ ROT — ${fehler.length} Prüfung(en) fehlgeschlagen:\n  - ` + fehler.join('\n  - '))
console.log('='.repeat(64))
process.exit(fehler.length === 0 ? 0 : 1)
