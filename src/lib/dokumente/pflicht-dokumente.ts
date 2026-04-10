// KFZ-172: Pflichtdokumente-Matrix — PHASE x SZENARIO.
// KFZ-173: Kein Kasko — nur 6 Szenarien.
//
// Jede Phase definiert welche Dokument-Typen fuer ein gegebenes Szenario
// Pflicht sind. getPflichtDokumenteFuerFall() KUMULIERT alle Pflicht-Docs
// von 'lead' bis einschliesslich der aktuellen Phase des Falls.

export type Phase = 'lead' | 'aufnahme' | 'vor_termin' | 'termin' | 'nach_termin' | 'reklamation' | 'abrechnung' | 'abgeschlossen'
export type Szenario = 'haftpflicht_eindeutig' | 'haftpflicht_strittig' | 'bewertung' | 'leasingrueckgabe' | 'totalschaden' | 'gerichtsgutachten'

export const PHASEN_REIHENFOLGE: Phase[] = [
  'lead', 'aufnahme', 'vor_termin', 'termin', 'nach_termin', 'reklamation', 'abrechnung', 'abgeschlossen',
]

export const PFLICHT_DOKUMENTE_MATRIX: Record<Phase, Partial<Record<Szenario, string[]>>> = {
  lead: {
    haftpflicht_eindeutig: ['vollmacht', 'personalausweis', 'schadenmeldung'],
    haftpflicht_strittig: ['vollmacht', 'personalausweis', 'schadenmeldung', 'unfallbericht_polizei'],
    bewertung: ['vollmacht', 'personalausweis'],
    leasingrueckgabe: ['vollmacht', 'personalausweis', 'leasingvertrag'],
    totalschaden: ['vollmacht', 'personalausweis', 'schadenmeldung'],
    gerichtsgutachten: ['gerichtsbeschluss', 'akte_az'],
  },
  aufnahme: {
    haftpflicht_eindeutig: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner'],
    haftpflicht_strittig: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner', 'zeugen_kontakte'],
    bewertung: ['fahrzeugschein', 'kaufvertrag'],
    leasingrueckgabe: ['fahrzeugschein', 'leasingvertrag', 'wartungsheft'],
    totalschaden: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner'],
    gerichtsgutachten: ['fahrzeugschein'],
  },
  vor_termin: {},
  termin: {
    haftpflicht_eindeutig: ['fotos_schaden_uebersicht', 'fotos_schaden_detail', 'fotos_kennzeichen', 'fotos_tacho'],
    haftpflicht_strittig: ['fotos_schaden_uebersicht', 'fotos_schaden_detail', 'fotos_kennzeichen', 'fotos_tacho', 'fotos_unfallort'],
    bewertung: ['fotos_fahrzeug_aussen', 'fotos_fahrzeug_innen', 'fotos_kennzeichen', 'fotos_tacho'],
    leasingrueckgabe: ['fotos_fahrzeug_aussen', 'fotos_fahrzeug_innen', 'fotos_schaeden', 'fotos_kennzeichen', 'fotos_tacho'],
    totalschaden: ['fotos_schaden_uebersicht', 'fotos_schaden_detail', 'fotos_kennzeichen', 'fotos_tacho'],
    gerichtsgutachten: ['fotos_schaden_uebersicht', 'fotos_schaden_detail', 'fotos_kennzeichen', 'fotos_tacho'],
  },
  nach_termin: {
    haftpflicht_eindeutig: ['gutachten_pdf', 'kalkulation_pdf'],
    haftpflicht_strittig: ['gutachten_pdf', 'kalkulation_pdf'],
    bewertung: ['bewertungsgutachten_pdf'],
    leasingrueckgabe: ['rueckgabeprotokoll_pdf'],
    totalschaden: ['gutachten_pdf', 'kalkulation_pdf', 'restwertangebot'],
    gerichtsgutachten: ['gerichtsgutachten_pdf'],
  },
  reklamation: {},
  abrechnung: {
    haftpflicht_eindeutig: ['abrechnung_versicherer', 'zahlungsbeleg'],
    haftpflicht_strittig: ['abrechnung_versicherer', 'zahlungsbeleg'],
    bewertung: ['rechnung_kunde', 'zahlungsbeleg'],
    leasingrueckgabe: ['rechnung_leasinggeber', 'zahlungsbeleg'],
    totalschaden: ['abrechnung_versicherer', 'restwertabrechnung', 'zahlungsbeleg'],
    gerichtsgutachten: ['rechnung_gericht', 'zahlungsbeleg'],
  },
  abgeschlossen: {},
}

// Menschenlesbare Labels fuer Dokument-Typen
export const DOKUMENT_LABELS: Record<string, string> = {
  vollmacht: 'Vollmacht',
  personalausweis: 'Personalausweis',
  schadenmeldung: 'Schadenmeldung',
  unfallbericht_polizei: 'Unfallbericht (Polizei)',
  gerichtsbeschluss: 'Gerichtsbeschluss',
  akte_az: 'Akte / Aktenzeichen',
  fahrzeugschein: 'Fahrzeugschein (Zul. I)',
  versicherungsschein_eigener: 'Versicherungsschein (eigener)',
  versicherungsdaten_gegner: 'Versicherungsdaten Gegner',
  zeugen_kontakte: 'Zeugen-Kontakte',
  kaufvertrag: 'Kaufvertrag',
  leasingvertrag: 'Leasingvertrag',
  wartungsheft: 'Wartungsheft / Serviceheft',
  fotos_schaden_uebersicht: 'Fotos Schaden (Übersicht)',
  fotos_schaden_detail: 'Fotos Schaden (Detail)',
  fotos_kennzeichen: 'Foto Kennzeichen',
  fotos_tacho: 'Foto Tacho / km-Stand',
  fotos_unfallort: 'Fotos Unfallort',
  fotos_fahrzeug_aussen: 'Fotos Fahrzeug (außen)',
  fotos_fahrzeug_innen: 'Fotos Fahrzeug (innen)',
  fotos_schaeden: 'Fotos Schäden',
  gutachten_pdf: 'Gutachten (PDF)',
  kalkulation_pdf: 'Kalkulation (PDF)',
  bewertungsgutachten_pdf: 'Bewertungsgutachten (PDF)',
  rueckgabeprotokoll_pdf: 'Rückgabeprotokoll (PDF)',
  restwertangebot: 'Restwertangebot',
  gerichtsgutachten_pdf: 'Gerichtsgutachten (PDF)',
  abrechnung_versicherer: 'Abrechnung Versicherer',
  restwertabrechnung: 'Restwertabrechnung',
  zahlungsbeleg: 'Zahlungsbeleg',
  rechnung_kunde: 'Rechnung (Kunde)',
  rechnung_leasinggeber: 'Rechnung (Leasinggeber)',
  rechnung_gericht: 'Rechnung (Gericht)',
}

export type PflichtDokumentEintrag = {
  typ: string
  label: string
  ist_pflicht: true
  ab_phase: Phase
}

/**
 * Kumuliert alle Pflicht-Dokumente von Phase 'lead' bis einschliesslich
 * `aktuellePhase` fuer das gegebene `szenario`.
 */
export function getPflichtDokumenteFuerFall(
  aktuellePhase: Phase | string | null,
  szenario: Szenario | string | null,
): PflichtDokumentEintrag[] {
  if (!aktuellePhase || !szenario) return []
  const phase = aktuellePhase as Phase
  const sz = szenario as Szenario
  const result: PflichtDokumentEintrag[] = []
  const seen = new Set<string>()

  for (const p of PHASEN_REIHENFOLGE) {
    const docs = PFLICHT_DOKUMENTE_MATRIX[p]?.[sz] ?? []
    for (const typ of docs) {
      if (!seen.has(typ)) {
        seen.add(typ)
        result.push({
          typ,
          label: DOKUMENT_LABELS[typ] ?? typ,
          ist_pflicht: true,
          ab_phase: p,
        })
      }
    }
    if (p === phase) break
  }

  return result
}
