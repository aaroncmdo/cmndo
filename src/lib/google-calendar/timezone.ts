// 2026-05-06: Zentraler Helper für Google-Calendar Wall-Clock-Konvertierung.
//
// Problem: Wenn man dateTime mit Offset (z. B. "2026-05-06T09:00:00+00:00")
// UND zusätzlich timeZone='Europe/Berlin' an die Google-Calendar-API sendet,
// ignoriert Google in der Praxis den Offset und interpretiert die Wall-
// Portion als Lokalzeit der angegebenen timeZone. Folge: 2h-Versatz im
// Sommer (UTC-Wall wird als Berlin-Wall gelesen).
//
// Empfohlener Pattern laut Google-Doku: dateTime als IANA-Lokalzeit-Wall-
// Clock OHNE Offset senden, dazu timeZone='Europe/Berlin'. Erzeugt
// deterministisch die korrekte Anzeige inkl. DST-Übergängen.
//
// Verwendung in allen Sync-Pfaden (admin_termine, gutachter_termine,
// generic events.ts) damit das Pattern einheitlich bleibt.

export const GOOGLE_CALENDAR_TIMEZONE = 'Europe/Berlin'

export function toBerlinWallClock(iso: string): string {
  const d = new Date(iso)
  // sv-SE liefert "YYYY-MM-DD HH:mm:ss" — durch Replace zu RFC3339-Local.
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: GOOGLE_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d)
  return wall.replace(' ', 'T')
}

// AAR-956 TZ-Korrektur (Ansatz 2): Berlin-Wall-Clock -> echter UTC-Instant.
// Berlin-Offset zum gegebenen UTC-Instant via Intl (DST-korrekt).
function berlinOffsetMinutes(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: GOOGLE_CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return (asUtc - utcDate.getTime()) / 60_000
}

/**
 * Interpretiert einen Wall-Clock-String ("YYYY-MM-DDTHH:mm[:ss]" oder mit
 * Space-Separator) als Europe/Berlin und liefert den echten UTC-Instant als
 * ISO-Z-String. DST-korrekt (CET +1h / CEST +2h).
 *
 * Inverse zu {@link toBerlinWallClock}. Verwendung: Slot-Generierung +
 * Termin-Speicherung (true-UTC statt naked-Wall-Clock-as-UTC).
 *
 * Hinweis: Wall-Clock-Zeiten exakt innerhalb der DST-Sprungstunde
 * (02:00–03:00 am Umstellungstag) sind best-effort — fuer Termin-Geschaeftszeiten
 * (09–17) irrelevant.
 */
export function berlinWallClockToUtc(wall: string): string {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) throw new Error(`berlinWallClockToUtc: ungueltiger Wall-Clock-String "${wall}"`)
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0)
  const offset = berlinOffsetMinutes(new Date(guess))
  return new Date(guess - offset * 60_000).toISOString()
}

/**
 * Zentraler, expliziter Berlin-Formatter fuer nutzersichtbare Termin-Zeiten.
 * Kapselt `timeZone:'Europe/Berlin'`, damit kein Call-Site die TZ vergisst
 * (runtime-/browser-TZ-unabhaengig). Default: vollstaendiges de-DE Datum+Zeit.
 */
export function formatBerlin(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('de-DE', { timeZone: GOOGLE_CALENDAR_TIMEZONE, ...opts })
}
