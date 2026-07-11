// Einmaliger Backfill: geokodiert alle partner_leads mit fehlenden Koordinaten via
// Mapbox (der kanonische Prod-Geocoder — der frühere Google-Weg war server-seitig
// tot, s. geocode-partner-lead.ts). Additiv + idempotent: fasst NUR null-coord Leads
// an, mehrfach ausführbar. Bis der Intake-Fix (geocodeMitFallback) auf prod deployt ist,
// entstehen weiter null-coord Leads → dieser Lauf bleibt bis dahin nützlich.
//
// Nutzung (node >= 18, aus dem Repo-Root):
//   node scripts/backfill/partner-leads-geocode-backfill.mjs --dry   # Vorschau, kein Write
//   node scripts/backfill/partner-leads-geocode-backfill.mjs         # schreibt lat/lng/google_place_id

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ENV_CANDIDATES = [
  fileURLToPath(new URL('../../.env.local', import.meta.url)),
  'C:\\Users\\Aaron Sprafke\\stampit-app\\stampit-app\\claimondo-v2\\.env.local',
]
let envRaw = null
for (const p of ENV_CANDIDATES) {
  try { envRaw = readFileSync(p, 'utf8'); break } catch { /* next */ }
}
if (!envRaw) throw new Error('.env.local nicht gefunden')
const env = {}
for (const line of envRaw.split('\n')) {
  const l = line.replace(/\r$/, '')
  if (!l.includes('=') || l.trimStart().startsWith('#')) continue
  const i = l.indexOf('=')
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const MBTOKEN = env.MAPBOX_TOKEN || env.MAPBOX_ACCESS_TOKEN || env.NEXT_PUBLIC_MAPBOX_TOKEN
if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
if (!MBTOKEN) throw new Error('Mapbox-Token fehlt (MAPBOX_TOKEN/MAPBOX_ACCESS_TOKEN/NEXT_PUBLIC_MAPBOX_TOKEN)')
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const DRY = process.argv.includes('--dry')

// Spiegelt baueAdresse aus geocode-partner-lead.ts: "Straße, PLZ Ort" oder "PLZ Ort".
function baueAdresse({ strasse, plz, ort }) {
  const plzOrt = [plz?.trim(), ort?.trim()].filter(Boolean).join(' ')
  return [strasse?.trim(), plzOrt].filter(Boolean).join(', ')
}

// Spiegelt geocodeAdresse aus @/lib/mapbox/geocode (Mapbox v5 places).
async function mapboxGeocode(addr) {
  const u = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?country=de&limit=1&access_token=${MBTOKEN}`
  const r = await fetch(u)
  if (!r.ok) return null
  const j = await r.json()
  const f = j?.features?.[0]
  if (!f?.center) return null
  const [lng, lat] = f.center
  return { lat, lng, placeId: f.id ?? null, formatted: f.place_name ?? addr }
}

async function main() {
  console.log(`\n== partner_leads Geocode-Backfill (${DRY ? 'DRY-RUN' : 'APPLY'}) gegen ${URL_} ==`)
  const { data: leads, error } = await db
    .from('partner_leads')
    .select('id, firma, strasse, plz, ort, lat, lng')
    .or('lat.is.null,lng.is.null')
    .order('erstellt_am', { ascending: true })
  if (error) throw new Error('Load: ' + error.message)
  console.log(`  ${leads.length} Leads ohne Koordinaten.`)

  let ok = 0, skip = 0, fail = 0
  for (const lead of leads) {
    const name = lead.firma ?? lead.id
    if (!lead.plz?.trim() || !lead.ort?.trim()) {
      console.log(`  ⊘ SKIP ${name} — kein plz/ort (Vollständigkeits-Gate)`)
      skip++
      continue
    }
    const addr = baueAdresse(lead)
    const geo = await mapboxGeocode(addr)
    if (!geo) {
      console.log(`  ✗ FAIL ${name} — kein Geocode-Treffer (${addr})`)
      fail++
      continue
    }
    if (DRY) {
      console.log(`  · WÜRDE ${name} → ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}  (${geo.formatted})`)
      ok++
      continue
    }
    const { error: updErr } = await db
      .from('partner_leads')
      .update({ lat: geo.lat, lng: geo.lng, google_place_id: geo.placeId })
      .eq('id', lead.id)
    if (updErr) {
      console.log(`  ✗ FAIL ${name} — Update: ${updErr.message}`)
      fail++
    } else {
      console.log(`  ✓ ${name} → ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`)
      ok++
    }
  }
  console.log(`\n== ${DRY ? 'DRY-RUN' : 'FERTIG'}: ${ok} ${DRY ? 'würden geocodet' : 'geocodet'}, ${skip} übersprungen (kein plz/ort), ${fail} fehlgeschlagen ==\n`)
}

main().catch((e) => { console.error('BACKFILL-FEHLER:', e.message); process.exit(1) })
