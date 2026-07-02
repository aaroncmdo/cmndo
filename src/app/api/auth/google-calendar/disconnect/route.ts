// 2026-05-06 OAuth-Konsolidierung: Disconnect räumt jetzt sowohl
// profiles.google_* (Tokens, kanonische Quelle) als auch das
// sachverstaendige.gcal_connected-UI-Flag.

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const svc = createServiceClient()

  // Kanonische Token-Quelle nullen
  await svc.from('profiles').update({
    google_refresh_token: null,
    google_access_token: null,
    google_token_expires_at: null,
    google_connected_at: null,
  }).eq('id', user.id)

  // UI-Flag-Mirror clearen (gcal_connected). Die Legacy-Token-Spalten
  // gcal_access_token/refresh_token/gcal_token_expiry werden nicht mehr
  // angefasst (tot, per Migration entfernt — Tokens leben in profiles.google_*).
  await svc.from('sachverstaendige').update({
    gcal_connected: false,
  }).eq('profile_id', user.id)

  return NextResponse.json({ success: true })
}
