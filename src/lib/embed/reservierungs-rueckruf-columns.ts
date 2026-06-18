// AAR-956 · Embed Gutachter-Finder · PURE Spalten-Mapping fuer den Reservierungs-Rueckruf.
//
// Bewusst OHNE server-only / DB-Imports -> im vitest-node-Env isoliert testbar
// (reservierungs-rueckruf.ts traegt den server-only-Graph + den Upsert).
//
// Jede Reservierung legt automatisch einen Rueckruf-Task beim Dispatcher an
// (vonKunde=false, ASAP). Stellt der Kunde auf der Danke-Seite zusaetzlich eine
// Wunschzeit ein, aktualisiert derselbe Builder dieselbe Zeile (vonKunde=true) —
// Dedup-Invariante: genau ein Rueckruf pro Reservierung/Lead.

export interface ReservierungsRueckrufInput {
  leadId: string
  dispId: string
  name: string
  /** Start des Rueckrufs (UTC-ISO). Auto = ASAP (now+5min), Kunde = gewaehlte Wunschzeit. */
  startIso: string
  /** true = Kunde hat auf der Danke-Seite eine Wunschzeit gewaehlt; false = Auto-Anlage. */
  vonKunde: boolean
}

const DAUER_MIN = 30
const ERINNERUNG_MIN_VORHER = 10

/**
 * PURE: baut die admin_termine-Spalten fuer einen Reservierungs-Rueckruf.
 * `vonKunde` unterscheidet nur Titel + Beschreibung (auto vs. kundengewaehlte
 * Wunschzeit); alle uebrigen Spalten sind identisch, damit der Upsert dieselbe
 * Zeile aktualisieren kann.
 */
export function buildReservierungsRueckruf(input: ReservierungsRueckrufInput) {
  const { leadId, dispId, name, startIso, vonKunde } = input
  const endIso = new Date(new Date(startIso).getTime() + DAUER_MIN * 60_000).toISOString()
  return {
    typ: 'rueckruf' as const,
    titel: vonKunde ? `Beratungsgespräch: ${name}` : `Rückruf: ${name}`,
    beschreibung: vonKunde
      ? 'Rückruf-Wunsch aus dem Gutachter-Finder (Danke-Seite). Wunschzeit vom Kunden gewählt.\nQuelle: embed-gutachter-finder'
      : 'Automatischer Rückruf aus Gutachter-Finder-Reservierung — bitte Termin/Anliegen mit dem Kunden bestätigen.\nQuelle: embed-gutachter-finder',
    start_zeit: startIso,
    end_zeit: endIso,
    status: 'offen' as const,
    lead_id: leadId,
    erstellt_von: dispId,
    zugewiesen_an: dispId,
    erinnerung_min_vorher: ERINNERUNG_MIN_VORHER,
  }
}
