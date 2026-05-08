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
