#!/usr/bin/env node
// Einmaliger Seed: ein bestaetigter SV-Termin HEUTE (Europe/Berlin) fuer einen
// SV-Account, damit Tagesmodus (/gutachter/heute) + Feldmodus echte Daten zeigen.
// BEWUSST OHNE Kunde/Claim/Lead -> kein Reminder-/Notification-Target (die Crons
// joinen ueber claim/lead und ueberspringen bezuglose Termine).
//
// Nutzung (aus dem Repo-Root, .env.local mit SUPABASE_SERVICE_ROLE_KEY):
//   node --env-file=.env.local scripts/seed-sv-termin-heute.mjs [assignee_id]
//   node --env-file=.env.local scripts/seed-sv-termin-heute.mjs --clean   (nur aufraeumen)
//
// Default assignee_id = aaron.sprafke Test-SV. Idempotent: loescht vorherige
// Seeds (notiz_intern-Marker) desselben SV vor dem Insert.

import { createClient } from '@supabase/supabase-js'

const MARKER = 'TEST-SEED tagesmodus-tz-fix'
const DEFAULT_SV = '677400bf-dd31-4581-a645-07a7d624c190' // aaron.sprafke@claimondo.de SV-Row
const BERLIN = 'Europe/Berlin'

/** Europe/Berlin UTC-Offset (Minuten) zum Zeitpunkt. */
function berlinOffsetMinutes(at) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const v = (t) => Number(p.find((x) => x.type === t)?.value)
  const wallUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'))
  return Math.round((wallUtc - at.getTime()) / 60000)
}

/** UTC-Date fuer "heute HH:MM in Berlin". */
function berlinTodayAt(hour, minute) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [y, m, d] = iso.split('-').map(Number)
  const guessUtc = Date.UTC(y, m - 1, d, hour, minute, 0)
  const off = berlinOffsetMinutes(new Date(guessUtc))
  return new Date(guessUtc - off * 60000)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — mit --env-file=.env.local starten.')
  process.exit(1)
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const clean = process.argv.includes('--clean')
const svId = process.argv.slice(2).find((a) => /^[0-9a-f-]{36}$/i.test(a)) ?? DEFAULT_SV

// Marker lebt in gutachter_termine_intern (notiz_intern aus gutachter_termine ausgelagert, Kunde-Leak-Fix).
const { data: markedRows, error: markSelErr } = await db
  .from('gutachter_termine_intern').select('termin_id').eq('notiz_intern', MARKER)
if (markSelErr) {
  console.error('Cleanup-Lookup-Fehler:', markSelErr.message)
  process.exit(1)
}
const markedIds = (markedRows ?? []).map((r) => r.termin_id)
if (markedIds.length) {
  const del = await db.from('gutachter_termine').delete().eq('assignee_id', svId).in('id', markedIds)
  if (del.error) {
    console.error('Cleanup-Fehler:', del.error.message)
    process.exit(1)
  }
}
console.log(`Alte Seed-Termine fuer SV ${svId} entfernt.`)
if (clean) {
  console.log('Nur Cleanup (--clean). Fertig.')
  process.exit(0)
}

const start = berlinTodayAt(10, 0)
const end = berlinTodayAt(10, 40)
const { data, error } = await db
  .from('gutachter_termine')
  .insert({
    assignee_id: svId,
    assignee_typ: 'sachverstaendiger',
    status: 'bestaetigt',
    start_zeit: start.toISOString(),
    end_zeit: end.toISOString(),
    besichtigungsort_adresse: 'Am Rheinufer, 50999 Köln, Germany',
    besichtigungsort_lat: 50.865654,
    besichtigungsort_lng: 7.016278,
    besichtigungsort_place_id: 'address.7751896168812646',
  })
  .select('id, start_zeit')
  .single()

if (error) {
  console.error('Insert-Fehler:', error.message)
  process.exit(1)
}

// Seed-Marker in die Intern-Tabelle (notiz_intern aus gutachter_termine ausgelagert, Kunde-Leak-Fix).
const { error: markErr } = await db.from('gutachter_termine_intern')
  .upsert({ termin_id: data.id, notiz_intern: MARKER }, { onConflict: 'termin_id' })
if (markErr) {
  console.error('Marker-Insert-Fehler:', markErr.message)
  process.exit(1)
}

console.log(`OK Seed-Termin ${data.id} @ ${data.start_zeit} (10:00 Berlin) fuer SV ${svId}`)
console.log('  -> /gutachter/heute zeigt den Stop in Koeln; "Tagesmodus starten" -> Feldmodus.')
console.log('  Cleanup: node --env-file=.env.local scripts/seed-sv-termin-heute.mjs --clean')
