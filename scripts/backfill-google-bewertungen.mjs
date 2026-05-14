// Backfill 2026-05-14: Google Place-IDs + Bewertungen für paket='standard' SVs.
//
// Hintergrund: Die Marketing-Karte /gutachter-finden zeigt seit Privacy-Refactor
// nur paket='standard'-SVs als klickbare Avatar-Marker mit anonymem Popup. Das
// Popup soll Sterne + Bewertungs-Anzahl aus google_bewertungen_cache zeigen —
// der Cache ist aktuell leer weil profiles.google_place_id für die 5 Standard-
// SVs NULL ist und die Cron-Route /api/cron/google-bewertungen daher überspringt.
//
// Dieses Script:
//   1. Lädt alle paket='standard' aktiven SVs ohne google_place_id
//   2. Sucht Google Place-ID via "Find Place from Text" mit firmenname + adresse
//   3. Schreibt google_place_id in profiles
//   4. Triggert für die neu befüllten Place-IDs die Places-Details-API → rating + count
//   5. Upsert in google_bewertungen_cache
//
// Aufruf: node --env-file=.env.local scripts/backfill-google-bewertungen.mjs
//
// Idempotent — kann mehrfach laufen ohne Schaden. Skipt Profile die schon
// place_id haben (außer du setzt FORCE=1).

import { createClient } from '@supabase/supabase-js'

const FORCE = process.env.FORCE === '1'
const PLACES_FIND_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
const PLACES_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'
const RATE_LIMIT_MS = 200

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!supabaseUrl || !serviceKey || !apiKey) {
    console.error('[backfill] Env fehlt: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_PLACES_API_KEY')
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // 1. Standard-SVs laden — kein Embed (sachverstaendige↔profiles hat mehrere FKs)
  const { data: svs, error: svErr } = await admin
    .from('sachverstaendige')
    .select('id, firmenname, standort_adresse, profile_id')
    .eq('paket', 'standard')
    .eq('ist_aktiv', true)
    .not('profile_id', 'is', null)
  if (svErr) {
    console.error('[backfill] sachverstaendige-Query fehlgeschlagen:', svErr.message)
    process.exit(1)
  }
  const profileIds = svs.map((s) => s.profile_id)
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, vorname, google_place_id')
    .in('id', profileIds)
  if (pErr) {
    console.error('[backfill] profiles-Query fehlgeschlagen:', pErr.message)
    process.exit(1)
  }
  const profilesById = new Map(profiles.map((p) => [p.id, p]))
  const rows = svs.map((s) => ({ ...s, profil: profilesById.get(s.profile_id) }))

  console.log(`[backfill] ${rows.length} Standard-SVs gefunden`)

  let placeIdsBefuellt = 0
  let placeIdsSkipped = 0
  let placeIdsFailed = 0
  let bewertungenBefuellt = 0
  let bewertungenFailed = 0

  for (const sv of rows) {
    const profil = sv.profil
    const profileId = profil?.id ?? sv.profile_id

    if (!sv.firmenname || !sv.standort_adresse) {
      console.warn(`  [skip] ${sv.id}: firmenname/adresse leer`)
      placeIdsSkipped++
      continue
    }

    // Sanity-Check: Adresse muss eine 5-stellige PLZ enthalten, sonst matched
    // Google irgendwas Random ("Köln Test" → Vape-Shop am Neumarkt).
    if (!/\b\d{5}\b/.test(sv.standort_adresse)) {
      console.warn(`  [skip] ${sv.firmenname}: keine PLZ in Adresse "${sv.standort_adresse}" — Google würde irrtümlich matchen`)
      placeIdsSkipped++
      continue
    }
    // Sanity-Check: Test/Smoke-SVs überspringen (Aaron-internen Demo-Accounts)
    if (/\b(test|smoke|demo)\b/i.test(sv.firmenname)) {
      console.warn(`  [skip] ${sv.firmenname}: Test/Demo-Eintrag — kein Google-Lookup`)
      placeIdsSkipped++
      continue
    }

    let placeId = profil?.google_place_id

    // 2. Find Place wenn nicht schon vorhanden
    if (!placeId || FORCE) {
      const query = `${sv.firmenname} ${sv.standort_adresse}`
      const findUrl = `${PLACES_FIND_URL}?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,rating,user_ratings_total&language=de&region=de&key=${apiKey}`
      try {
        const res = await fetch(findUrl)
        const json = await res.json()
        if (json.status !== 'OK' || !json.candidates || json.candidates.length === 0) {
          console.warn(`  [findplace fail] ${sv.firmenname}: status=${json.status} candidates=${json.candidates?.length ?? 0}`)
          placeIdsFailed++
          continue
        }
        const cand = json.candidates[0]
        // Name-Similarity-Check: Wenn der gefundene Name keinen relevanten
        // Token aus unserem firmenname enthält, ist es vermutlich ein
        // Random-Match (z.B. "Smoke SV" → "SmokeFactory Vape Shop").
        const tokens = sv.firmenname.toLowerCase().split(/\W+/).filter((t) => t.length >= 4 && !/^(kfz|gmbh|büro|buero|sachverständig|sachverstaendig|ingenieurbüro|ingenieurbuero)$/i.test(t))
        const matchedName = (cand.name ?? '').toLowerCase()
        const tokenMatched = tokens.length === 0 || tokens.some((t) => matchedName.includes(t))
        if (!tokenMatched) {
          console.warn(`  [skip] ${sv.firmenname}: Google-Match "${cand.name}" enthält keinen Namen-Token (${tokens.join(',')}) — wahrscheinlich Fehlmatch`)
          placeIdsFailed++
          continue
        }
        placeId = cand.place_id
        console.log(`  [findplace ok] ${sv.firmenname} → ${placeId} (Match: "${cand.name}" @ ${cand.formatted_address})`)

        const { error: updErr } = await admin
          .from('profiles')
          .update({ google_place_id: placeId })
          .eq('id', profileId)
        if (updErr) {
          console.error(`  [profiles-update fail] ${sv.firmenname}:`, updErr.message)
          placeIdsFailed++
          continue
        }
        placeIdsBefuellt++
      } catch (err) {
        console.error(`  [findplace exception] ${sv.firmenname}:`, err.message)
        placeIdsFailed++
        continue
      }
      await sleep(RATE_LIMIT_MS)
    } else {
      console.log(`  [skip findplace] ${sv.firmenname}: place_id schon gesetzt (${placeId})`)
      placeIdsSkipped++
    }

    // 3. Places-Details fetchen für rating + count + photo
    try {
      const detailsUrl = `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,photos&language=de&key=${apiKey}`
      const res = await fetch(detailsUrl)
      const json = await res.json()
      if (json.status !== 'OK' || !json.result) {
        console.warn(`  [details fail] ${sv.firmenname}: status=${json.status}`)
        bewertungenFailed++
        continue
      }
      const { rating, user_ratings_total, photos } = json.result
      const { error: upsertErr } = await admin
        .from('google_bewertungen_cache')
        .upsert(
          {
            profile_id: profileId,
            durchschnitt: rating ?? null,
            anzahl_bewertungen: user_ratings_total ?? null,
            photo_reference: photos?.[0]?.photo_reference ?? null,
            zuletzt_aktualisiert_am: new Date().toISOString(),
          },
          { onConflict: 'profile_id' },
        )
      if (upsertErr) {
        console.error(`  [cache-upsert fail] ${sv.firmenname}:`, upsertErr.message)
        bewertungenFailed++
        continue
      }
      console.log(`  [bewertung] ${sv.firmenname}: ⭐ ${rating ?? '-'} (${user_ratings_total ?? 0} Reviews)`)
      bewertungenBefuellt++
    } catch (err) {
      console.error(`  [details exception] ${sv.firmenname}:`, err.message)
      bewertungenFailed++
    }
    await sleep(RATE_LIMIT_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Place-IDs befüllt: ${placeIdsBefuellt}`)
  console.log(`Place-IDs skipped (schon da): ${placeIdsSkipped}`)
  console.log(`Place-IDs failed:  ${placeIdsFailed}`)
  console.log(`Bewertungen befüllt: ${bewertungenBefuellt}`)
  console.log(`Bewertungen failed: ${bewertungenFailed}`)
}

main().catch((err) => {
  console.error('[backfill] FATAL:', err)
  process.exit(1)
})
