// Auswertung eines Pipeline-Laufs — pure Logik, BEWUSST ohne `server-only`.
//
// Sie stand zuerst in pipeline.ts. Dort ist sie nicht testbar: die Datei
// importiert `server-only`, und der Test bricht schon beim Import ab
// ("This module cannot be imported from a Client Component module"). Eine
// Bedingung, die entscheidet, ob ein Cron Alarm schlaegt, darf nicht ungetestet
// bleiben, nur weil sie in der falschen Datei liegt.

export type LaufZaehlung = {
  versucht: number
  veroeffentlicht: unknown[]
  imReview: unknown[]
}

/**
 * Hat der Lauf etwas erreicht?
 *
 * `false` nur bei TOTALAUSFALL — alles versucht, nichts abgelegt.
 *
 * ⭐ WARUM DAS NOETIG WURDE (20.08.2026): Das Anthropic-Guthaben war
 * aufgebraucht. Die Route antwortete trotzdem `ok:true` / HTTP 200, weil der
 * Fehler nur im `fehler`-Array stand — und `cron-call.sh` loggte "ok http=200".
 * Der Cron waere ab da jede Nacht gelaufen, haette Erfolg gemeldet und nichts
 * erzeugt. Dasselbe Muster, das zwei andere prod-Crons ueber 8.600-mal
 * produziert haben, bevor es jemand bemerkte.
 *
 * ⚠ Schwelle bewusst "alles gescheitert", nicht "irgendetwas gescheitert": eine
 * einzelne Stadt am Substanz-Gate ist Normalbetrieb. Waere das ein Fehler,
 * rauschte der Cron-Log und der echte Ausfall ginge darin unter.
 *
 * ⚠ `versucht === 0` ist ebenfalls kein Fehler: dann ist die Warteschlange
 * leer, also alles erledigt.
 */
export function laufGeglueckt(e: LaufZaehlung): boolean {
  if (e.versucht === 0) return true
  return e.veroeffentlicht.length > 0 || e.imReview.length > 0
}
