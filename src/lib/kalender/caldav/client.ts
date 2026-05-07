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
import { buildIcsEvent, generateIcalUid, type IcsEventInput } from './ical-builder'

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
    // Einfacher Split pro VEVENT-Block — robust gegen mehrere Events in
    // einer Kalender-Object-Datei (selten, aber tsdav kann das).
    const blocks = data.split('BEGIN:VEVENT')
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i].split('END:VEVENT')[0]
      const startMatch = DTSTART_RE.exec(block)
      const endMatch = DTEND_RE.exec(block)
      if (!startMatch) continue
      const start = parseIcalDateTime(startMatch[1])
      // Wenn DTEND fehlt (zulässig in iCalendar), nehmen wir start + 1h.
      const end = endMatch
        ? parseIcalDateTime(endMatch[1])
        : (start ? new Date(new Date(start).getTime() + 60 * 60_000).toISOString() : null)
      if (!start || !end) continue
      events.push({ start, end })
    }
  }
  return events
}

// AAR-872: Vollstaendigere Event-Daten (UID, Titel, Location) fuer den
// „Stop hinzufuegen"-Flow auf der Heute-Page. Wir koennen `listCalendarEvents`
// nicht direkt erweitern weil er in busy-slots-Hot-Paths laeuft — hier eine
// Sibling-Variante mit zusaetzlichem Property-Parsing.
export type CalDavEventFull = {
  uid: string
  summary: string | null
  location: string | null
  start: string
  end: string
}

const UID_RE = /^UID(?:;[^:]*)?:(.+)$/m
const SUMMARY_RE = /^SUMMARY(?:;[^:]*)?:(.+)$/m
const LOCATION_RE = /^LOCATION(?:;[^:]*)?:(.+)$/m

function unfoldIcal(s: string): string {
  // RFC 5545: lange Lines werden mit CRLF + Whitespace umgebrochen.
  return s.replace(/\r?\n[ \t]/g, '')
}

function unescapeIcalText(s: string): string {
  // RFC 5545: \\, \,, \;, \n im TEXT-Wert.
  return s.replace(/\\([\\,;nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))
}

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

  const events: CalDavEventFull[] = []
  for (const obj of objects) {
    const raw = (obj as { data?: string }).data
    if (typeof raw !== 'string' || !raw.includes('BEGIN:VEVENT')) continue
    const data = unfoldIcal(raw)
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
      const uidMatch = UID_RE.exec(block)
      const summaryMatch = SUMMARY_RE.exec(block)
      const locationMatch = LOCATION_RE.exec(block)
      events.push({
        uid: (uidMatch?.[1] ?? '').trim() || `caldav-${start}-${i}`,
        summary: summaryMatch ? unescapeIcalText(summaryMatch[1].trim()) : null,
        location: locationMatch ? unescapeIcalText(locationMatch[1].trim()) : null,
        start,
        end,
      })
    }
  }
  return events
}

// ===== AAR-716: Write-Operationen ============================================
//
// CalDAV-PUT pattern (Apple iCloud + Fastmail + Nextcloud):
//   PUT <calendarUrl>/<filename>.ics
//   If-None-Match: *      (Create — 412 wenn Datei schon da)
//   If-Match: <etag>      (Update — Server akzeptiert Update nur wenn
//                          das Etag noch passt)
//
// tsdav abstrahiert das via createCalendarObject / updateCalendarObject.
// Bei Apple iCloud landet das Objekt in einem vom Server gewählten Pfad —
// die finale URL liefert tsdav per `.url` zurück, die wir persistieren.
//
// Fail-soft: Aufrufer müssen try/catch wickeln; wir loggen + werfen
// CalDavError. Der Termin-Flow geht bei Sync-Fehler weiter.

export type CalDavCreateInput = {
  creds: CalDavCredentials
  calendarUrl: string
  event: Omit<IcsEventInput, 'uid'> & { uid?: string }
}

export type CalDavCreateResult = {
  objectUrl: string
  uid: string
}

/**
 * Erstellt ein Event auf dem CalDAV-Server. Generiert UID + ICS-Body und
 * sendet via tsdav.createCalendarObject. Liefert objectUrl + uid zurück
 * für späteres Update/Delete.
 */
export async function createCalendarEvent(
  input: CalDavCreateInput,
): Promise<CalDavCreateResult> {
  const uid = input.event.uid ?? generateIcalUid()
  const ics = buildIcsEvent({ ...input.event, uid })
  const filename = `${uid}.ics`

  try {
    const client = await createClient(input.creds)
    const calendars = await client.fetchCalendars()
    const cal = calendars.find((c) => String(c.url) === input.calendarUrl) ?? calendars[0]
    if (!cal) {
      throw new CalDavError('Kein Kalender gefunden', 'not_found')
    }

    const res = await Promise.race([
      client.createCalendarObject({
        calendar: cal,
        filename,
        iCalString: ics,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CalDavError('Timeout beim Create', 'network')), REQUEST_TIMEOUT_MS),
      ),
    ])

    // tsdav liefert ein Response-ähnliches Objekt mit .url (string)
    const objectUrl = extractObjectUrl(res, cal.url, filename)
    if (!objectUrl) {
      throw new CalDavError('Server lieferte keine Objekt-URL zurück', 'other')
    }
    return { objectUrl, uid }
  } catch (err) {
    if (err instanceof CalDavError) throw err
    throw new CalDavError(
      `Event-Create fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      'other',
      err,
    )
  }
}

export type CalDavUpdateInput = {
  creds: CalDavCredentials
  objectUrl: string
  event: IcsEventInput
}

/**
 * Aktualisiert ein bestehendes CalDAV-Event per PUT auf seine objectUrl.
 * UID muss unverändert bleiben. Wir holen das aktuelle Etag nicht — Apple
 * akzeptiert PUT ohne If-Match (Last-Write-Wins). Falls strenger Server
 * 412 zurückgibt, müsste der Aufrufer Re-Fetch + Retry machen — heute
 * out-of-scope.
 */
export async function updateCalendarEvent(input: CalDavUpdateInput): Promise<void> {
  const ics = buildIcsEvent(input.event)
  try {
    const client = await createClient(input.creds)
    await Promise.race([
      client.updateCalendarObject({
        calendarObject: {
          url: input.objectUrl,
          data: ics,
          // etag null = Server-seitiges Last-Write-Wins
          etag: '*',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CalDavError('Timeout beim Update', 'network')), REQUEST_TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    if (err instanceof CalDavError) throw err
    throw new CalDavError(
      `Event-Update fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      'other',
      err,
    )
  }
}

export type CalDavDeleteInput = {
  creds: CalDavCredentials
  objectUrl: string
}

/**
 * Löscht ein CalDAV-Event. 404 vom Server gilt als Erfolg (idempotent).
 */
export async function deleteCalendarEvent(input: CalDavDeleteInput): Promise<void> {
  try {
    const client = await createClient(input.creds)
    await Promise.race([
      client.deleteCalendarObject({
        calendarObject: { url: input.objectUrl, etag: '*' },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CalDavError('Timeout beim Delete', 'network')), REQUEST_TIMEOUT_MS),
      ),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/404|not.?found/i.test(msg)) return // idempotent — Event war eh schon weg
    if (err instanceof CalDavError) throw err
    throw new CalDavError(`Event-Delete fehlgeschlagen: ${msg}`, 'other', err)
  }
}

function extractObjectUrl(
  response: unknown,
  calendarUrl: string,
  filename: string,
): string | null {
  // tsdav-Antworten haben unterschiedliche Shapes je nach Version. Wir
  // versuchen mehrere Pfade defensiv:
  if (response && typeof response === 'object') {
    const r = response as { url?: unknown; headers?: { get?: (k: string) => string | null } }
    if (typeof r.url === 'string' && r.url.length > 0) return r.url
    const loc = r.headers?.get?.('location') ?? r.headers?.get?.('Location')
    if (typeof loc === 'string' && loc.length > 0) {
      // Location kann relativ sein → an calendarUrl anhängen
      if (loc.startsWith('http')) return loc
      const base = calendarUrl.replace(/\/$/, '')
      return `${base}/${loc.replace(/^\//, '')}`
    }
  }
  // Fallback: Wir kennen den Filename, hängen ihn an calendarUrl —
  // funktioniert bei Apple iCloud zuverlässig.
  const base = calendarUrl.replace(/\/$/, '')
  return `${base}/${filename}`
}
