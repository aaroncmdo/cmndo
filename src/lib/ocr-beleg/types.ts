// AAR-761: Typen für generischen Beleg-OCR-Flow.
// Pro Beleg-Typ eine spezifische Extraktion; gemeinsame Felder +
// typ-spezifische Overrides.

export type BelegTyp =
  | 'mietwagen_rechnung'
  | 'werkstatt_rechnung'
  | 'abschlepp_rechnung'
  | 'attest'
  | 'sonstiges'

export type BelegExtraktionGemeinsam = {
  rechnungsdatum: string | null
  rechnungsnummer: string | null
  rechnungsbetrag_brutto: number | null
  rechnungsbetrag_netto: number | null
  ust_prozent: number | null
  aussteller_firma: string | null
  aussteller_iban: string | null
}

export type MietwagenRechnungExtras = {
  abhol_datum: string | null
  rueckgabe_datum: string | null
  tage_anzahl: number | null
  fahrzeug_hinweis: string | null
}

export type WerkstattRechnungExtras = {
  fahrzeug_kennzeichen: string | null
  positionen: { beschreibung: string; betrag_brutto: number | null }[]
}

export type AbschleppRechnungExtras = {
  abhol_ort: string | null
  abstellort: string | null
  tarif_hinweis: string | null
}

export type BelegExtraktion =
  | ({ typ: 'mietwagen_rechnung' } & BelegExtraktionGemeinsam & MietwagenRechnungExtras)
  | ({ typ: 'werkstatt_rechnung' } & BelegExtraktionGemeinsam & WerkstattRechnungExtras)
  | ({ typ: 'abschlepp_rechnung' } & BelegExtraktionGemeinsam & AbschleppRechnungExtras)
  | ({ typ: 'attest' } & BelegExtraktionGemeinsam & { ausgestellt_fuer: string | null })
  | ({ typ: 'sonstiges' } & BelegExtraktionGemeinsam)

export type BelegOcrResult = {
  success: boolean
  typ: BelegTyp
  extracted: BelegExtraktion | null
  fields_found: number
  raw_text?: string
  error?: string
}
