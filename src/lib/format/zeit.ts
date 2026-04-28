// CMM-26: Uhrzeit-Normalisierung für freie Eingaben aus dem Lead-Flow.
//
// Postgres `time` akzeptiert nur `HH:MM[:SS]`. Der Dispatch-Wizard erlaubt aber
// freie Eingaben („14 uhr", „ca. 14:30", „1430") — der convertLeadToClaim-
// Insert kracht dann mit „invalid input syntax for type time".
//
// `parseUhrzeit` normalisiert eine freie Eingabe zu `HH:MM:SS` oder gibt
// `null` zurück, wenn nichts Verwertbares drin steht. So bleibt der Lead-
// Save tolerant und der Claim-Insert kann den normalisierten Wert direkt
// in die `time`-Spalte schreiben.

const ZEIT_RE_HHMM = /^(\d{1,2})\s*[:.]\s*(\d{1,2})$/
const ZEIT_RE_NUR_STUNDE = /^(\d{1,2})$/
const ZEIT_RE_HHMM_LANG = /^(\d{2})(\d{2})$/

/**
 * Parst eine freie Uhrzeit-Eingabe und gibt `HH:MM:SS` zurück.
 *
 * Akzeptiert u. a.:
 *   - `14:30`, `14.30`, `1430` → `14:30:00`
 *   - `14 uhr`, `ca. 14 Uhr`, `14`, `14h` → `14:00:00`
 *   - `08:05` → `08:05:00`
 *
 * Gibt `null` zurück bei leerem Input oder wenn die Stunde > 23 / Minute > 59 ist.
 */
export function parseUhrzeit(input: string | null | undefined): string | null {
  if (!input) return null
  const cleaned = String(input)
    .toLowerCase()
    .replace(/uhr|h\b|ca\.?|gegen|um|vormittags|nachmittags|abends|morgens/g, '')
    .replace(/\s+/g, '')
    .trim()
  if (!cleaned) return null

  let stunde: number | null = null
  let minute = 0

  const m1 = cleaned.match(ZEIT_RE_HHMM)
  if (m1) {
    stunde = Number(m1[1])
    minute = Number(m1[2])
  } else {
    const m2 = cleaned.match(ZEIT_RE_HHMM_LANG)
    if (m2) {
      stunde = Number(m2[1])
      minute = Number(m2[2])
    } else {
      const m3 = cleaned.match(ZEIT_RE_NUR_STUNDE)
      if (m3) {
        stunde = Number(m3[1])
        minute = 0
      }
    }
  }

  if (stunde === null || Number.isNaN(stunde) || Number.isNaN(minute)) return null
  if (stunde < 0 || stunde > 23) return null
  if (minute < 0 || minute > 59) return null

  const hh = String(stunde).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${hh}:${mm}:00`
}
