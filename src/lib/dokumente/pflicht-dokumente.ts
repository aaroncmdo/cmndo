// KFZ-172: Pflichtdokumente-Matrix — PHASE x SZENARIO.
// KFZ-173: Kein Kasko — nur 6 Szenarien.
//
// Jede Phase definiert welche Dokument-Typen fuer ein gegebenes Szenario
// Pflicht sind. getPflichtDokumenteFuerFall() KUMULIERT alle Pflicht-Docs
// von 'lead' bis einschliesslich der aktuellen Phase des Falls.

import { pflichtAusFakten, type FallFakten } from './pflicht-fakten'
export type { FallFakten }

export type Phase = 'lead' | 'aufnahme' | 'vor_termin' | 'termin' | 'nach_termin' | 'reklamation' | 'abrechnung' | 'abgeschlossen'
// WS5b (Reduced-Repair): 'selbstzahler' + 'kasko' = reparatur-only-Claims (kein SV/Gutachten/
// Regulierung) -> reduziertes Pflichtdok-Set (nur Fahrzeugschein).
// ⚠ 28.08.2026: `normalfall`/`ruegefall`/`klagefall` FEHLTEN hier, obwohl sie die real
// vergebenen Werte sind — `src/lib/fall/subphase-resolver.ts` kennt eine ANDERE Wertemenge,
// eine Uebersetzung gab es nicht. Gemessen auf prod: **63 von 80 Claims = 'normalfall'**.
// Fuer sie lieferte getPflichtDokumenteFuerFall() in JEDER Phase eine leere Liste, der
// Reminder-Cron uebersprang sie still (`if (pflicht.length === 0) continue`) — Ergebnis:
// 0 erzeugte `dokument-hochladen`-Tasks, seit jeher.
export type Szenario =
  | 'normalfall' | 'ruegefall' | 'klagefall'
  | 'haftpflicht_eindeutig' | 'haftpflicht_strittig' | 'bewertung' | 'leasingrueckgabe'
  | 'totalschaden' | 'gerichtsgutachten' | 'selbstzahler' | 'kasko'

export const PHASEN_REIHENFOLGE: Phase[] = [
  'lead', 'aufnahme', 'vor_termin', 'termin', 'nach_termin', 'reklamation', 'abrechnung', 'abgeschlossen',
]

export const PFLICHT_DOKUMENTE_MATRIX: Record<Phase, Partial<Record<Szenario, string[]>>> = {
  lead: {
    haftpflicht_eindeutig: ['vollmacht', 'personalausweis', 'schadenmeldung'],
    // 28.08.: `unfallbericht_polizei` -> `polizeibericht`. Der Typ, den die App real
    // schreibt, heisst `polizeibericht` (fall_dokumente); der alte Name kam in KEINER
    // einzigen Zeile vor. Ein Abgleich gegen einen Namen, den niemand vergibt, meldet das
    // Dokument dauerhaft als fehlend — auch wenn es laengst hochgeladen ist.
    haftpflicht_strittig: ['vollmacht', 'personalausweis', 'schadenmeldung', 'polizeibericht'],
    bewertung: ['vollmacht', 'personalausweis'],
    leasingrueckgabe: ['vollmacht', 'personalausweis', 'leasingvertrag'],
    totalschaden: ['vollmacht', 'personalausweis', 'schadenmeldung'],
    gerichtsgutachten: ['gerichtsbeschluss', 'akte_az'],
  },
  aufnahme: {
    // ⚠ normalfall/ruegefall/klagefall bekommen hier BEWUSST (noch) KEINE Szenario-Pflicht.
    // Zwei Messungen vom 28.08. stehen dagegen:
    //  1. Von allen Typen dieser Matrix existiert real genau EINER (`fahrzeugschein`);
    //     vollmacht/personalausweis/schadenmeldung/versicherungsschein_* kommen in
    //     `fall_dokumente.dokument_typ` in KEINER Zeile vor. Sie zu fordern hiesse, ein
    //     Dokument anzumahnen, das niemand hochladen kann.
    //  2. Selbst `fahrzeugschein` waere hier gefaehrlich: die 70 vorhandenen ZB1-Dokumente
    //     verteilen sich auf nur **2** Faelle — 78 von 80 Claims haetten sofort einen
    //     „fehlt"-Task bekommen, in eine Aufgabenliste mit bereits 707 offenen Eintraegen.
    //     Das waere kein Fortschritt, sondern mehr Rauschen im selben Kanal
    //     (siehe audit-aufgabenliste-707-offen-davon-41-prozent-test).
    // Die faktenbasierte Pflicht unten greift dagegen sofort und trifft genau die Faelle,
    // in denen der Kunde die Angabe selbst gemacht hat.
    haftpflicht_eindeutig: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner'],
    haftpflicht_strittig: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner', 'zeugen_kontakte'],
    bewertung: ['fahrzeugschein', 'kaufvertrag'],
    leasingrueckgabe: ['fahrzeugschein', 'leasingvertrag', 'wartungsheft'],
    totalschaden: ['fahrzeugschein', 'versicherungsschein_eigener', 'versicherungsdaten_gegner'],
    gerichtsgutachten: ['fahrzeugschein'],
    // WS5b (Reduced-Repair): reparatur-only — nur Fahrzeugschein (ZB1). Schadenfotos (WS3
    // SchadensfotoUploadCard) + KVA (WS4 KostenvoranschlagCard) laufen ueber eigene Kunde-Cards.
    // KEIN vollmacht/gutachten/versicherer.
    selbstzahler: ['fahrzeugschein'],
    kasko: ['fahrzeugschein'],
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
  polizeibericht: 'Polizeibericht',
  mietwagen_rechnung: 'Mietwagen-Rechnung',
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
  /** Gesetzt, wenn ein erhobener FAKT die Pflicht ausloest (statt des Szenarios). */
  grund?: string
}

/**
 * Kumuliert alle Pflicht-Dokumente von Phase 'lead' bis einschliesslich `aktuellePhase`
 * fuer das gegebene `szenario` — PLUS die Dokumente, die erhobene Fakten erzwingen.
 *
 * ⭐ Aaron 28.08.: *„wenn Sachen wie ‚Polizei war vor Ort' gesetzt wurden, dann ist der
 * Polizeibericht Pflicht."* Bis dahin konnte NUR das Szenario eine Pflicht ausloesen; ein
 * erhobener Fakt nicht. `fakten` ist optional — bestehende Aufrufer bleiben unveraendert,
 * bekommen aber auch keine faktenbasierte Pflicht.
 */
export function getPflichtDokumenteFuerFall(
  aktuellePhase: Phase | string | null,
  szenario: Szenario | string | null,
  fakten?: FallFakten | null,
): PflichtDokumentEintrag[] {
  const result: PflichtDokumentEintrag[] = []
  const seen = new Set<string>()

  // (1) Szenario-Matrix — kumuliert bis zur aktuellen Phase.
  if (aktuellePhase && szenario) {
    const phase = aktuellePhase as Phase
    const sz = szenario as Szenario
    for (const p of PHASEN_REIHENFOLGE) {
      for (const typ of PFLICHT_DOKUMENTE_MATRIX[p]?.[sz] ?? []) {
        if (seen.has(typ)) continue
        seen.add(typ)
        result.push({ typ, label: DOKUMENT_LABELS[typ] ?? typ, ist_pflicht: true, ab_phase: p })
      }
      if (p === phase) break
    }
  }

  // (2) Fakten-Regeln — unabhaengig vom Szenario. Ein Fall ohne bekanntes Szenario kann so
  //     trotzdem eine begruendete Pflicht haben; genau daran fielen die 63 `normalfall`-
  //     Claims bisher durch.
  const abFakten = fakten ? pflichtAusFakten(fakten) : []
  for (const regel of abFakten) {
    if (seen.has(regel.dann)) continue
    seen.add(regel.dann)
    result.push({
      typ: regel.dann,
      label: DOKUMENT_LABELS[regel.dann] ?? regel.dann,
      ist_pflicht: true,
      // Fakten gelten ab der Aufnahme — vorher ist der Fakt noch nicht erhoben.
      ab_phase: 'aufnahme',
      grund: regel.begruendung,
    })
  }

  return result
}
