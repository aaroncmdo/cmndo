// Titel-Laengen-Helfer fuer die Suchergebnis-Anzeige.
//
// Das Root-Layout haengt an jeden Seitentitel `%s | Claimondo` an (siehe
// `app/[locale]/layout.tsx`). Google zeigt rund 60 Zeichen — was darueber
// liegt, wird abgeschnitten. Fuer den Titel selbst bleiben also 48 Zeichen.

/** Was das Layout-Template `%s | Claimondo` an jeden Titel anhaengt. */
export const BRAND_SUFFIX = ' | Claimondo'

/** Was Google in der Anzeige zeigt (Richtwert, keine harte Grenze der API). */
export const TITEL_MAX_ANZEIGE = 60

/**
 * Waehlt aus mehreren Zusatz-Varianten die **laengste, die noch vollstaendig
 * angezeigt wird** — inklusive des Marken-Suffixes, das das Layout anhaengt.
 *
 * Der Sinn: Bei einem Vorlagen-Titel (`Kfz-Gutachter <Stadt> — kostenfrei nach
 * Unfall`) entscheidet die Laenge des variablen Teils darueber, ob der Zusatz
 * noch passt. Ohne Abstufung hat man nur zwei schlechte Optionen — den Zusatz
 * fuer ALLE Seiten opfern, oder ihn bei den langen abschneiden lassen.
 *
 * `zusaetze` wird in der Reihenfolge geprueft, in der er uebergeben wird; der
 * erste passende gewinnt. Passt keiner (auch der letzte nicht), gewinnt trotzdem
 * der letzte — er ist die kuerzeste Fassung, die der Aufrufer vorgesehen hat,
 * und ein zu langer Titel ist immer noch besser als ein leerer. Deshalb sollte
 * das letzte Element `''` sein.
 *
 * @example
 * titelMitZusatz('Kfz-Gutachter Köln', [' — kostenfrei nach Unfall', ' — kostenfrei', ''])
 * // 'Kfz-Gutachter Köln — kostenfrei nach Unfall'   (55 mit Suffix)
 * titelMitZusatz('Kfz-Gutachter Ludwigshafen am Rhein', [' — kostenfrei nach Unfall', ' — kostenfrei', ''])
 * // 'Kfz-Gutachter Ludwigshafen am Rhein — kostenfrei'   (60 mit Suffix)
 */
export function titelMitZusatz(
  basis: string,
  zusaetze: readonly string[],
  max: number = TITEL_MAX_ANZEIGE,
): string {
  const platz = max - BRAND_SUFFIX.length
  for (const zusatz of zusaetze) {
    if (basis.length + zusatz.length <= platz) return basis + zusatz
  }
  return basis + (zusaetze[zusaetze.length - 1] ?? '')
}

/**
 * Gesamtlaenge inklusive des Marken-Suffixes — das, was Google misst.
 * Fuer Tests und Messskripte; die Seiten selbst brauchen sie nicht.
 */
export function angezeigteLaenge(titel: string): number {
  return titel.length + BRAND_SUFFIX.length
}
