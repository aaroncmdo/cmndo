import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function refreshToken(svId: string, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret || !refreshToken) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  })
  const data = await res.json()
  if (!data.access_token) return null

  const svc = createServiceClient()
  await svc.from('sachverstaendige').update({
    gcal_access_token: data.access_token,
    gcal_token_expiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  }).eq('id', svId)

  return data.access_token
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const start = req.nextUrl.searchParams.get('start') ?? new Date().toISOString()
  const end = req.nextUrl.searchParams.get('end') ?? new Date(Date.now() + 7 * 86400000).toISOString()

  const svc = createServiceClient()
  const { data: sv } = await svc.from('sachverstaendige')
    .select('id, gcal_access_token, gcal_refresh_token, gcal_token_expiry, gcal_connected, gcal_calendar_id')
    .eq('profile_id', user.id).single()

  if (!sv?.gcal_connected || !sv.gcal_access_token) {
    return NextResponse.json({ events: [], connected: false })
  }

  // Check token expiry
  let token = sv.gcal_access_token
  if (sv.gcal_token_expiry && new Date(sv.gcal_token_expiry) < new Date()) {
    const newToken = await refreshToken(sv.id, sv.gcal_refresh_token ?? '')
    if (!newToken) {
      await svc.from('sachverstaendige').update({ gcal_connected: false }).eq('id', sv.id)
      return NextResponse.json({ events: [], connected: false, error: 'Token abgelaufen' })
    }
    token = newToken
  }

  // Fetch Google Calendar events
  try {
    const calId = sv.gcal_calendar_id ?? 'primary'
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime&maxResults=50`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return NextResponse.json({ events: [], connected: true, error: 'API Fehler' })

    const data = await res.json()
    const events = (data.items ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      title: e.summary ?? 'Kein Titel',
      start: (e.start as Record<string, unknown>)?.dateTime ?? (e.start as Record<string, unknown>)?.date,
      end: (e.end as Record<string, unknown>)?.dateTime ?? (e.end as Record<string, unknown>)?.date,
      location: e.location ?? null,
    }))

    return NextResponse.json({ events, connected: true })
  } catch {
    return NextResponse.json({ events: [], connected: true, error: 'Fetch fehlgeschlagen' })
  }
}
