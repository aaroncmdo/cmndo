// Reine Slot-Logik des WunschterminPickers (AAR-956): welche Werktage + Uhrzeiten sind als
// Wunschtermin waehlbar. Aus dem Client-Component ausgelagert, weil "keine Vergangenheit"
// korrektheitskritisch ist: der Finder bot bisher fuer HEUTE alle 08-18-Uhr-Slots an, auch
// die vor der aktuellen Uhrzeit (12:30 -> 08:00 waehlbar) -> gebuchte start_zeit < created_at
// (Spec 2026-08-05 §1 Randbefund, prod-belegt 04.+08.08.).
//
// Zeitbasis = browser-lokal (== Berlin fuer die deutschen Endkunden — Picker-Konvention, s.
// WunschterminPicker-Kopf). Bewusst nur lokale Date-Teile (getFullYear/getMonth/getDate/
// getDay/getHours): local-Konstruktor + local-Getter sind symmetrisch -> TZ-agnostisch
// testbar, ohne eine TZ-Lib in die Leaf-Logik zu ziehen.

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const

export type TagOption = { iso: string; tag: string; wtag: string }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoVon(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Stunde eines "HH:MM"-Slots als Zahl. */
function stunde(z: string): number {
  return parseInt(z.slice(0, 2), 10)
}

/**
 * Uhrzeiten, die fuer ein Datum waehlbar sind: fuer HEUTE nur Stunden strikt NACH der
 * aktuellen Stunde (kein vergangener + kein laufender Slot); fuer kuenftige Tage alle.
 * Ein nicht-heutiges Datum (leer/zukuenftig) liefert immer die volle Liste.
 */
export function zukunftsZeiten(
  alleZeiten: string[],
  datumIso: string,
  todayIso: string,
  nowHour: number,
): string[] {
  if (datumIso !== todayIso) return alleZeiten
  return alleZeiten.filter((z) => stunde(z) > nowHour)
}

/**
 * Naechste `anzahl` Werktage (Sonntag raus) ab `now`. HEUTE ist nur dann dabei, wenn es noch
 * mindestens einen zukuenftigen Zeit-Slot hat (sonst ein sinnlos leerer Tag). Liefert
 * zusaetzlich `todayIso` + `nowHour`, damit der Consumer die Zeit-Chips ohne einen zweiten
 * `new Date()`-Aufruf (Hydration!) filtern kann.
 */
export function naechsteWerktage(
  now: Date,
  alleZeiten: string[],
  anzahl: number,
  maxLookahead: number = anzahl + 10,
): { tage: TagOption[]; todayIso: string; nowHour: number } {
  const nowHour = now.getHours()
  const todayIso = isoVon(now)
  const tage: TagOption[] = []
  for (let i = 0; tage.length < anzahl && i <= maxLookahead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    if (d.getDay() === 0) continue // Sonntag raus
    const iso = isoVon(d)
    // Heute nur, wenn noch ein Zukunfts-Slot uebrig ist.
    if (iso === todayIso && zukunftsZeiten(alleZeiten, iso, todayIso, nowHour).length === 0) continue
    tage.push({ iso, tag: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`, wtag: WOCHENTAG[d.getDay()] })
  }
  return { tage, todayIso, nowHour }
}
