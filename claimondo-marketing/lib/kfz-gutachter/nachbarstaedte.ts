// Geografisch korrekte Nachbarstaedte fuer /kfz-gutachter/[stadt].
//
// WARUM es diese Datei gibt: page.tsx waehlte die "Nachbarn" bis 16.08.2026 mit
//   STAEDTE.filter(x => x.bundesland === s.bundesland).slice(0, 6)
// also die ersten SECHS ARRAY-EINTRAEGE des Bundeslands, aufgefuellt mit
// beliebigen anderen. Da die Liste mit NRW beginnt, bekamen Berlin und Hamburg
// aachen/bonn/dortmund/duesseldorf/essen/koeln als "Nachbarn" — 400-500 km weit.
// Auf prod live nachgemessen (16.08.), siehe P3-Spec §0.
//
// Die Auswahlregel selbst liegt in ./nachbar-auswahl.mjs, weil sie auch
// scripts/build-stadt-stammdaten.mjs braucht (Snapshot fuer den KI-Prompt in
// src/) und die beiden Builds keinen gemeinsamen TypeScript-Pfad haben. Hier
// bindet sie nur an STAEDTE und den Typ `Stadt`.

import { STAEDTE, type Stadt } from './staedte'
import { waehleNachbarn } from './nachbar-auswahl.mjs'

export {
  GROSSSTADT_AB_EINWOHNER,
  NACHBAR_MAX_KM,
  distanzKm,
  einwohnerZahl,
  waehleNachbarn as naechsteAus,
} from './nachbar-auswahl.mjs'

/** Die `limit` passendsten Nachbarstaedte einer Stadtseite, nach Distanz
 *  aufsteigend: zur Haelfte die naechstgelegenen Orte, zur Haelfte die
 *  naechsten Grossstaedte. Unbekannter Slug -> leeres Array (die Seite ist dann
 *  ohnehin eine 404, sie soll aber nicht im Datenzugriff sterben). */
export function naechsteStaedte(slug: string, limit = 6): Stadt[] {
  return waehleNachbarn(slug, STAEDTE, limit)
}
