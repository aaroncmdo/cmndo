/**
 * Alle Zeilen einer Abfrage holen — seitenweise.
 *
 * ⚠ POSTGREST LIEFERT OHNE `range` HÖCHSTENS 1.000 ZEILEN. Kein Fehler, keine
 * Warnung: die Antwort ist einfach kürzer als die Wahrheit.
 *
 * ⭐ Am 21.08.2026 dreimal zugeschlagen, unbemerkt. Der Discovery-Lauf lud
 * seinen Abgleich-Bestand mit einem einfachen `.select()` und meldete
 * „Bestand 1000 Leads" — während 6.988 in der Tabelle standen. Er kannte also
 * ein Siebtel und hielt jeden der übrigen für einen NEUEN Betrieb. Dass daraus
 * kein Datenschaden wurde, verdankt sich allein einem partiellen Unique-Index
 * auf `google_place_id`, der jeden Doppel-Insert abwies: **die Datenbank war
 * die Schranke, nicht der Code.**
 *
 * ⭐⭐ Die Zahl stand im Protokoll jedes Laufs. Eine glatte 1000 ist ein Alarm —
 * echte Bestände sind selten rund. Dieselbe Lehre wie das Migrations-Gate, das
 * bei „947 von 1000" nicht stutzte.
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
    // zurückzugeben hiesse, eine unvollständige Menge als vollständig
    // auszugeben — genau der Fehler, den diese Funktion verhindern soll.
    if (error) return { ok: false, error: error.message }

    const seite = data ?? []
    zeilen.push(...seite)
    if (seite.length < seitengroesse) return { ok: true, zeilen }
  }

  return {
    ok: false,
    error: `Obergrenze von ${obergrenze} Zeilen erreicht — Abfrage liefert unerwartet weiter volle Seiten.`,
  }
}

/**
 * Wie viele Werte ein `.in(...)` verträgt.
 *
 * ⚠ PostgREST baut daraus eine Query-Zeichenkette in der URL. Bei tausenden
 * Kennungen (36 Zeichen je UUID) reisst die Zeilenlänge des Servers, und die
 * Antwort ist ein HTTP-Fehler statt Daten — im besten Fall. Im schlechteren
 * greift zusätzlich die 1.000-Zeilen-Grenze, und man bekommt eine Teilmenge,
 * die wie eine vollständige aussieht.
 */
export const BLOCKGROESSE = 300

/**
 * Führt eine `.in(...)`-Abfrage in Blöcken aus und fügt die Ergebnisse zusammen.
 *
 * ⭐ Der Anlass ist kein Truncation-Problem, sondern eine STILLE
 * DATENKORREKTUR-FALLE: `dreheLaufZurueck` lädt den Ist-Zustand der betroffenen
 * Leads, um zu erkennen, ob ein verbliebener Wert aus einem ANDEREN Lauf
 * stammt. Fehlt ein Lead in dieser Menge, gilt jedes seiner Felder als leer —
 * und der Rückwärtsgang räumt Begleitspalten ab, die ein fremder Lauf gesetzt
 * hat. Eine unvollständige Lesemenge wird hier zu einem falschen SCHREIBEN.
 *
 * ⚠ Jeder Block wird zusätzlich seitenweise geholt: 300 Kennungen können mehr
 * als 1.000 Zeilen ergeben, sobald die Abfrage nicht auf dem Primärschlüssel
 * filtert.
 */
export async function inBloecken<T>(
  werte: readonly string[],
  hole: (block: string[], von: number, bis: number) => PromiseLike<SeitenAntwort<T>>,
  blockgroesse: number = BLOCKGROESSE,
): Promise<AlleSeitenErgebnis<T>> {
  const zeilen: T[] = []

  for (let i = 0; i < werte.length; i += blockgroesse) {
    const block = werte.slice(i, i + blockgroesse)
    const teil = await alleSeiten<T>((von, bis) => hole(block, von, bis))
    if (!teil.ok) return teil
    zeilen.push(...teil.zeilen)
  }

  return { ok: true, zeilen }
}
