// Kuerzungsregel fuer die Profilbeschreibung (Aaron 19.09.2026: "wenn die Profilbeschreibung zu
// lang ist, soll sie ausklappbar sein — ueberleg dir eine gute Zeichenanzahl").
//
// Herleitung: Finder-Popup 260–330 px breit, 13 px kursiv → rund 40 Zeichen je Zeile, also
// 4–5 Zeilen bei 180 Zeichen. Prod 19.09.: Median-Profiltext 152 Zeichen (bleibt ungekuerzt),
// drei Texte ueber 300 (werden gekuerzt). Die Toleranz verhindert, dass eine Schaltflaeche nur
// 10 Zeichen "versteckt": bis Limit + Toleranz bleibt alles stehen.
export const PROFILTEXT_LIMIT = 180
export const PROFILTEXT_TOLERANZ = 40
/** Schnitt frueh­estens bei 60 % des Limits — sonst harter Schnitt am Limit. */
const MIN_ANTEIL = 0.6

export type GekuerzterText = { gekuerzt: boolean; text: string }

export function kuerzeProfiltext(
  text: string | null | undefined,
  opts: { limit?: number; toleranz?: number } = {},
): GekuerzterText {
  const limit = opts.limit ?? PROFILTEXT_LIMIT
  const toleranz = opts.toleranz ?? PROFILTEXT_TOLERANZ
  const voll = (text ?? '').trim()
  if (!voll) return { gekuerzt: false, text: '' }
  if (voll.length <= limit + toleranz) return { gekuerzt: false, text: voll }
  // +1: ein Leerraum genau an Position `limit` ist eine gueltige Wortgrenze.
  const fenster = voll.slice(0, limit + 1)
  let grenze = fenster.length - 1
  while (grenze >= 0 && !/\s/.test(fenster[grenze])) grenze--
  const schnitt = grenze >= Math.floor(limit * MIN_ANTEIL) ? grenze : limit
  return { gekuerzt: true, text: voll.slice(0, schnitt).trimEnd() + '…' }
}
