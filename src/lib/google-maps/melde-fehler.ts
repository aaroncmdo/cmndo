// Meldet Google-Maps-ZUGANGSFEHLER, damit sie nicht mehr still bleiben.
//
// ⚠ WARUM ES DAS GIBT (25.08.2026): Nach dem Vorfall vom 21.08. (82.047 Abrufe
// an einem Tag) steht das Places-Tageskontingent bei 32. Reisst es, antwortet
// Google mit `OVER_QUERY_LIMIT` — und zwar mit HTTP 200 und einem Statusfeld im
// Rumpf. Fuer den Nutzer heisst das: er tippt eine Adresse, es erscheinen keine
// Vorschlaege, der Wizard kommt nicht weiter. KEINE Fehlermeldung, KEIN Log,
// kein roter Ausschlag irgendwo. Ein verlorener Lead, von dem wir nie erfahren.
//
// Dieselbe Stille gilt fuer `REQUEST_DENIED`: falsch gesetzte Schluessel-
// einschraenkung, nicht aktivierte API, abgeschaltetes Billing. Am 29.06. hat
// genau das die halbe Plattform lahmgelegt, und am 25.08. stellte sich heraus,
// dass die Geocoding-API rund zwei Monate lang gar nicht aktiviert war, ohne
// dass es jemandem auffiel.
//
// ⚠ ABSICHTLICH KEINE aktive Sonde: Ein Waechter, der zum Pruefen selbst einen
// Places-Abruf macht, verbraucht genau das Kontingent, das er ueberwacht — bei
// stuendlichem Lauf ein Viertel des Tagesbudgets. Wir melden deshalb, was die
// echten Aufrufe ohnehin erleben.
//
// Ablage in `client_error_log` (boundary `maps-server`). Der Tabellenname sagt
// „client", die Tabelle ist aber der einzige vorhandene Fehler-Log mit
// Zeitstempel, Kanal-Feld und Auswertung — eine zweite Tabelle fuer dieselbe
// Sache waere Redundanz. Gelesen wird sie vom Health-Check `google-maps-zugang`.

import { createAdminClient } from '@/lib/supabase/admin'

/** Kanalkennung in `client_error_log.boundary` (Spalte ist auf 32 Zeichen begrenzt). */
export const MAPS_SERVER_BOUNDARY = 'maps-server'

/**
 * Statuswerte, die bedeuten „wir kommen nicht an die API" — im Unterschied zu
 * Statuswerten, die ein normales Ergebnis sind.
 *
 * ⚠ `ZERO_RESULTS` und `NOT_FOUND` gehoeren NICHT hierher: „nichts gefunden" ist
 * eine Antwort, kein Ausfall. Wer sie mitmeldet, erzeugt einen Waechter, der
 * dauerhaft rot steht — und ein dauerhaft roter Waechter wird weggeklickt.
 * `INVALID_REQUEST` ebenfalls nicht: das ist unser eigener Programmfehler und
 * gehoert in den Build, nicht in einen Betriebsalarm.
 */
export function istZugangsFehler(status: string | null | undefined): boolean {
  return status === 'OVER_QUERY_LIMIT' || status === 'REQUEST_DENIED'
}

/**
 * Haelt einen Zugangsfehler fest. Nicht-Zugangsfehler werden verworfen.
 *
 * ⚠ Wirft NIE. Eine Meldung, die den Aufrufer mit in den Abgrund zieht, macht
 * aus einem stillen Fehler einen lauten Ausfall — das waere schlimmer als das
 * Problem, das sie melden soll. Der Aufrufer braucht deshalb kein try/catch.
 */
export async function meldeGoogleFehler(
  api: string,
  status: string | null | undefined,
  kontext?: string,
): Promise<void> {
  if (!istZugangsFehler(status)) return

  try {
    const admin = createAdminClient()
    await admin.from('client_error_log').insert({
      boundary: MAPS_SERVER_BOUNDARY,
      name: api.slice(0, 128),
      message: [status, kontext].filter(Boolean).join(' — ').slice(0, 2000),
    })
  } catch {
    // Bewusst still: die Erfassung darf den Aufrufer nie stoeren.
  }
}
