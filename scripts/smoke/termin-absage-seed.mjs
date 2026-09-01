// Seed fuer den Regel-4-Prod-Smoke der Kunden-Terminabsage (#5819).
//
// Legt ZWEI unabhaengige Faelle an, je einen pro Absage-Weg:
//   A) Portal  — Lead traegt die Mail des Test-Kunden, damit der Owner-Guard greift
//                (kannTerminFallVerwalten: kunde_id ODER leads.email == user.email —
//                nachgeschlagen, nicht geraten: `claims.kunde_user_id` existiert nicht).
//   B) Token   — Absage ueber /api/v1/termin-stornieren mit dem FlowLink-Token.
//
// ⭐ ZWEI Faelle, weil eine Absage ihren Termin VERBRAUCHT. Mit einem gemeinsamen Fall
// wuerde der zweite Weg auf einem bereits abgesagten Termin laufen und dort das
// Idempotenz-Ergebnis liefern statt eine echte Absage — ein gruener Lauf, der die
// Sache nicht beweist.
//
// SICHERHEIT (Regel 4): telefon = null auf beiden Leads -> keine echten SMS/WhatsApp.
// Aufraeumen: node --env-file=.env.local scripts/smoke/termin-absage-seed.mjs --clean
//
// Nutzung:
//   node --env-file=.env.local scripts/smoke/termin-absage-seed.mjs
//   -> schreibt scripts/smoke/.termin-absage-seed.json

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const MARKER = 'SMOKE-TERMIN-ABSAGE'
const OUT = 'scripts/smoke/.termin-absage-seed.json'
const KUNDE_MAIL = process.env.TEST_KUNDE_EMAIL ?? 'smoke-kunde@claimondo.de'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY noetig.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

async function aufraeumen() {
  const { data: alte } = await db.from('leads').select('id').eq('unfallort', MARKER)
  for (const l of alte ?? []) {
    const { data: claims } = await db.from('claims').select('id').eq('lead_id', l.id)
    for (const c of claims ?? []) {
      // Termine haengen bezug-nativ am Claim, nicht per fall_id.
      await db.from('gutachter_termine').delete().eq('bezug_typ', 'fall').eq('bezug_id', c.id)
      await db.from('tasks').delete().eq('fall_id', c.id)
      await db.from('timeline').delete().eq('fall_id', c.id)
      await db.from('claims').delete().eq('id', c.id)
    }
    await db.from('gutachter_termine').delete().eq('lead_id', l.id)
    await db.from('flow_links').delete().eq('lead_id', l.id)
    await db.from('leads').delete().eq('id', l.id)
  }
  if (existsSync(OUT)) unlinkSync(OUT)
  console.log(`aufgeraeumt: ${(alte ?? []).length} Lead(s) mit ${MARKER}`)
}

if (process.argv.includes('--clean')) {
  await aufraeumen()
  process.exit(0)
}

// Immer erst aufraeumen — sonst sammeln sich bei jedem Lauf Altlasten in der
// Task-Liste an (die Klasse aus BROADCAST-smoke-residue-flutet-task-liste).
await aufraeumen()

/** Legt Lead + FlowLink + Claim + aktiven sv_begutachtung-Termin an. */
async function baueFall(bezeichnung, email) {
  const { data: lead, error: lErr } = await db
    .from('leads')
    .insert({
      status: 'flow-gesendet',
      email,
      telefon: null, // Regel 4: keine echten Kunden-Comms
      vorname: 'Smoke',
      nachname: `Absage ${bezeichnung}`,
      schuldfrage: 'gegner',
      abrechnungsweg: 'haftpflicht',
      service_typ: 'nur_gutachter',
      source_channel: 'self_service',
      unfallort: MARKER,
      kunde_plz: '50667',
      kunde_stadt: 'Köln',
      unfallhergang: 'Auffahrunfall an der Ampel, Gegner ist aufgefahren.',
      kennzeichen: 'K-SA 4711',
      fahrzeug_hersteller: 'VW',
      fahrzeug_modell: 'Golf',
    })
    .select('id')
    .single()
  if (lErr) throw new Error(`lead (${bezeichnung}): ${lErr.message}`)

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
  if (fErr) throw new Error(`flow_links (${bezeichnung}): ${fErr.message}`)

  const { data: claim, error: cErr } = await db
    .from('claims')
    .insert({
      lead_id: lead.id,
      abrechnungsweg: 'haftpflicht',
      schuldfrage: 'gegner',
      service_typ: 'nur_gutachter',
      schadentag: new Date().toISOString().slice(0, 10),
    })
    .select('id, claim_nummer')
    .single()
  if (cErr) throw new Error(`claim (${bezeichnung}): ${cErr.message}`)

  // Termin morgen 10:00 Berlin — sicher in der Zukunft, damit die Terminkarte ihn
  // als aktiv fuehrt. bezug-nativ (bezug_typ/bezug_id), wie die Engine schreibt.
  const start = new Date(Date.now() + 24 * 3600e3)
  start.setUTCHours(8, 0, 0, 0) // 10:00 Berlin (MESZ)
  const ende = new Date(start.getTime() + 40 * 60e3)

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .insert({
      bezug_typ: 'fall',
      bezug_id: claim.id,
      typ: 'sv_begutachtung', // gueltiger CHECK-Wert (nachgeschlagen)
      status: 'bestaetigt',
      start_zeit: start.toISOString(),
      end_zeit: ende.toISOString(),
    })
    .select('id, start_zeit')
    .single()
  if (tErr) throw new Error(`termin (${bezeichnung}): ${tErr.message}`)

  return {
    leadId: lead.id,
    claimId: claim.id,
    claimNummer: claim.claim_nummer,
    token: fl.token,
    terminId: termin.id,
    terminStart: termin.start_zeit,
    email,
  }
}

const stamp = Date.now().toString(36) + '-' + randomUUID().slice(0, 8)

// A: Portal-Weg — Lead traegt die Test-Kunden-Mail, damit der Owner-Guard greift.
const portal = await baueFall('Portal', KUNDE_MAIL)
// B: Token-Weg — Autorisierung ist der Token, die Mail ist beliebig.
const token = await baueFall('Token', `throwaway-absage-${stamp}@claimondo.test`)

const seed = { marker: MARKER, erzeugtAm: new Date().toISOString(), portal, token }
writeFileSync(OUT, JSON.stringify(seed, null, 2))

console.log(`
Seed geschrieben: ${OUT}

  A) Portal  Claim ${portal.claimNummer ?? portal.claimId.slice(0, 8)} · Kunde ${portal.email}
             Termin ${portal.terminStart}
  B) Token   Claim ${token.claimNummer ?? token.claimId.slice(0, 8)} · Token ${token.token.slice(0, 8)}…
             Termin ${token.terminStart}

Danach:  RUN_TERMIN_ABSAGE_SMOKE=1 npx playwright test tests/e2e/flows/kunde-termin-absage-smoke.spec.ts
Aufraeumen: node --env-file=.env.local scripts/smoke/termin-absage-seed.mjs --clean
`)
