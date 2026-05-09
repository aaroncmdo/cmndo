// Berechnet welche Pflichtfelder eines Leads noch fehlen — basierend auf den
// bereits gesetzten Conditions (schuldfrage, schadentyp, ist_fahrzeughalter etc.).
// Ergebnis wird als fehlende_felder_jsonb gespeichert und dient dem Dispatch
// als Checkliste sowie dem Flow zur dynamischen Schrittsteuerung.

export type FehlendesFeld = {
  key: string
  label: string
  grund: string
  ocr_verfuegbar?: boolean
}

export type LeadConditions = {
  schuldfrage?: string | null
  schadentyp?: string | null
  polizei_vor_ort?: boolean | null
  ist_fahrzeughalter?: boolean | null
  hat_vorschaeden?: boolean | null
  finanzierung_leasing?: string | null
  personenschaden_flag?: boolean | null
  mietwagen_flag?: boolean | null
  fahrerflucht?: boolean | null
  // aktuelle Feldwerte zum Prüfen ob schon gesetzt
  vorname?: string | null
  nachname?: string | null
  email?: string | null
  telefon?: string | null
  fin?: string | null
  hsn?: string | null
  tsn?: string | null
  kennzeichen?: string | null
  halter_vorname?: string | null
  halter_nachname?: string | null
  halter_strasse?: string | null
  halter_plz?: string | null
  gegner_kennzeichen?: string | null
  gegner_name?: string | null
  gegner_versicherung_id?: string | null
  polizei_aktenzeichen?: string | null
  vorschaeden_beschreibung?: string | null
  leasing_geber?: string | null
  fahrzeug_fahrbereit?: boolean | null
  fahrzeugschaden_beschreibung?: string | null
}

export function berechneFehlendeFelder(lead: LeadConditions): FehlendesFeld[] {
  const fehlend: FehlendesFeld[] = []

  // ——— Immer Pflicht ———

  if (!lead.fin) {
    fehlend.push({
      key: 'fin',
      label: 'FIN (Fahrzeug-Identifizierungsnummer)',
      grund: 'Für Gutachten und Regulierung zwingend erforderlich',
      ocr_verfuegbar: true,
    })
  }
  if (!lead.kennzeichen) {
    fehlend.push({
      key: 'kennzeichen',
      label: 'Kennzeichen',
      grund: 'Für Halter-Abfrage und Versicherungsregulierung erforderlich',
      ocr_verfuegbar: true,
    })
  }
  if (!lead.hsn || !lead.tsn) {
    fehlend.push({
      key: 'hsn_tsn',
      label: 'HSN/TSN (Fahrzeugart)',
      grund: 'Für DAT-Bewertung und Gutachtenerstellung erforderlich',
      ocr_verfuegbar: true,
    })
  }

  // ——— Konditionell: Polizei war vor Ort ———
  if (lead.polizei_vor_ort && !lead.polizei_aktenzeichen) {
    fehlend.push({
      key: 'polizei_aktenzeichen',
      label: 'Polizeiliches Aktenzeichen',
      grund: 'Polizei war vor Ort — Aktenzeichen wird für Schadensregulierung benötigt',
    })
  }

  // ——— Konditionell: Schuldfrage Gegner ———
  if (lead.schuldfrage === 'gegner') {
    if (!lead.gegner_name && !lead.fahrerflucht) {
      fehlend.push({
        key: 'gegner_name',
        label: 'Name des Unfallgegners',
        grund: 'Bei Gegner-Verschulden für Schadensanspruch erforderlich',
      })
    }
    if (!lead.gegner_kennzeichen && !lead.fahrerflucht) {
      fehlend.push({
        key: 'gegner_kennzeichen',
        label: 'Kennzeichen des Unfallgegners',
        grund: 'Für Halterfeststellung und Versicherungsanfrage erforderlich',
      })
    }
    if (!lead.gegner_versicherung_id) {
      fehlend.push({
        key: 'gegner_versicherung_id',
        label: 'Versicherung des Unfallgegners',
        grund: 'Wird für Direktregulierung bei der gegnerischen Versicherung benötigt',
      })
    }
    if (lead.mietwagen_flag === null || lead.mietwagen_flag === undefined) {
      fehlend.push({
        key: 'mietwagen_flag',
        label: 'Mietwagen-Bedarf',
        grund: 'Mietwagenanspruch bei Gegner-Verschulden — Angabe fehlt noch',
      })
    }
  }

  // ——— Konditionell: Fahrzeughalter ≠ Fahrer ———
  if (lead.ist_fahrzeughalter === false) {
    if (!lead.halter_vorname || !lead.halter_nachname) {
      fehlend.push({
        key: 'halter_name',
        label: 'Name des Fahrzeughalters',
        grund: 'Fahrer ≠ Halter — Halterdaten für Vollmacht und Regulierung erforderlich',
        ocr_verfuegbar: true,
      })
    }
    if (!lead.halter_strasse || !lead.halter_plz) {
      fehlend.push({
        key: 'halter_adresse',
        label: 'Adresse des Fahrzeughalters',
        grund: 'Halterdaten werden aus Fahrzeugschein (ZB1) via OCR ausgelesen',
        ocr_verfuegbar: true,
      })
    }
  }

  // ——— Konditionell: Vorschäden vorhanden ———
  if (lead.hat_vorschaeden && !lead.vorschaeden_beschreibung) {
    fehlend.push({
      key: 'vorschaeden_beschreibung',
      label: 'Beschreibung der Vorschäden',
      grund: 'Vorschäden angegeben — Beschreibung für Gutachter erforderlich',
    })
  }

  // ——— Konditionell: Leasing / Finanzierung ———
  if (lead.finanzierung_leasing && lead.finanzierung_leasing !== 'keine') {
    if (!lead.leasing_geber) {
      fehlend.push({
        key: 'leasing_geber',
        label: lead.finanzierung_leasing === 'leasing' ? 'Leasinggeber' : 'Finanzierungsbank',
        grund: 'Bei Leasing/Finanzierung muss der Geber für die Auszahlung informiert werden',
      })
    }
  }

  // ——— Konditionell: Personenschaden ———
  if (lead.personenschaden_flag) {
    fehlend.push({
      key: 'personenschaden_details',
      label: 'Details zu Personenschäden',
      grund: 'Personenschaden gemeldet — Unfallbeschreibung muss Verletzungen dokumentieren',
    })
  }

  return fehlend
}
