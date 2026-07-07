// CalDAV-Debug (2026-07): triggert den Write-back eines gutachter_termine in den iCloud-Kalender
// des SVs (syncSvTerminToCalDav -> caldavProvider -> createCalendarEvent). Fuer den End-to-End-Test
// "Claimondo-Termin erscheint in iCloud". Danach wird caldav_object_url/caldav_event_uid gesetzt.
// Debug-Endpoint (jeder eingeloggte Nutzer). TODO nach Debug: entfernen.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const terminId = new URL(req.url).searchParams.get('termin_id')
  if (!terminId) {
    return NextResponse.json({ error: 'termin_id fehlt (?termin_id=<uuid>)' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: before } = await db
    .from('gutachter_termine')
    .select('id, assignee_id, assignee_typ, status, caldav_object_url')
    .eq('id', terminId)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: 'Termin nicht gefunden', termin_id: terminId }, { status: 404 })

  const { syncSvTerminToCalDav } = await import('@/lib/kalender/caldav/sv-termin-sync')
  let writeError: string | null = null
  try {
    await syncSvTerminToCalDav(terminId)
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err)
  }

  // Erfolg = caldav_object_url ist jetzt gesetzt (der Provider schreibt sie beim Create zurueck).
  const { data: after } = await db
    .from('gutachter_termine')
    .select('id, caldav_object_url, caldav_event_uid, caldav_synced_at')
    .eq('id', terminId)
    .maybeSingle()

  return NextResponse.json({
    ok: !!after?.caldav_object_url,
    termin_id: terminId,
    eingeloggt_als: user.email,
    write_error: writeError,
    caldav_object_url: after?.caldav_object_url ?? null,
    caldav_event_uid: after?.caldav_event_uid ?? null,
    caldav_synced_at: after?.caldav_synced_at ?? null,
    hint: 'ok:true + caldav_object_url gesetzt => Termin wurde in iCloud geschrieben. Sonst write_error pruefen (z.B. auth_failed / kein Kalender).',
  })
}
