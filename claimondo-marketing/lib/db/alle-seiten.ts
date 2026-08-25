/**
 * Alle Zeilen einer Abfrage holen — seitenweise.
 *
 * ⚠ POSTGREST LIEFERT OHNE `range` HÖCHSTENS 1.000 ZEILEN. Kein Fehler, keine
 * Warnung: die Antwort ist einfach kürzer als die Wahrheit.
 *
 * Das Repo kennt den Deckel und dokumentiert ihn an zwei Stellen
 * (`src/app/admin/aufgaben/alle/page.tsx`, `src/app/api/cron/db-backup/route.ts`)
 * — angewandt war er in den Karten-Lesepfaden trotzdem nicht. Solange nur 62
 * Dead-Pins aktiv waren, fiel das nicht auf. Mit über 7.000 entdeckten
 * Betrieben zeigte jede Karte **1.000 von 7.500**, ohne dass irgendetwas darauf
 * hingedeutet hätte.
 *
 * ⭐ Die Zahl 1000 ist der Alarm: echte Bestände sind selten rund.
 *
 * Wer eine vollständige Menge braucht, ruft diese Funktion. Sie macht die
 * Seitengrenze im Aufruf SICHTBAR, statt sie im Vertrauen auf einen
 * Vorgabewert zu übersehen.
 */

export type SeitenAntwort<T> = {
  data: T[] | null
  error: { message: string } | null
}

/** Die Vorgabe von PostgREST — und damit die Grenze, die es zu umgehen gilt. */
export const SEITENGROESSE = 1000

export type AlleSeitenErgebnis<T> =
  | { ok: true; zeilen: T[] }
  | { ok: false; error: string }

/**
 * @param hole Wendet den Bereich auf die Abfrage an und führt sie aus. Beide
 *   Grenzen einschließlich, wie `.range()`.
 * @param obergrenze Sicherheitsnetz gegen eine Endlosschleife, wenn eine
 *   Abfrage entgegen der Erwartung immer volle Seiten liefert.
 */
export async function alleSeiten<T>(
  hole: (von: number, bis: number) => PromiseLike<SeitenAntwort<T>>,
  seitengroesse: number = SEITENGROESSE,
  obergrenze = 200_000,
): Promise<AlleSeitenErgebnis<T>> {
  const zeilen: T[] = []

  for (let von = 0; von < obergrenze; von += seitengroesse) {
    const { data, error } = await hole(von, von + seitengroesse - 1)

    // ⚠ Ein Fehler auf Seite 7 ist KEIN Teilerfolg. Die bisher geholten Zeilen
    // zurückzugeben hiesse, eine unvollständige Menge als vollständige
    // auszugeben — genau der Fehler, den diese Funktion verhindern soll.
    if (error) return { ok: false, error: error.message }

    const seite = data ?? []
    zeilen.push(...seite)
    // ⚠ Bei GENAU einer vollen Seite wird weitergefragt: sonst verliert man bei
    // 1.001 Zeilen genau eine, still.
    if (seite.length < seitengroesse) return { ok: true, zeilen }
  }

  return {
    ok: false,
    error: `Obergrenze von ${obergrenze} Zeilen erreicht – Abfrage liefert unerwartet weiter volle Seiten.`,
  }
}
