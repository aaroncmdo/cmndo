// AAR-694 Teil A: FreeBusy-Check im SV-Matching.
// AAR-717: Multi-Provider-Fallback — wenn Google-Token fehlt aber CalDAV
// verbunden ist, nutzen wir CalDAV. Fail-open bleibt das Sicherheitsnetz.
//
// Fragt pro SV die Google-Calendar-FreeBusy-API — mit Timeout, nicht-
// blockierend. Wenn der SV keinen Token hat / API nicht antwortet, wird er
// NICHT aus dem Kandidatenpool genommen (Fail-Open). Nur konkret bestätigte
// Busy-Slots lassen den Kandidaten rausfallen.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { checkFreeBusy as checkCaldavFreeBusy } from '@/lib/kalender/caldav/client'

const FREEBUSY_TIMEOUT_MS = 2000

/**
 * Prüft ob der SV zum gewünschten Zeitpunkt (+/- Puffer) frei ist.
 *
 * Rückgabe:
 *   - 'frei': Google bestätigt, keine Busy-Slots im Fenster
 *   - 'belegt': Google liefert Busy-Slot → SV fällt aus
 *   - 'unbekannt': kein Token, API-Fehler, Timeout — SV bleibt Kandidat (fail-open)
 */
export async function checkSvFreeBusy(
  svProfileId: string,
  terminIso: string,
  pufferMinuten = 60,
): Promise<'frei' | 'belegt' | 'unbekannt'> {
  const termin = new Date(terminIso)
  const timeMin = new Date(termin.getTime() - pufferMinuten * 60 * 1000)
  const timeMax = new Date(termin.getTime() + pufferMinuten * 60 * 1000)

  // Google zuerst — häufigster Provider.
  const auth = await getGoogleOAuthClientForUser(svProfileId)
  if (auth) {
    try {
      const calendar = google.calendar({ version: 'v3', auth })
      const result = await Promise.race([
        calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: [{ id: 'primary' }],
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('freebusy-timeout')), FREEBUSY_TIMEOUT_MS),
        ),
      ])
      const busy = result.data.calendars?.primary?.busy ?? []
      return busy.length > 0 ? 'belegt' : 'frei'
    } catch (err) {
      console.warn('[freebusy] Google-Check für SV', svProfileId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
      // Fall durch zum CalDAV-Check.
    }
  }

  // AAR-717: CalDAV-Fallback. Lookup sv_id → aktive CalDAV-Verbindung.
  try {
    const db = createAdminClient()
    const { data: sv } = await db
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', svProfileId)
      .maybeSingle()
    if (!sv) return 'unbekannt'
    const { data: verb } = await db
      .from('sv_kalender_verbindungen')
      .select('server_url, username, password_encrypted, calendar_url')
      .eq('sv_id', sv.id as string)
      .eq('provider', 'caldav')
      .maybeSingle()
    if (!verb) return 'unbekannt'

    const password = decrypt(verb.password_encrypted as string)
    return await checkCaldavFreeBusy(
      {
        serverUrl: verb.server_url as string,
        username: verb.username as string,
        password,
      },
      (verb.calendar_url as string) ?? '',
      timeMin.toISOString(),
      timeMax.toISOString(),
    )
  } catch (err) {
    console.warn('[freebusy] CalDAV-Fallback für SV', svProfileId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
    return 'unbekannt'
  }
}

/**
 * Parallel-Check für mehrere SVs. Gibt pro SV das Ergebnis zurück.
 * Liefert Map<profileId, Status>. Timeout pro Call ist FREEBUSY_TIMEOUT_MS.
 */
export async function checkSvFreeBusyBatch(
  svProfileIds: string[],
  terminIso: string,
  pufferMinuten = 60,
): Promise<Map<string, 'frei' | 'belegt' | 'unbekannt'>> {
  const entries = await Promise.all(
    svProfileIds.map(async (id) => [id, await checkSvFreeBusy(id, terminIso, pufferMinuten)] as const),
  )
  return new Map(entries)
}
