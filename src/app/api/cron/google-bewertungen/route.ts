// CMM-30: Google Places Bewertungs-Cache täglicher Refresh.
// Lädt alle SVs mit google_place_id, fragt die Places Details API ab
// und schreibt Durchschnitt + Anzahl in google_bewertungen_cache.
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUndCacheGoogleBewertung } from '@/lib/google-bewertungen/fetch-und-cache'

const RATE_LIMIT_DELAY_MS = 120 // ~8 req/s, unter dem 10/s Limit

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
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

  // AAR-956: geteilter Helper (fetchUndCacheGoogleBewertung) — dieselbe Quelle
  // wie die SV-Selbst-Verknüpfung im Onboarding/Profil. Keine doppelte Fetch/
  // Upsert-Logik mehr.
  for (const sv of svs) {
    const r = await fetchUndCacheGoogleBewertung(sv.id, sv.google_place_id)
    if (r.ok) {
      updated++
    } else {
      console.error(`[CMM-30] ${sv.id}:`, r.error)
      failed++
    }
    await sleep(RATE_LIMIT_DELAY_MS)
  }

  return NextResponse.json({ ok: true, updated, failed, checked_at: new Date().toISOString() })
}
