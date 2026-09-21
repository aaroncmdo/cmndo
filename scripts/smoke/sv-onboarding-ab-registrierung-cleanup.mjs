#!/usr/bin/env node
// Raeumt die Wegwerf-Konten des Smokes "SV-Onboarding ab der Registrierung" restlos ab.
//
// Anders als bei den anderen Smokes gibt es hier KEIN Seed-Skript: das Konto entsteht im Test
// selbst, durch das ausgefuellte Registrierungsformular. Dieses Skript ist deshalb reines
// Aufraeumen und laeuft ueber das E-Mail-Praefix.
//
//   node --env-file="<repo>/.env.local" scripts/smoke/sv-onboarding-ab-registrierung-cleanup.mjs
//
// Die Reihenfolge folgt den Fremdschluesseln. Am 21.09.2026 gemessen, welche davon wirklich
// blocken: `auftraege.sv_id` haelt die SV-Zeile fest, `mitteilungen.empfaenger_id` das Profil.
// Beide sind hier drin — ohne sie bleiben Konten stehen und sammeln sich in den Stammdaten an
// (siehe memory/AUDIT-wegwerf-konten-sammeln-sich-in-stammdatentabellen.md).

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file vergessen?)')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const PREFIX = 'e2e-svreg-'
const geloescht = {
  profile: 0,
  sv: 0,
  dokumente: 0,
  vertraege: 0,
  termine: 0,
  auftraege: 0,
  tasks: 0,
  mitteilungen: 0,
  widgets: 0,
  kalender: 0,
  dateien: 0,
}

async function weg(tabelle, spalte, wert, zaehler) {
  const { error, count } = await db.from(tabelle).delete({ count: 'exact' }).eq(spalte, wert)
  if (error) console.warn(`  ${tabelle}.${spalte}: ${error.message}`)
  else if (zaehler) geloescht[zaehler] += count ?? 0
  return !error
}

const { data: profs, error: profErr } = await db
  .from('profiles')
  .select('id, email')
  .like('email', `${PREFIX}%`)
if (profErr) {
  console.error(`profiles-Read: ${profErr.message}`)
  process.exit(1)
}
console.log(`Wegwerf-Konten gefunden: ${(profs ?? []).length}`)

for (const prof of profs ?? []) {
  console.log(`\n── ${prof.email}`)

  const { data: svs } = await db.from('sachverstaendige').select('id').eq('profile_id', prof.id)
  for (const s of svs ?? []) {
    // Storage zuerst — danach sind die Pfade nicht mehr lesbar.
    const { data: pd } = await db.from('pflichtdokumente').select('dokument_url').eq('sv_id', s.id)
    const pfade = (pd ?? []).map((r) => r.dokument_url).filter(Boolean)
    if (pfade.length > 0) {
      const { error } = await db.storage.from('fall-dokumente').remove(pfade)
      if (error) console.warn(`  Storage fall-dokumente: ${error.message}`)
      else geloescht.dateien += pfade.length
    }
    const { data: vu } = await db.from('vertraege_unterzeichnet').select('pdf_storage_path').eq('sv_id', s.id)
    const vertragsPfade = (vu ?? []).map((v) => v.pdf_storage_path).filter(Boolean)
    if (vertragsPfade.length > 0) {
      const { error } = await db.storage.from('vertraege').remove(vertragsPfade)
      if (error) console.warn(`  Storage vertraege: ${error.message}`)
      else geloescht.dateien += vertragsPfade.length
    }

    await weg('pflichtdokumente', 'sv_id', s.id, 'dokumente')
    await weg('vertraege_unterzeichnet', 'sv_id', s.id, 'vertraege')
    await weg('gutachter_termine', 'assignee_id', s.id, 'termine')
    await weg('auftraege', 'sv_id', s.id, 'auftraege')
    await weg('tasks', 'entity_id', s.id, 'tasks')
    await weg('e2e_test_fixtures', 'sv_id', s.id)

    const { error: svErr } = await db.from('sachverstaendige').delete().eq('id', s.id)
    if (svErr) console.warn(`  sachverstaendige: ${svErr.message}`)
    else geloescht.sv += 1
  }

  // Der Einrichtungs-Assistent legt ein Widget und ggf. eine Kalenderverbindung an.
  await weg('embed_sites', 'inhaber_profile_id', prof.id, 'widgets')
  await weg('kalender_verbindungen', 'profile_id', prof.id, 'kalender')
  // Mitteilungen blocken das Profil (mitteilungen_empfaenger_id_fkey).
  await weg('mitteilungen', 'empfaenger_id', prof.id, 'mitteilungen')

  const { error: authErr } = await db.auth.admin.deleteUser(prof.id)
  if (authErr) {
    console.warn(`  auth.deleteUser: ${authErr.message}`)
    const { error: pErr } = await db.from('profiles').delete().eq('id', prof.id)
    if (pErr) console.warn(`  profiles direkt: ${pErr.message}`)
    else geloescht.profile += 1
  } else {
    geloescht.profile += 1
  }
}

const { count: rest } = await db
  .from('profiles')
  .select('id', { count: 'exact', head: true })
  .like('email', `${PREFIX}%`)

console.log(`\n${JSON.stringify({ geloescht, verbleibend: rest ?? 0 }, null, 2)}`)
if ((rest ?? 0) > 0) {
  console.error('\n⚠ Es sind Konten uebrig — bitte den Blocker oben lesen und nachziehen.')
  process.exit(1)
}
