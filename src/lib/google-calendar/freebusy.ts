// AAR-694 Teil A: FreeBusy-Check im SV-Matching.
//
// Fragt pro SV die Google-Calendar-FreeBusy-API — mit Timeout, nicht-
// blockierend. Wenn der SV keinen Token hat / API nicht antwortet, wird er
// NICHT aus dem Kandidatenpool genommen (Fail-Open). Nur konkret bestätigte
// Busy-Slots lassen den Kandidaten rausfallen.

import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'

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
  const auth = await getGoogleOAuthClientForUser(svProfileId)
  if (!auth) return 'unbekannt' // SV hat keinen Calendar-Token

  const termin = new Date(terminIso)
  const timeMin = new Date(termin.getTime() - pufferMinuten * 60 * 1000)
  const timeMax = new Date(termin.getTime() + pufferMinuten * 60 * 1000)

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
    // Timeout, Token-Expired, Network — fail-open. Details nur ins Log.
    console.warn('[freebusy] Check für SV', svProfileId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
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
