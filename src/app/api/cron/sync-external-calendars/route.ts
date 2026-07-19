import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { syncAllExternalCalendars } from '@/lib/kalender/sync-to-cache'

// Cron: alle 5 Minuten (vercel.json)
// Sync externer Kalender-Events in sv_kalender_events_cache:
//   - Google FreeBusy (alle Profile mit Google-Verbindung; Token in profiles_oauth_secrets)
//   - CalDAV Events (alle aktiven sv_kalender_verbindungen)

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()

  try {
    const results = await syncAllExternalCalendars()

    const inserted = results.reduce((s, r) => s + r.inserted, 0)
    const deleted = results.reduce((s, r) => s + r.deleted, 0)
    const errors = results.filter((r) => r.error)

    if (errors.length > 0) {
      console.warn('[sync-calendars] Fehler bei', errors.length, 'Profilen:', errors.map((e) => `${e.profileId}(${e.source}): ${e.error}`).join(', '))
    }

    console.info(`[sync-calendars] ${results.length} Profile, +${inserted} -${deleted} in ${Date.now() - started}ms`)

    return NextResponse.json({
      ok: true,
      svs: results.length,
      inserted,
      deleted,
      errors: errors.length,
      ms: Date.now() - started,
    })
  } catch (err) {
    console.error('[sync-calendars] Cron-Fehler:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
