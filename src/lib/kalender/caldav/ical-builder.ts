// AAR-716: Erzeugt iCalendar-Strings (RFC 5545) für CalDAV-PUT-Requests.
//
// Wir bauen das ICS minimalistisch und händisch — keine Library nötig für
// die paar Felder die wir setzen (SUMMARY, DESCRIPTION, LOCATION, DTSTART,
// DTEND, UID, DTSTAMP). Apple iCloud + Fastmail + Nextcloud akzeptieren
// dieses Format problemlos.
//
// Wichtig:
//   - DTSTART/DTEND als UTC mit Z-Suffix (kein TZID nötig, simpler)
//   - CRLF-Line-Endings (RFC 5545)
//   - Folding bei langen Zeilen (>75 Oktette) — für unsere kurzen
//     Beschreibungen praktisch nie nötig, der Helper foldLine() handhabt
//     das defensiv falls jemand mal eine sehr lange DESCRIPTION reinpackt
//   - Spezial-Zeichen escapen: \, , ; und \n

const CRLF = '\r\n'

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  // RFC 5545: Zeilen >75 Oktette per CRLF + Whitespace umbrechen.
  if (line.length <= 75) return line
  const out: string[] = []
  let rest = line
  out.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 0) {
    out.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  return out.join(CRLF)
}

function formatUtc(iso: string): string {
  // YYYYMMDDTHHmmssZ
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
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

export type IcsEventInput = {
  uid: string
  summary: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  dtstampIso?: string
}

export function buildIcsEvent(input: IcsEventInput): string {
  const dtstamp = formatUtc(input.dtstampIso ?? new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claimondo//SV-Termin-Sync//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatUtc(input.startIso)}`,
    `DTEND:${formatUtc(input.endIso)}`,
    foldLine(`SUMMARY:${escapeText(input.summary)}`),
  ]
  if (input.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeText(input.description)}`))
  }
  if (input.location) {
    lines.push(foldLine(`LOCATION:${escapeText(input.location)}`))
  }
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')
  return lines.join(CRLF) + CRLF
}

export function generateIcalUid(): string {
  // crypto.randomUUID() im Node-Runtime verfügbar — auch unter Edge.
  const uuid = (globalThis.crypto?.randomUUID?.() ?? fallbackUuid())
  return `${uuid}@claimondo.de`
}

function fallbackUuid(): string {
  // Defensiver Fallback falls Web-Crypto fehlt (sollte in Node 20+ nicht
  // vorkommen — Cron-Routes laufen auf Node-Runtime).
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0'),
  ).join('-')
}
