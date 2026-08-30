#!/usr/bin/env node
/**
 * Werkstatt-Angebot auch bei fiktiver Abrechnung (Aaron 29.08.).
 *
 * IST: `reparatur_vermittlung_status` (die Frage „Haben Sie eine Werkstatt / sollen wir eine
 * vermitteln?") traegt `conditional_on = { feld: 'reparaturwunsch', equals: 'reparatur' }`.
 * Bei `fiktiv` und `unentschieden` wird sie damit gar nicht gestellt.
 *
 * SOLL (Aaron): Auch wer sich die Gutachtensumme auszahlen laesst, bekommt eine Werkstatt
 * vorgeschlagen und angeboten — fiktive Abrechnung schliesst eine Reparatur nicht aus.
 *
 * AENDERUNG: `conditional_on` auf NULL — die Frage wird dann immer gestellt. Die vorhandenen
 * Optionen passen unveraendert („Ja, ich habe eine Werkstatt" / „Nein, bitte vermittelt mir eine").
 *
 * ⚠ Eine Config-Zeile ist auch eine Migration: sie wirkt SOFORT fuer alle Nutzer, ohne Deploy.
 * Hier ist die Richtung ungefaehrlich — ein Feld wird ZUSAETZLICH sichtbar, keines verschwindet,
 * und der Code kennt das Feld laengst (es ist nur eine Sichtbarkeits-Bedingung).
 * Siehe memory/BROADCAST-config-migration-wirkt-sofort-code-erst-nach-deploy.md
 *
 *   node --env-file=.env.local scripts/werkstattfrage-auch-bei-fiktiv.mjs          # Vorschau
 *   node --env-file=.env.local scripts/werkstattfrage-auch-bei-fiktiv.mjs --apply  # anwenden
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: felder, error } = await db
  .from('onboarding_felder')
  .select('id, feld_key, conditional_on, pflicht, phase_id')
  .eq('feld_key', 'reparatur_vermittlung_status')
if (error) { console.error('Lesefehler:', error.message); process.exit(1) }

const betroffen = (felder ?? []).filter(
  (f) => f.conditional_on && f.conditional_on.feld === 'reparaturwunsch',
)
console.log(`${felder.length} Feld-Definition(en) gefunden, ${betroffen.length} mit Bedingung auf reparaturwunsch:\n`)
for (const f of felder ?? []) {
  console.log(`  ${f.id}  conditional_on=${JSON.stringify(f.conditional_on)}`)
}

if (betroffen.length === 0) { console.log('\nnichts zu tun'); process.exit(0) }
if (!APPLY) {
  console.log(`\n→ wuerde bei ${betroffen.length} Feld(ern) conditional_on auf NULL setzen`)
  console.log('  (Vorschau — mit --apply schreiben)')
  process.exit(0)
}

const ids = betroffen.map((f) => f.id)
const { data: upd, error: updErr } = await db
  .from('onboarding_felder').update({ conditional_on: null }).in('id', ids).select('id')
if (updErr) { console.error('\nUPDATE fehlgeschlagen:', updErr.message); process.exit(1) }
console.log(`\n${upd.length} Feld(er) aktualisiert`)

// Zurueckholen statt dem Erfolg vertrauen.
const { data: nach } = await db
  .from('onboarding_felder').select('id, conditional_on').in('id', ids)
const offen = (nach ?? []).filter((f) => f.conditional_on !== null)
console.log(offen.length === 0
  ? 'Verifiziert: die Werkstatt-Frage wird jetzt bei JEDER Auszahlungsart gestellt.'
  : `FEHLER: ${offen.length} Feld(er) tragen die Bedingung noch.`)
process.exit(offen.length === 0 ? 0 : 1)
