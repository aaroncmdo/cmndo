// src/lib/kasko-wb/werkstattbindung.ts
// Pure Ableitung (Spec §5): aus Marke/Tarif/Marker-Antwort wird das Entscheidungsfeld freie_werkstattwahl.
// Reihenfolge ist fachlich: Marken-Status (keine/standard) > gewaehlter Tarif > Marker am Schein > unbekannt.
import type { Bindungsumfang, MarkerAntwort, WbErgebnis, WbStatus } from './types'

export type WbAbleitungInput = {
  wbStatus: WbStatus | null
  tarif: { hatWerkstattbindung: boolean; bindungsumfang: Bindungsumfang } | null
  markerAntwort: MarkerAntwort | null
  /** Im Unfall-Flow immer false (Karosserie). Glas-Faelle kommen ueber andere Eingaenge. */
  schadenIstGlas: boolean
}

export function leiteWerkstattbindungAb(i: WbAbleitungInput): WbErgebnis {
  if (i.wbStatus === 'keine') return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'keine_wb_bei_marke' }
  if (i.wbStatus === 'standard') return { freieWerkstattwahl: false, quelle: 'tarif', grund: 'standard_wb' }
  if (i.tarif) {
    if (!i.tarif.hatWerkstattbindung) return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'tarif_ohne_wb' }
    // E7 (Aaron 04.09.): reine Glas-Bindung bindet den Karosserieschaden nicht.
    if (i.tarif.bindungsumfang === 'nur_glas' && !i.schadenIstGlas) {
      return { freieWerkstattwahl: true, quelle: 'tarif', grund: 'nur_glas_karosserie' }
    }
    return { freieWerkstattwahl: false, quelle: 'tarif', grund: 'tarif_mit_wb' }
  }
  if (i.markerAntwort === 'ja') return { freieWerkstattwahl: false, quelle: 'marker', grund: 'marker_bestaetigt' }
  if (i.markerAntwort === 'nein') return { freieWerkstattwahl: true, quelle: 'marker', grund: 'marker_verneint' }
  return { freieWerkstattwahl: null, quelle: 'unbekannt', grund: 'unbekannt' }
}

/** Kurztext fuer Badges/Logs. */
export function wbErgebnisLabel(r: WbErgebnis): string {
  if (r.freieWerkstattwahl === true) return 'freie Werkstattwahl'
  if (r.freieWerkstattwahl === false) return 'Werkstattbindung'
  return 'Werkstattbindung unklar'
}
