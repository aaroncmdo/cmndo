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

// AAR-721: Echte Event-Liste mit Start/End-Zeiten aus CalDAV ziehen.
// Pessimistischer Boolean-Range-Check (checkFreeBusy) war inakzeptabel:
// ein Termin in 12 Wochen würde alle Dispatch-Slots blockieren.
//
// tsdav liefert DAVObject[] mit .data (iCalendar-String). Wir parsen
// DTSTART/DTEND per Regex — robust gegen kaputte ics-Einträge (einzelne
// Fehler führen zu skip, nicht zu Gesamtausfall).
export type CalDavEvent = { start: string; end: string }

const DTSTART_RE = /^DTSTART(?:;[^:]*)?:(.+)$/m
const DTEND_RE = /^DTEND(?:;[^:]*)?:(.+)$/m

/**
 * iCalendar-DateTime → ISO-String. Formate die wir akzeptieren:
 *   20260423T100000Z         (UTC)
 *   20260423T100000          (Floating, wird als lokal interpretiert)
 *   20260423                 (DATE-only, ganzer Tag)
 * Rückgabe null wenn Parsing fehlschlägt.
 */
function parseIcalDateTime(raw: string): string | null {
  const s = raw.trim()
  // DATE-only: YYYYMMDD
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    const iso = new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString()
    return iso
  }
  // DATETIME: YYYYMMDDTHHmmss[Z]
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(s)
  if (dateTime) {
    const [, y, m, d, hh, mm, ss, z] = dateTime
    const base = `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? 'Z' : ''}`
    const parsed = new Date(base)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toISOString()
  }
  return null
}

/**
 * Lädt alle Events im angegebenen Zeitraum und extrahiert pro Event
 * DTSTART/DTEND. Recurring Events (RRULE) werden momentan nur als
 * „erste Instanz" erkannt — für MVP ausreichend, tiefer RRULE-Expansion
 * kommt mit AAR-716 (Write-Back-Scope).
 *
 * Fail-safe: Parsing-Fehler skippen einzelne Events, gesamte Liste wird
 * zurückgegeben. Bei Verbindungsfehler throw `CalDavError`.
 */
export async function listCalendarEvents(
  creds: CalDavCredentials,
  calendarUrl: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<CalDavEvent[]> {
  const client = await createClient(creds)
  const calendars = await client.fetchCalendars()
  const cal = calendars.find((c) => String(c.url) === calendarUrl) ?? calendars[0]
  if (!cal) return []

  let objects: unknown[]
  try {
    objects = (await Promise.race([
      client.fetchCalendarObjects({
        calendar: cal,
        timeRange: { start: rangeStartIso, end: rangeEndIso },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS * 3),
      ),
    ])) as unknown[]
  } catch (err) {
    throw new CalDavError(
      `Event-Liste konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
      'other',
      err,
    )
  }

  const events: CalDavEvent[] = []
  for (const obj of objects) {
    const data = (obj as { data?: string }).data
    if (typeof data !== 'string' || !data.includes('BEGIN:VEVENT')) continue
    const blocks = data.split('BEGIN:VEVENT')
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0]
      const startMatch = DTSTART_RE.exec(block)
      const endMatch = DTEND_RE.exec(block)
      if (!startMatch) continue
      const start = parseIcalDateTime(startMatch[1])
      const end = endMatch
        ? parseIcalDateTime(endMatch[1])
        : (start ? new Date(new Date(start).getTime() + 60 * 60_000).toISOString() : null)
      if (!start || !end) continue
      events.push({ start, end })
    }
  }
  return events
}

// AAR-716: Erweiterter Event-Typ mit Metadaten für CalDAV-Write-Back.
export type CalDavEventFull = CalDavEvent & {
  uid: string
  summary: string
  location?: string
  objectUrl?: string
}

const SUMMARY_RE = /^SUMMARY:(.+)$/m
const LOCATION_RE = /^LOCATION:(.+)$/m
const UID_RE = /^UID:(.+)$/m

export async function listCalendarEventsFull(
  creds: CalDavCredentials,
  calendarUrl: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<CalDavEventFull[]> {
  const client = await createClient(creds)
  const calendars = await client.fetchCalendars()
  const cal = calendars.find((c) => String(c.url) === calendarUrl) ?? calendars[0]
  if (!cal) return []

  let objects: unknown[]
  try {
    objects = (await Promise.race([
      client.fetchCalendarObjects({ calendar: cal, timeRange: { start: rangeStartIso, end: rangeEndIso } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS * 3)),
    ])) as unknown[]
  } catch (err) {
    throw new CalDavError(`Event-Liste konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`, 'other', err)
  }

  const events: CalDavEventFull[] = []
  for (const obj of objects) {
    const raw = obj as { data?: string; url?: string }
    const data = raw.data
    if (typeof data !== 'string' || !data.includes('BEGIN:VEVENT')) continue
    const blocks = data.split('BEGIN:VEVENT')
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0]
      const startMatch = DTSTART_RE.exec(block)
      const endMatch = DTEND_RE.exec(block)
      if (!startMatch) continue
      const start = parseIcalDateTime(startMatch[1])
      const end = endMatch ? parseIcalDateTime(endMatch[1]) : (start ? new Date(new Date(start).getTime() + 60 * 60_000).toISOString() : null)
      if (!start || !end) continue
      const uid = (UID_RE.exec(block)?.[1] ?? '').trim()
      const summary = (SUMMARY_RE.exec(block)?.[1] ?? '').trim()
      const location = LOCATION_RE.exec(block)?.[1]?.trim()
      events.push({ start, end, uid, summary, ...(location ? { location } : {}), objectUrl: raw.url })
    }
  }
  return events
}

type CalDavEventInput = {
  uid?: string
  summary: string
  description?: string
  location?: string
  startIso: string
  endIso: string
}

function buildIcs(event: CalDavEventInput & { uid: string }): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, '').replace('.000', '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claimondo//DE',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(event.startIso)}`,
    `DTEND:${fmt(event.endIso)}`,
    `SUMMARY:${event.summary}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`)
  if (event.location) lines.push(`LOCATION:${event.location}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export async function createCalendarEvent({
  creds,
  calendarUrl,
  event,
}: {
  creds: CalDavCredentials
  calendarUrl: string
  event: CalDavEventInput
}): Promise<{ objectUrl: string; uid: string }> {
  const uid = event.uid ?? `claimondo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ics = buildIcs({ ...event, uid })
  const client = await createClient(creds)
  const calendars = await client.fetchCalendars()
  const cal = calendars.find((c) => String(c.url) === calendarUrl) ?? calendars[0]
  if (!cal) throw new CalDavError('Kalender nicht gefunden', 'not_found')

  const objectUrl = `${String(cal.url).replace(/\/$/, '')}/${uid}.ics`
  await client.createCalendarObject({ calendar: cal, filename: `${uid}.ics`, iCalString: ics })
  return { objectUrl, uid }
}

export async function updateCalendarEvent({
  creds,
  objectUrl,
  event,
}: {
  creds: CalDavCredentials
  objectUrl: string
  event: CalDavEventInput & { uid: string }
}): Promise<void> {
  const ics = buildIcs(event)
  const client = await createClient(creds)
  await client.updateCalendarObject({ calendarObject: { url: objectUrl, data: ics, etag: '' } })
}

export async function deleteCalendarEvent({
  creds,
  objectUrl,
}: {
  creds: CalDavCredentials
  objectUrl: string
}): Promise<void> {
  const client = await createClient(creds)
  await client.deleteCalendarObject({ calendarObject: { url: objectUrl, etag: '' } })
}
