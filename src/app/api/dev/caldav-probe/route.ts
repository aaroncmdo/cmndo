// CalDAV-Debug-Probe (2026-07): der eingeloggte SV probt seine EIGENE CalDAV-Verbindung.
// Zeigt pro iCloud-/Nextcloud-/Fastmail-Kalender die Objekt-Anzahl im 35-Tage-Fenster UND
// gesamt, plus ob die gespeicherte calendar_url exakt gematcht wird. Diagnostiziert
// "verbunden, aber im Kalender keine Events" (Fenster vs. leer vs. URL-Mismatch->calendars[0]).
// Self-gated: nur die eigene Verbindung, kein fremder Zugriff.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { probeAllCalendars } from '@/lib/kalender/caldav/client'

export const dynamic = 'force-dynamic'

const SYNC_HORIZON_DAYS = 35

export async function GET() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return NextResponse.json({ error: 'Kein SV-Profil' }, { status: 403 })

  const db = createAdminClient()
  const { data: verb } = await db
    .from('sv_kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url, calendar_display_name, last_error')
    .eq('sv_id', sv.id)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!verb) return NextResponse.json({ error: 'Keine CalDAV-Verbindung fuer diesen SV' }, { status: 404 })

  const now = new Date()
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + SYNC_HORIZON_DAYS * 86400_000).toISOString()

  try {
    const password = decrypt(verb.password_encrypted as string)
    const probe = await probeAllCalendars(
      {
        serverUrl: verb.server_url as string,
        username: verb.username as string,
        password,
      },
      (verb.calendar_url as string) ?? '',
      fromIso,
      toIso,
    )
    return NextResponse.json({
      ok: true,
      storedCalendarUrl: verb.calendar_url,
      storedCalendarName: verb.calendar_display_name,
      connectionLastError: verb.last_error,
      matchedStoredUrl: probe.matchedStoredUrl,
      window: { from: fromIso, to: toIso, days: SYNC_HORIZON_DAYS },
      hint: 'windowedObjects=0 aber totalObjects>0 => Events liegen ausserhalb der naechsten 35 Tage (Vergangenheit/fern). matchedStoredUrl=false => Sync fetchte den falschen Kalender.',
      calendars: probe.calendars,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
