// CalDAV-Debug-Probe (2026-07): probt eine CalDAV-Verbindung live. Zeigt pro Kalender die
// Objekt-Anzahl im 35-Tage-Fenster UND gesamt + ob die gespeicherte calendar_url exakt gematcht
// wird. Diagnostiziert "verbunden, aber im Kalender keine Events" (Fenster vs. leer vs. URL-Mismatch).
//
// Gating: der eingeloggte SV probt sein eigenes Konto; ein Admin darf per ?sv_id=<uuid> ein
// beliebiges SV-Konto proben. Kein Credential im Output. Zeigt bei "kein SV" die eingeloggte
// Identität, damit klar ist welches Konto aktiv ist (häufigste Ursache: falsches Konto eingeloggt).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { probeAllCalendars } from '@/lib/kalender/caldav/client'

export const dynamic = 'force-dynamic'

const SYNC_HORIZON_DAYS = 35

export async function GET(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: prof } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const rolle = (prof?.rolle as string | null) ?? null
  const targetSvId = new URL(req.url).searchParams.get('sv_id')

  // SV bestimmen: Admin darf ?sv_id= überschreiben, sonst das eigene SV-Konto.
  let svId: string | null = null
  if (targetSvId && rolle === 'admin') {
    svId = targetSvId
  } else {
    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    svId = sv?.id ?? null
  }
  if (!svId) {
    return NextResponse.json(
      {
        error: 'Kein SV-Profil für das eingeloggte Konto',
        eingeloggt_als: user.email,
        rolle,
        hinweis:
          'Du bist NICHT als dein SV-Konto eingeloggt. Logge dich als aaron.sprafke@claimondo.de (dein SV) ein und rufe die URL erneut auf — oder als Admin: ?sv_id=677400bf-dd31-4581-a645-07a7d624c190',
      },
      { status: 403 },
    )
  }

  const db = createAdminClient()
  const { data: verb } = await db
    .from('sv_kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url, calendar_display_name, last_error')
    .eq('sv_id', svId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!verb) {
    return NextResponse.json(
      { error: 'Keine CalDAV-Verbindung für dieses SV-Konto', sv_id: svId, eingeloggt_als: user.email },
      { status: 404 },
    )
  }

  const now = new Date()
  const fromIso = now.toISOString()
  const toIso = new Date(now.getTime() + SYNC_HORIZON_DAYS * 86400_000).toISOString()

  try {
    const password = decrypt(verb.password_encrypted as string)
    const probe = await probeAllCalendars(
      { serverUrl: verb.server_url as string, username: verb.username as string, password },
      (verb.calendar_url as string) ?? '',
      fromIso,
      toIso,
    )
    return NextResponse.json({
      ok: true,
      eingeloggt_als: user.email,
      probed_sv_id: svId,
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
