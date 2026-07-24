// Backfill SV google_place_id (Nudge-Enablement) — fuer ALLE aktiven SVs (nicht nur
// paket='standard' wie backfill-google-bewertungen.mjs), damit der SV-Bewertungs-Nudge
// nach der Besichtigung (src/lib/google-bewertungen/notify-kunde-sv-bewerten.ts) ein
// Bewertungsziel hat. Aktuell haben nur 5/15 SVs eine place_id.
//
// MANIFEST-FIRST: der Default-Lauf schreibt NUR ein Manifest (proposed matches) und
// fasst die DB NICHT an. Grund: ein Fehlmatch wuerde Kunden auf das Google-Profil
// einer FREMDEN Firma schicken. Erst nach Review des Manifests: --apply.
//
// Aufruf:
//   node --env-file=.env.local scripts/backfill-sv-place-id.mjs            # DRY -> Manifest + Summary
//   node --env-file=.env.local scripts/backfill-sv-place-id.mjs --apply    # schreibt profiles.google_place_id + Cache
//
// Wrong-Match-Schutz (wie backfill-google-bewertungen.mjs): PLZ-Pflicht in der Adresse
// + Namen-Token-Aehnlichkeit. Nur token-gematchte Eintraege (status='match') werden bei
// --apply geschrieben; 'match_unsicher' bleibt liegen -> manuell im Admin-SV-Detail
// (googlePlaceId-Feld) setzen. FORCE=1 ueberschreibt vorhandene place_ids.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const FORCE = process.env.FORCE === '1'
const PLACES_FIND_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'
const RATE_LIMIT_MS = 200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Namen-Token-Aehnlichkeit: der gefundene Google-Name muss einen aussagekraeftigen
// Token aus dem firmenname enthalten, sonst wahrscheinlich Fehlmatch.
function tokenMatch(firmenname, googleName) {
  const tokens = String(firmenname)
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 4 && !/^(kfz|gmbh|büro|buero|sachverständig|sachverstaendig|ingenieurbüro|ingenieurbuero)$/i.test(t))
  const matched = String(googleName ?? '').toLowerCase()
  return tokens.length === 0 || tokens.some((t) => matched.includes(t))
}

async function findPlace(query, apiKey) {
  const url = `${PLACES_FIND_URL}?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,rating,user_ratings_total&language=de&region=de&key=${apiKey}`
  const res = await fetch(url)
  return res.json()
}

async function placeDetails(placeId, apiKey) {
  const url = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,photos&language=de&key=${apiKey}`
  const res = await fetch(url)
  return res.json()
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!supabaseUrl || !serviceKey || !apiKey) {
    console.error('[backfill-sv] Env fehlt: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY')
    process.exit(1)
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // ALLE aktiven SVs mit profile_id (kein paket-Filter).
  const { data: svs, error: svErr } = await admin
    .from('sachverstaendige')
    .select('id, firmenname, standort_adresse, profile_id')
    .eq('ist_aktiv', true)
    .not('profile_id', 'is', null)
  if (svErr) {
    console.error('[backfill-sv] sachverstaendige-Query fehlgeschlagen:', svErr.message)
    process.exit(1)
  }
  const profileIds = svs.map((s) => s.profile_id)
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, vorname, nachname, google_place_id')
    .in('id', profileIds)
  if (pErr) {
    console.error('[backfill-sv] profiles-Query fehlgeschlagen:', pErr.message)
    process.exit(1)
  }
  const profById = new Map(profiles.map((p) => [p.id, p]))

  console.log(`[backfill-sv] ${svs.length} aktive SVs — Modus: ${APPLY ? 'APPLY (schreibt DB)' : 'DRY (nur Manifest)'}${FORCE ? ' FORCE' : ''}\n`)

  const manifest = []
  for (const sv of svs) {
    const prof = profById.get(sv.profile_id)
    const entry = {
      svId: sv.id,
      profileId: sv.profile_id,
      firmenname: sv.firmenname ?? null,
      standort_adresse: sv.standort_adresse ?? null,
      status: 'pending',
    }

    if (prof?.google_place_id && !FORCE) {
      entry.status = 'skip_hat_place_id'
      entry.vorhandenePlaceId = prof.google_place_id
      manifest.push(entry)
      continue
    }
    if (!sv.firmenname || !sv.standort_adresse) {
      entry.status = 'skip_daten_fehlen'
      manifest.push(entry)
      continue
    }
    if (!/\b\d{5}\b/.test(sv.standort_adresse)) {
      entry.status = 'skip_keine_plz'
      manifest.push(entry)
      continue
    }
    if (/\b(test|smoke|demo)\b/i.test(sv.firmenname)) {
      entry.status = 'skip_test'
      manifest.push(entry)
      continue
    }

    entry.query = `${sv.firmenname} ${sv.standort_adresse}`
    try {
      const json = await findPlace(entry.query, apiKey)
      if (json.status !== 'OK' || !json.candidates?.length) {
        entry.status = 'no_match'
        entry.googleStatus = json.status
        manifest.push(entry)
        await sleep(RATE_LIMIT_MS)
        continue
      }
      const cand = json.candidates[0]
      const ok = tokenMatch(sv.firmenname, cand.name)
      entry.match = {
        place_id: cand.place_id,
        name: cand.name ?? null,
        formatted_address: cand.formatted_address ?? null,
        rating: cand.rating ?? null,
        user_ratings_total: cand.user_ratings_total ?? null,
      }
      entry.status = ok ? 'match' : 'match_unsicher'
    } catch (err) {
      entry.status = 'error'
      entry.error = err.message
    }
    manifest.push(entry)
    await sleep(RATE_LIMIT_MS)
  }

  // Summary
  const byStatus = manifest.reduce((acc, e) => ((acc[e.status] = (acc[e.status] ?? 0) + 1), acc), {})
  console.log('=== Manifest-Summary ===')
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`)
  console.log('\n=== Vorschlaege (match / match_unsicher) ===')
  for (const e of manifest.filter((x) => x.status === 'match' || x.status === 'match_unsicher')) {
    const flag = e.status === 'match_unsicher' ? '⚠ UNSICHER' : '✓'
    console.log(`  ${flag} ${e.firmenname} → "${e.match.name}" @ ${e.match.formatted_address} | ⭐ ${e.match.rating ?? '-'} (${e.match.user_ratings_total ?? 0}) | ${e.match.place_id}`)
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const manifestPath = `scripts/.backfill-sv-place-id-manifest-${ts}.json`
  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, entries: manifest }, null, 2))
  console.log(`\nManifest: ${manifestPath}`)

  if (!APPLY) {
    console.log('\n[DRY] Nichts geschrieben. Review die "match"-Vorschlaege oben, dann: --apply')
    console.log('      (match_unsicher wird bei --apply NICHT geschrieben — manuell im Admin-SV-Detail setzen.)')
    return
  }

  // APPLY: nur sichere Token-Matches. Backup der vorherigen Werte ins Manifest-Verzeichnis.
  const toApply = manifest.filter((e) => e.status === 'match')
  const backup = []
  let applied = 0
  let cached = 0
  for (const e of toApply) {
    const prof = profById.get(e.profileId)
    backup.push({ profileId: e.profileId, vorher_google_place_id: prof?.google_place_id ?? null, nachher_google_place_id: e.match.place_id })
    const { error: updErr } = await admin.from('profiles').update({ google_place_id: e.match.place_id }).eq('id', e.profileId)
    if (updErr) {
      console.error(`  [profiles-update fail] ${e.firmenname}:`, updErr.message)
      continue
    }
    applied++
    // Cache (rating/count) gleich mitziehen.
    try {
      const det = await placeDetails(e.match.place_id, apiKey)
      if (det.status === 'OK' && det.result) {
        const { error: upErr } = await admin.from('google_bewertungen_cache').upsert(
          {
            profile_id: e.profileId,
            durchschnitt: det.result.rating ?? null,
            anzahl_bewertungen: det.result.user_ratings_total ?? null,
            photo_reference: det.result.photos?.[0]?.photo_reference ?? null,
            zuletzt_aktualisiert_am: new Date().toISOString(),
          },
          { onConflict: 'profile_id' },
        )
        if (!upErr) cached++
      }
    } catch (err) {
      console.warn(`  [cache-warn] ${e.firmenname}:`, err.message)
    }
    await sleep(RATE_LIMIT_MS)
  }
  const backupPath = `scripts/.backfill-sv-place-id-backup-${ts}.json`
  writeFileSync(backupPath, JSON.stringify({ appliedAt: new Date().toISOString(), backup }, null, 2))
  console.log(`\n[APPLY] ${applied} place_ids geschrieben, ${cached} Cache-Eintraege. Backup: ${backupPath}`)
}

main().catch((err) => {
  console.error('[backfill-sv] FATAL:', err)
  process.exit(1)
})
