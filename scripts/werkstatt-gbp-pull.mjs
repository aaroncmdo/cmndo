// Werkstatt-GBP-Pull (#18 Task Datenpflege, Spec §6): holt fuer aktive ECHTE Werkstaetten
// google_place_id (Find Place from Text) + rating/review_count (Place Details) und cacht sie
// in den werkstaetten-Spalten (google_place_id, google_rating, google_review_count,
// google_rating_am — Mig 20260715114357). Muster: fetchUndCacheGoogleBewertung (SV, AAR-956).
//
// Sicherheit gegen Fehlmatches: der Find-Place-Treffer wird NUR uebernommen, wenn seine
// formatted_address die PLZ der Werkstatt enthaelt — sonst SKIP + Report (nie raten!).
// Interne/Test-Werkstaetten (claimondo-Mail) werden uebersprungen.
//
// Nutzung (Repo-Root, node >= 18):
//   node scripts/werkstatt-gbp-pull.mjs --dry     # nur zeigen, NICHTS schreiben
//   node scripts/werkstatt-gbp-pull.mjs --apply   # schreiben + Manifest (.gbp-pull-manifest-<ts>.json)
//   ... --force                                   # auch Werkstaetten MIT vorhandener place_id refreshen

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const envRaw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const GKEY = env.GOOGLE_PLACES_API_KEY
if (!URL_ || !KEY) { console.error('Supabase-env fehlt (.env.local)'); process.exit(1) }
if (!GKEY) { console.error('GOOGLE_PLACES_API_KEY fehlt (.env.local)'); process.exit(1) }

const APPLY = process.argv.includes('--apply')
const FORCE = process.argv.includes('--force')
const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

const istIntern = (email) => !!email && /claimondo\.(de|test)$|(^|[.+-])(test|smoke|e2e)/i.test(email)

async function findPlace(w) {
  const input = `${w.name} ${w.adresse_strasse ?? ''} ${w.adresse_plz ?? ''} ${w.adresse_ort ?? ''}`.trim()
  const u = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(input)}&inputtype=textquery&fields=place_id,name,formatted_address&key=${GKEY}`
  const j = await (await fetch(u)).json()
  if (j.status !== 'OK' || !j.candidates?.length) return { skip: `FindPlace: ${j.status}` }
  const c = j.candidates[0]
  if (w.adresse_plz && !String(c.formatted_address ?? '').includes(w.adresse_plz)) {
    return { skip: `PLZ-Mismatch (Treffer: ${c.formatted_address})` }
  }
  return { placeId: c.place_id, matchName: c.name, matchAddr: c.formatted_address }
}

async function details(placeId) {
  const u = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total&key=${GKEY}`
  const j = await (await fetch(u)).json()
  if (j.status !== 'OK' || !j.result) return { skip: `Details: ${j.status}` }
  return { rating: j.result.rating ?? null, count: j.result.user_ratings_total ?? null }
}

const { data: rows, error } = await admin
  .from('werkstaetten')
  .select('id,name,email,adresse_strasse,adresse_plz,adresse_ort,google_place_id,google_rating,google_review_count')
  .eq('status', 'aktiv')
  .order('name')
if (error) { console.error('Query:', error.message); process.exit(1) }

const manifest = []
let updated = 0, skipped = 0
for (const w of rows) {
  if (istIntern(w.email)) { console.log(`SKIP intern       ${w.name}`); skipped++; continue }
  let placeId = w.google_place_id
  let matchInfo = '(place_id vorhanden)'
  if (!placeId || FORCE) {
    const f = await findPlace(w)
    if (f.skip) { console.log(`SKIP ${f.skip.padEnd(14)} ${w.name}`); skipped++; continue }
    placeId = f.placeId
    matchInfo = `${f.matchName} | ${f.matchAddr}`
  }
  const d = await details(placeId)
  if (d.skip) { console.log(`SKIP ${d.skip.padEnd(14)} ${w.name}`); skipped++; continue }
  console.log(`${APPLY ? 'APPLY' : 'DRY  '} ${w.name}  ->  ★${d.rating ?? '-'} (${d.count ?? 0})  ${matchInfo}`)
  manifest.push({ id: w.id, name: w.name, vorher: { place_id: w.google_place_id, rating: w.google_rating, count: w.google_review_count }, nachher: { place_id: placeId, rating: d.rating, count: d.count } })
  if (APPLY) {
    const { error: upErr } = await admin.from('werkstaetten').update({
      google_place_id: placeId,
      google_rating: d.rating,
      google_review_count: d.count,
      google_rating_am: new Date().toISOString(),
    }).eq('id', w.id)
    if (upErr) { console.error(`  UPDATE-Fehler ${w.name}: ${upErr.message}`); continue }
    updated++
  }
  await new Promise((r) => setTimeout(r, 120)) // sanftes API-Pacing
}

if (APPLY && manifest.length) {
  const p = `scripts/.gbp-pull-manifest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(p, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest: ${p}`)
}
console.log(`\n${APPLY ? `UPDATED ${updated}` : `DRY: ${manifest.length} wuerden aktualisiert`}, SKIPPED ${skipped}, GESAMT ${rows.length}`)
