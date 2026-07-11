// Gutachten-Werte-Mapping aus der kanonischen Entity v_gutachten_werte.
// GETEILT von getMaklerFallDetail (Detail-Uebersicht) UND copilot-prompt (KI-Kontext),
// damit beide Surfaces GARANTIERT dieselben Zahlen zeigen.
//
// F3-Audit 2026-07-11: vorher las die Detail-Uebersicht reparaturkosten/wertminderung aus
// v_claim_base — dort sind sie fuer Makler/Werkstatt rolle-gegatet (rolle_sieht_gutachtenwerte()
// = false) auf NULL -> leere Card + falsche (zu niedrige) Gesamtforderung, waehrend der Copilot
// die Werte via admin aus v_gutachten_werte zeigte (Inkonsistenz). Aaron 2026-07-11: Makler DARF
// diese Werte sehen -> beide Surfaces lesen jetzt dieselbe Entity ueber diesen Helper.

export type GutachtenWerteRow = {
  reparaturkosten_netto?: unknown
  minderwert?: unknown
  nutzungsausfall_tage?: unknown
  gutachten_nutzungsausfall_tagessatz_eur?: unknown
  gutachten_sv_honorar_netto?: unknown
} | null | undefined

export type GutachtenWerte = {
  reparaturkosten: number | null
  wertminderung: number | null
  nutzungsausfall_gesamt: number | null
  gutachter_honorar: number | null
}

// v_gutachten_werte liefert numeric/money teils als String -> auf number coercen.
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Select-Liste fuer v_gutachten_werte — von beiden Consumern genutzt. */
export const GUTACHTEN_WERTE_COLUMNS =
  'reparaturkosten_netto, minderwert, nutzungsausfall_tage, gutachten_nutzungsausfall_tagessatz_eur, gutachten_sv_honorar_netto'

export const EMPTY_GUTACHTEN_WERTE: GutachtenWerte = {
  reparaturkosten: null,
  wertminderung: null,
  nutzungsausfall_gesamt: null,
  gutachter_honorar: null,
}

/** Mappt eine v_gutachten_werte-Zeile auf die 4 Anzeige-Werte. nutzungsausfall_gesamt = Tage x Tagessatz. */
export function mapGutachtenWerte(row: GutachtenWerteRow): GutachtenWerte {
  const tage = numOrNull(row?.nutzungsausfall_tage)
  const satz = numOrNull(row?.gutachten_nutzungsausfall_tagessatz_eur)
  return {
    reparaturkosten: numOrNull(row?.reparaturkosten_netto),
    wertminderung: numOrNull(row?.minderwert),
    nutzungsausfall_gesamt: tage != null && satz != null ? tage * satz : null,
    gutachter_honorar: numOrNull(row?.gutachten_sv_honorar_netto),
  }
}
