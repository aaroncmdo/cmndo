export type SvLeadRow = {
  id: string
  name: string
  firma: string | null
  ort: string | null
  plz: string | null
  telefon: string | null
  email: string | null
  ist_aktiv: boolean | null
  claim_status: string | null
  konvertiert_zu_sv_id: string | null
  quelle: string | null
  aktualisiert_am: string | null
  /** Aus SV-LevelUp: die Website des Betriebs, sofern ermittelt. */
  website_url: string | null
  /**
   * Der Sichtbarkeits-Score der letzten LevelUp-Messung MIT Wertung.
   *
   * ⚠ `null` heisst „nie gemessen ODER nur ein Teilbefund" — nicht „schlecht".
   * Die Liste zeigt dort einen Strich, keine Null.
   */
  levelup_letzter_score: number | null
}

/** Eine Seite der Liste — mit der Gesamtzahl, damit kein Deckel unsichtbar bleibt. */
export type SvLeadSeite = {
  zeilen: SvLeadRow[]
  /** Treffer des aktuellen Filters, nicht des Gesamtbestands. */
  gesamt: number
  seite: number
  seiten: number
  proSeite: number
}
