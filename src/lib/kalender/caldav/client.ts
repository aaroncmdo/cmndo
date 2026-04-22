// AAR-717: CalDAV-Client-Wrapper um tsdav.
//
// Scope (Read-only): Verbindungs-Test + Kalender-Discovery + Free-Busy-
// Query für einen Zeitraum. Events schreiben = AAR-716.
//
// Provider-Presets:
//   - Apple iCloud:  https://caldav.icloud.com (auto-discovery via
//                    /.well-known/caldav)
//   - Custom:        User gibt Server-URL selbst ein
//
// Fehler werden als typisierte CalDavError-Instanzen geworfen, damit der
// Healthcheck-Cron + UI saubere Meldungen geben können.

import { DAVClient } from 'tsdav'

export class CalDavError extends Error {
  code: 'auth_failed' | 'network' | 'not_found' | 'other'
  cause?: unknown
  constructor(
    message: string,
    code: CalDavError['code'] = 'other',
    cause?: unknown,
  ) {
    super(message)
    this.name = 'CalDavError'
    this.code = code
    this.cause = cause
  }
}

const REQUEST_TIMEOUT_MS = 6000

export type CalDavCredentials = {
  serverUrl: string
  username: string
  password: string
}

export type CalDavCalendar = {
  url: string
  displayName: string
  ctag?: string | null
}

async function createClient(creds: CalDavCredentials): Promise<DAVClient> {
  const client = new DAVClient({
    serverUrl: creds.serverUrl,
    credentials: { username: creds.username, password: creds.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  })
  try {
    await Promise.race([
      client.login(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new CalDavError('Timeout beim Login', 'network')), REQUEST_TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof CalDavError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    if (/401|unauthorized|authentication/i.test(msg)) {
      throw new CalDavError(
        'Login fehlgeschlagen — Benutzername oder App-Passwort falsch',
        'auth_failed',
        err,
      )
    }
    if (/ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
      throw new CalDavError(
        'CalDAV-Server nicht erreichbar — Server-URL prüfen',
        'network',
        err,
      )
    }
    throw new CalDavError(`CalDAV-Fehler: ${msg}`, 'other', err)
  }
  return client
}

/**
 * Verbindet sich, listet alle Kalender. Wirft CalDavError bei Fehler.
 * Verwendet vom Connect-Flow — User wählt danach seinen Hauptkalender.
 */
export async function listCalendars(creds: CalDavCredentials): Promise<CalDavCalendar[]> {
  const client = await createClient(creds)
  try {
    const calendars = await client.fetchCalendars()
    return calendars
      .filter((c) => c.url)
      .map((c) => ({
        url: String(c.url),
        displayName:
          typeof c.displayName === 'string'
            ? c.displayName
            : String(c.url).replace(/\/$/, '').split('/').pop() ?? 'Kalender',
        ctag: typeof c.ctag === 'string' ? c.ctag : null,
      }))
  } catch (err) {
    if (err instanceof CalDavError) throw err
    throw new CalDavError(
      `Kalender-Liste konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
      'other',
      err,
    )
  }
}

/**
 * Prüft ob ein Zeitfenster frei ist (keine Events überlappen). Liefert
 * 'frei' | 'belegt' | 'unbekannt' — dieselbe Semantik wie der Google-
 * Free-Busy-Check in findBestSV, damit der Dispatcher-Code uniform
 * dispatchen kann.
 *
 * Implementierung: calendarQuery mit VEVENT-Filter auf [startIso, endIso].
 * Bei Fehler liefern wir 'unbekannt' (fail-open) — der Dispatch soll nie
 * an CalDAV-Hickups scheitern.
 */
export async function checkFreeBusy(
  creds: CalDavCredentials,
  calendarUrl: string,
  startIso: string,
  endIso: string,
): Promise<'frei' | 'belegt' | 'unbekannt'> {
  try {
    const client = await createClient(creds)
    const calendars = await client.fetchCalendars()
    const cal = calendars.find((c) => String(c.url) === calendarUrl) ?? calendars[0]
    if (!cal) return 'unbekannt'

    const objects = await Promise.race([
      client.fetchCalendarObjects({
        calendar: cal,
        timeRange: { start: startIso, end: endIso },
      }),
      new Promise<unknown[]>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS),
      ),
    ])
    const arr = (objects as unknown[]) ?? []
    return arr.length > 0 ? 'belegt' : 'frei'
  } catch {
    // fail-open
    return 'unbekannt'
  }
}

/**
 * Leichtgewichtiger Connection-Ping für den Healthcheck-Cron — kein
 * Event-Fetch, nur Login + Account-Discovery. Wirft bei Fehler.
 */
export async function pingConnection(creds: CalDavCredentials): Promise<void> {
  await createClient(creds)
}
