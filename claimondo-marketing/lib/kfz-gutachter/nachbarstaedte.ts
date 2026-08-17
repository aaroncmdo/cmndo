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
import { nachbarnMitRueckkanten } from './nachbar-auswahl.mjs'

export {
  GROSSSTADT_AB_EINWOHNER,
  NACHBAR_MAX_KM,
  distanzKm,
  einwohnerZahl,
  nachbarnMitRueckkanten,
  waehleNachbarn as naechsteAus,
} from './nachbar-auswahl.mjs'

// Die Rueckkanten-Suche prueft fuer JEDE andere Stadt deren eigene Auswahl —
// das ist O(n^2) je Aufruf und liefe sonst bei jedem Seitenrender neu. STAEDTE
// ist zur Laufzeit konstant, also wird das Ergebnis einmal je (slug, limit)
// gemerkt. Ohne den Cache waeren es ~8.400 Distanzrechnungen pro Stadtseite.
const cache = new Map<string, Stadt[]>()

/**
 * Die Nachbarstaedte einer Stadtseite, nach Distanz aufsteigend:
 * die `limit` passendsten selbst gewaehlten Orte (halb Nahbereich, halb
 * naechste Grossstaedte) PLUS alle Staedte, die ihrerseits diese Stadt
 * gewaehlt haben. Dadurch ist jede Kante beidseitig und keine Stadt bleibt
 * ohne eingehenden Link — Begruendung in nachbar-auswahl.mjs.
 *
 * Unbekannter Slug -> leeres Array (die Seite ist dann ohnehin eine 404, sie
 * soll aber nicht im Datenzugriff sterben).
 */
export function naechsteStaedte(slug: string, limit = 6): Stadt[] {
  const schluessel = `${slug}:${limit}`
  let treffer = cache.get(schluessel)
  if (!treffer) {
    treffer = nachbarnMitRueckkanten(slug, STAEDTE, limit)
    cache.set(schluessel, treffer)
  }
  return treffer
}
