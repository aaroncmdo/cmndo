// AAR-318 Teil B: Universeller iCalendar (.ics) Generator.
// Funktioniert mit Apple Kalender, Outlook, Google Calendar, Thunderbird, etc.
// RFC 5545 — wir nutzen das Minimum-Subset für VEVENT.

export type IcalEvent = {
  uid: string
  summary: string
  description?: string
  location?: string
  startsAt: Date
  endsAt: Date
  organizerName?: string
  organizerEmail?: string
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatIcsDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ — UTC-Format (Z-Suffix)
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function escapeText(text: string): string {
  // RFC 5545 §3.3.11: Backslash, Komma, Semikolon escapen; Newlines als \n
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Faltet Zeilen nach 75 Oktetten gemäß RFC 5545 §3.1. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return parts.join('\r\n')
}

export function buildIcs(event: IcalEvent): string {
  const now = formatIcsDate(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claimondo//SV-Termin//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}@claimondo.de`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsDate(event.startsAt)}`,
    `DTEND:${formatIcsDate(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.organizerName || event.organizerEmail) {
    const cn = event.organizerName ? `;CN=${escapeText(event.organizerName)}` : ''
    const mail = event.organizerEmail ?? 'no-reply@claimondo.de'
    lines.push(`ORGANIZER${cn}:mailto:${mail}`)
  }
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.map(fold).join('\r\n') + '\r\n'
}
