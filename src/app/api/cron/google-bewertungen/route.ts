// CMM-30: Google Places Bewertungs-Cache täglicher Refresh.
// Lädt alle SVs mit google_place_id, fragt die Places Details API ab
// und schreibt Durchschnitt + Anzahl in google_bewertungen_cache.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place/details/json'
const RATE_LIMIT_DELAY_MS = 120 // ~8 req/s, unter dem 10/s Limit

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY nicht konfiguriert' }, { status: 500 })
  }

  const admin = createAdminClient()

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, google_place_id')
    .not('google_place_id', 'is', null)
    .eq('aktiv', true)

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  const svs = (profile ?? []) as Array<{ id: string; google_place_id: string }>
  let updated = 0
  let failed = 0

  for (const sv of svs) {
    try {
      const url = `${PLACES_API_BASE}?place_id=${encodeURIComponent(sv.google_place_id)}&fields=rating,user_ratings_total&key=${apiKey}`
      const res = await fetch(url)
      const json = await res.json() as {
        status: string
        result?: { rating?: number; user_ratings_total?: number }
      }

      if (json.status !== 'OK' || !json.result) {
        console.error(`[CMM-30] Places API Fehler für ${sv.id}:`, json.status)
        failed++
        continue
      }

      const { error: upsertErr } = await admin
        .from('google_bewertungen_cache')
        .upsert({
          profile_id: sv.id,
          durchschnitt: json.result.rating ?? null,
          anzahl_bewertungen: json.result.user_ratings_total ?? null,
          zuletzt_aktualisiert_am: new Date().toISOString(),
        }, { onConflict: 'profile_id' })

      if (upsertErr) {
        console.error(`[CMM-30] DB-Upsert Fehler für ${sv.id}:`, upsertErr.message)
        failed++
      } else {
        updated++
      }
    } catch (err) {
      console.error(`[CMM-30] Unerwarteter Fehler für ${sv.id}:`, err)
      failed++
    }

    await sleep(RATE_LIMIT_DELAY_MS)
  }

  return NextResponse.json({ ok: true, updated, failed, checked_at: new Date().toISOString() })
}
