import { SITE } from './site'
import { SERP_KURZTITEL } from './serp-titel'

// Title-Helper (Defekt-8, Bing-Site-Scan 14.06.). Das Layout-Template haengt
// site-weit „ · autounfall.io" an (`%s · ${SITE.name}` in app/layout.tsx). Zwei
// Folgeprobleme, die hier zentral geloest werden:
//   1) Manche generierten Titel (z.B. /anspruch aus rest-pages.generated.ts)
//      enthalten das Suffix BEREITS -> Template haengt es ein zweites Mal an ->
//      „… · autounfall.io · autounfall.io". -> Suffix (auch mehrfach) abstreifen.
//   2) Lange redaktionelle Titel + Suffix sprengen die ~60-Zeichen-SERP-Grenze.
//      -> Titel + Suffix <= 60: plain string zurueck (Template haengt Suffix an).
//         Laenger: `{ absolute }` -> umgeht das Template (kein Suffix, voller Titel
//         statt Mitten-Abschnitt).
// `*.generated.ts` bleibt unberuehrt — die Logik sitzt im Metadata-Layer.
const SUFFIX = ` · ${SITE.name}`
const MAX = 60

export function metaTitle(raw: string): string | { absolute: string } {
  let t = (raw ?? '').trim()
  const low = SUFFIX.toLowerCase()
  while (t.toLowerCase().endsWith(low)) t = t.slice(0, -SUFFIX.length).trim()

  // Kurzfassung fuer die Trefferliste, falls hinterlegt (20.08.: 71 Titel lagen
  // ueber 60 Zeichen und wurden abgeschnitten). NACH dem Suffix-Strippen, damit
  // der Schluessel der reine Titel ist. Siehe ./serp-titel.ts.
  t = SERP_KURZTITEL[t] ?? t

  return (t + SUFFIX).length <= MAX ? t : { absolute: t }
}
