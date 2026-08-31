#!/usr/bin/env node
// Seed fuer den Regel-4-Nachweis zu #5772: Erscheint die Auszahlungsart-Frage im /flow?
//
// ZIEL-ZUSTAND: ein Haftpflicht-Lead, der im Kunden-Wizard bis zum SA-Step laeuft — dort
// wird seit #5772 „Wie moechtest du den Schaden abrechnen?" gestellt (reparatur | fiktiv |
// unentschieden). Vorher erreichte die Frage den Kunden NIE: sie ist zwar seit 02.07. in
// onboarding_felder konfiguriert, wurde im Flow aber von einem hartkodierten Filter
// ausgesperrt.
//
// ⚠ WARUM NICHT sa-vollmacht-seed.mjs: das setzt `werkstatt_intake_am`, und page.tsx:211
// KURZSCHLIESST darauf — es rendert WerkstattIntakeSignatur und returned, der ganze Wizard
// (inkl. SA-Step und damit der Frage) wird uebersprungen. Ein Lauf darueber wuerde
// „Feld fehlt" melden, obwohl nur ein anderer Renderpfad laeuft. Dieser Seed setzt das Feld
// deshalb bewusst NICHT.
//
// ⭐ `source_channel='gutachter-vermittlung'` kuerzt den Weg LEGITIM ab: flow-kontext.ts:53
// leitet daraus `gutachten_vermittelt='ja'` ab, und die Szenario-Matrix blendet damit sechs
// Zwischen-Steps aus ({"gutachten_vermittelt": null}). Uebrig bleibt
// zusammenfassung -> feststellung -> sa -> account. Das ist ein ECHTER Eintrittsweg (der
// Gutachter vermittelt den Fall), kein konstruierter Zustand — der Smoke klickt trotzdem
// jeden verbleibenden Schritt selbst.
//
// SICHERHEIT (Regel 4): @claimondo.test, telefon=NULL -> keine Kunden-Comms. Marker im
// unfallort -> --clean findet den Lead wieder.
//
//   node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-seed.mjs
//   node --env-file=.env.local scripts/smoke/auszahlungsart-erhebung-seed.mjs --clean

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const MARKER = 'SMOKE-AUSZAHLUNGSART-ERHEBUNG'
const OUT = 'scripts/smoke/.auszahlungsart-erhebung-seed.json'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('ENV fehlt — mit --env-file=.env.local starten'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const clean = process.argv.includes('--clean')

// ── Aufraeumen (immer zuerst: alte Reste stoeren die Eindeutigkeit) ──
{
  const { data: alte } = await db.from('leads').select('id').eq('unfallort', MARKER)
  for (const l of alte ?? []) {
    await db.from('flow_links').delete().eq('lead_id', l.id)
    await db.from('gutachter_termine').delete().eq('lead_id', l.id)
    const { data: claims } = await db.from('claims').select('id').eq('lead_id', l.id)
    for (const c of claims ?? []) await db.from('claims').delete().eq('id', c.id)
    await db.from('leads').delete().eq('id', l.id)
  }
  if ((alte?.length ?? 0) > 0) console.log(`  ${alte.length} alte(n) Seed-Lead(s) entfernt.`)
  if (clean) {
    if (existsSync(OUT)) unlinkSync(OUT)
    console.log('Clean fertig.')
    process.exit(0)
  }
}

const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)
const email = `throwaway-auszahlungsart-${stamp}@claimondo.test`

const { data: lead, error: lErr } = await db
  .from('leads')
  .insert({
    status: 'flow-gesendet',
    email,
    telefon: null,
    vorname: 'Smoke',
    nachname: 'Auszahlungsart',
    // Haftpflicht-Szenario: nur dort steht der SA-Step in der Sequenz (flow_szenario_steps).
    schuldfrage: 'gegner',
    abrechnungsweg: 'haftpflicht',
    service_typ: 'nur_gutachter',
    // Kuerzt die 6 Zwischen-Steps weg (s. Kopf) — KEIN werkstatt_intake_am!
    source_channel: 'gutachter-vermittlung',
    unfallort: MARKER,
    kunde_plz: '50667',
    kunde_stadt: 'Köln',
  })
  .select('id')
  .single()
if (lErr) { console.error('lead insert:', lErr.message); process.exit(1) }

const { data: fl, error: fErr } = await db
  .from('flow_links')
  .insert({
    lead_id: lead.id,
    expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(),
    service_typ: 'nur_gutachter',
    sprache: 'de',
  })
  .select('token')
  .single()
if (fErr) { console.error('flow_links insert:', fErr.message); process.exit(1) }

// ⭐ Claim MIT anlegen — sonst prueft der Smoke nur den halben Weg.
// Der Kunde/die Werkstatt/der SV lesen `claims.reparaturwunsch`, nicht `leads.*`. Ohne Claim
// kann spiegleQualiAufClaim gar nicht greifen, und ein gruener Lauf wuerde nur beweisen, dass
// der Wert im LEAD steht — genau die Luecke, die #5761 geschlossen hat. Mit Claim prueft der
// Smoke die Kette bis zu der Tabelle, aus der die Anzeige liest.
const { data: claim, error: cErr } = await db
  .from('claims')
  .insert({
    lead_id: lead.id,
    abrechnungsweg: 'haftpflicht',
    schuldfrage: 'gegner',
    service_typ: 'nur_gutachter',
    // Einzige NOT-NULL-Spalte ohne Default (nachgeschlagen, nicht geraten).
    schadentag: new Date().toISOString().slice(0, 10),
    schadenort_adresse: MARKER,
  })
  .select('id, claim_nummer')
  .single()
if (cErr) { console.error('claim insert:', cErr.message); process.exit(1) }

// Zurueckgelesen: ein fehlerfreier Insert beweist nicht, dass der Zustand stimmt.
const { data: kontrolle } = await db
  .from('leads')
  .select('id, schuldfrage, abrechnungsweg, source_channel, werkstatt_intake_am, reparaturwunsch')
  .eq('id', lead.id)
  .single()
if (kontrolle?.werkstatt_intake_am) {
  console.error('ABBRUCH: werkstatt_intake_am ist gesetzt — der Lauf liefe in den Kurzschluss.')
  process.exit(1)
}

const summary = { stamp, leadId: lead.id, claimId: claim.id, claimNummer: claim.claim_nummer, token: fl.token, email, flowUrl: `/flow/${fl.token}`, seededAt: new Date().toISOString() }
writeFileSync(OUT, JSON.stringify(summary, null, 2))
console.log('\n--- SEED FERTIG ---')
console.log('  Lead:', lead.id, `(${email}, telefon=NULL)`)
console.log('  Claim:', claim.claim_nummer, `(${claim.id})`)
console.log('  Zustand:', JSON.stringify(kontrolle))
console.log('  Flow:', summary.flowUrl)
console.log(`  Datei: ${OUT}\n`)
