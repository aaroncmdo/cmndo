// Berliner Kalendertag-Grenzen als UTC-Instants.
//
// Warum: Der Tagesmodus (/gutachter/heute) + die Tages-Session filtern Termine
// auf „heute". Frueher wurde das Fenster per `new Date().setHours(0,0,0,0)` in
// der SERVER-lokalen Zeitzone gerechnet. Laeuft der VPS auf UTC (Prod: DB-TZ=UTC,
// kein TZ=Europe/Berlin-Pin), driftet die Tag-Grenze fuer deutsche Nutzer um den
// UTC-Offset (1–2h) — rund um Mitternacht zeigt der SV den falschen Kalendertag.
// Dieser Helper verankert „heute" hart an Europe/Berlin, unabhaengig von der
// Server-TZ, DST-korrekt (23h/25h an den Umstellungstagen).

const BERLIN = 'Europe/Berlin'

/** Berliner Kalendertag ('YYYY-MM-DD') fuer einen Zeitpunkt. */
export function berlinIsoDate(now: Date = new Date()): string {
  // 'en-CA' formatiert als YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** UTC-Offset von Europe/Berlin in Minuten zum gegebenen Zeitpunkt (+60 Winter, +120 Sommer). */
function berlinOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN,
    hourCycle: 'h23', // 00–23, vermeidet die '24:00'-Engine-Quirk
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const wallAsUtc = Date.UTC(
    val('year'),
    val('month') - 1,
    val('day'),
    val('hour'),
    val('minute'),
    val('second'),
  )
  return Math.round((wallAsUtc - at.getTime()) / 60_000)
}

/** UTC-Instant der Berliner Mitternacht (00:00 lokal) fuer ein 'YYYY-MM-DD'. */
function berlinMidnightUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  // Schaetzung: Berliner Mitternacht ~ UTC-Mitternacht; per Offset korrigieren.
  // Der Offset ist zwischen 00:00 lokal und 01:00/02:00 lokal stabil (DST-
  // Umstellungen passieren um 02:00/03:00 lokal), daher genuegt ein Schritt.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  const off = berlinOffsetMinutes(new Date(guess))
  return new Date(guess - off * 60_000)
}

/** Naechster Kalendertag ('YYYY-MM-DD'), reine UTC-Arithmetik (Monats-/Jahres-Rollover). */
function nextIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/**
 * Halboffenes UTC-Fenster [startUtc, endUtc) des Berliner Kalendertags, in dem
 * `now` liegt, plus der Berliner ISO-Tag. Fuer `.gte('start_zeit', startUtc)` /
 * `.lt('start_zeit', endUtc)`-Queries und `.eq('datum', isoDate)`.
 */
export function berlinDayRangeUtc(now: Date = new Date()): {
  startUtc: Date
  endUtc: Date
  isoDate: string
} {
  const isoDate = berlinIsoDate(now)
  const startUtc = berlinMidnightUtc(isoDate)
  const endUtc = berlinMidnightUtc(nextIsoDate(isoDate))
  return { startUtc, endUtc, isoDate }
}
