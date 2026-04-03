// KFZ-126 NEU: Stepper-Konfiguration mit Szenario-Unterstuetzung

export type Phase = {
  key: string
  label: string
  desc: string
  subs: string[]
  pctFrom: number
  pctTo: number
}

export type Progress = {
  phase: number
  subStep: number
  pct: number
}

// ─── NORMALFALL (20-30 Tage) ────────────────────────────────────────────────

export const NORMALFALL_PHASEN: Phase[] = [
  { key: 'kontakt', label: 'Kontakt aufgenommen', desc: 'Ihr Schadenfall wurde erfasst.',
    subs: ['Schadenfall erfasst', 'Erstberatung abgeschlossen'], pctFrom: 0, pctTo: 5 },
  { key: 'sa', label: 'Sicherungsabtretung', desc: 'Ihre SA wird unterschrieben.',
    subs: ['Datenschutz akzeptiert', 'SA unterschrieben', 'Account erstellt'], pctFrom: 5, pctTo: 10 },
  { key: 'gutachter', label: 'Gutachter wird gesucht', desc: 'Ein Sachverstaendiger wird zugewiesen.',
    subs: ['Gutachter zugewiesen', 'Termin vereinbart', 'Terminbestaetigung erhalten'], pctFrom: 10, pctTo: 20 },
  { key: 'besichtigung', label: 'Fahrzeug-Besichtigung', desc: 'Der Gutachter besichtigt Ihr Fahrzeug.',
    subs: ['Gutachter vor Ort', 'Besichtigung abgeschlossen', 'Fotos erstellt'], pctFrom: 20, pctTo: 30 },
  { key: 'gutachten', label: 'Gutachten wird erstellt', desc: 'Das Gutachten wird angefertigt.',
    subs: ['Gutachten in Bearbeitung', 'Gutachten hochgeladen', 'Qualitaetspruefung bestanden'], pctFrom: 30, pctTo: 50 },
  { key: 'kanzlei', label: 'Kanzlei uebernimmt', desc: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.',
    subs: ['Mandat eroeffnet', 'Anspruchsschreiben an Versicherung'], pctFrom: 50, pctTo: 65 },
  { key: 'versicherung', label: 'Versicherung bearbeitet', desc: 'Die Versicherung reguliert Ihren Schaden.',
    subs: ['Ansprueche eingereicht', 'Regulierung angekuendigt'], pctFrom: 65, pctTo: 85 },
  { key: 'auszahlung', label: 'Auszahlung', desc: 'Ihr Geld wird ausgezahlt.',
    subs: ['Zahlung eingegangen', 'Auszahlung an Sie erfolgt', 'Fall abgeschlossen'], pctFrom: 85, pctTo: 100 },
]

// ─── RUEGEFALL (30-60 Tage) ─────────────────────────────────────────────────

export const RUEGEFALL_PHASEN: Phase[] = [
  { key: 'kontakt', label: 'Kontakt aufgenommen', desc: 'Ihr Schadenfall wurde erfasst.',
    subs: ['Schadenfall erfasst', 'Erstberatung abgeschlossen'], pctFrom: 0, pctTo: 3 },
  { key: 'sa', label: 'Sicherungsabtretung', desc: 'Ihre SA wird unterschrieben.',
    subs: ['Datenschutz akzeptiert', 'SA unterschrieben', 'Account erstellt'], pctFrom: 3, pctTo: 7 },
  { key: 'gutachter', label: 'Gutachter wird gesucht', desc: 'Ein Sachverstaendiger wird zugewiesen.',
    subs: ['Gutachter zugewiesen', 'Termin vereinbart', 'Terminbestaetigung erhalten'], pctFrom: 7, pctTo: 14 },
  { key: 'besichtigung', label: 'Fahrzeug-Besichtigung', desc: 'Der Gutachter besichtigt Ihr Fahrzeug.',
    subs: ['Gutachter vor Ort', 'Besichtigung abgeschlossen', 'Fotos erstellt'], pctFrom: 14, pctTo: 21 },
  { key: 'gutachten', label: 'Gutachten wird erstellt', desc: 'Das Gutachten wird angefertigt.',
    subs: ['Gutachten in Bearbeitung', 'Gutachten hochgeladen', 'Qualitaetspruefung bestanden'], pctFrom: 21, pctTo: 35 },
  { key: 'kanzlei', label: 'Kanzlei uebernimmt', desc: 'Ihr Fall wurde an die Partnerkanzlei uebergeben.',
    subs: ['Mandat eroeffnet', 'Anspruchsschreiben an Versicherung'], pctFrom: 35, pctTo: 45 },
  { key: 'versicherung', label: 'Versicherung — Einwaende', desc: 'Die Versicherung hat Einwaende erhoben.',
    subs: [
      'Ansprueche eingereicht', 'Frist laeuft (14 Tage)', 'Keine Antwort — Nachfrage gesendet',
      'Ruege/Kuerzung erhalten', 'Stellungnahme wird erstellt',
      'Mahnung mit Verzugszinsen', 'Letzte Mahnung + Klageankuendigung',
      'Versicherung lenkt ein / Nachregulierung',
    ], pctFrom: 45, pctTo: 85 },
  { key: 'auszahlung', label: 'Auszahlung', desc: 'Ihr Geld wird ausgezahlt.',
    subs: ['Zahlung eingegangen', 'Auszahlung an Sie erfolgt', 'Fall abgeschlossen'], pctFrom: 85, pctTo: 100 },
]

export const SZENARIO_PHASEN: Record<string, Phase[]> = {
  normalfall: NORMALFALL_PHASEN,
  ruegefall: RUEGEFALL_PHASEN,
  klagefall: RUEGEFALL_PHASEN, // Platzhalter
}

// ─── Progress-Berechnung aus DB-Feldern ─────────────────────────────────────

export function berechneProgress(fall: Record<string, unknown>, phasen: Phase[]): Progress {
  const status = (fall.status as string) ?? 'ersterfassung'
  const sa = fall.sa_unterschrieben === true
  const kundeId = fall.kunde_id as string | null
  const svId = fall.sv_id as string | null
  const svTermin = fall.sv_termin as string | null
  const terminStatus = (fall.gutachter_termin_status as string) ?? ''
  const gutachtenAm = fall.gutachten_eingegangen_am as string | null
  const regulierungAm = fall.regulierung_am as string | null

  function pct(phaseIdx: number, subIdx: number): number {
    const p = phasen[phaseIdx]
    if (!p) return 0
    const range = p.pctTo - p.pctFrom
    const subPct = p.subs.length > 0 ? (subIdx / p.subs.length) * range : 0
    return Math.round(p.pctFrom + subPct)
  }

  if (status === 'abgeschlossen') return { phase: 7, subStep: 2, pct: 100 }
  if (regulierungAm) return { phase: 7, subStep: 1, pct: pct(7, 1) }
  if (status === 'regulierung') return { phase: 6, subStep: 1, pct: pct(6, 1) }
  if (status === 'anschlussschreiben') return { phase: 6, subStep: 0, pct: pct(6, 0) }
  if (status === 'kanzlei-uebergeben') return { phase: 5, subStep: 0, pct: pct(5, 0) }
  if (status === 'filmcheck' || status === 'qc-pruefung') return { phase: 4, subStep: 2, pct: pct(4, 2) }
  if (gutachtenAm || status === 'gutachten-eingegangen') return { phase: 4, subStep: 1, pct: pct(4, 1) }
  if (status === 'besichtigung') return { phase: 3, subStep: 1, pct: pct(3, 1) }
  if (terminStatus === 'bestaetigt' && svTermin) return { phase: 2, subStep: 2, pct: pct(2, 2) }
  if (svTermin) return { phase: 2, subStep: 1, pct: pct(2, 1) }
  if (svId) return { phase: 2, subStep: 0, pct: pct(2, 0) }
  if (sa && kundeId) return { phase: 1, subStep: 2, pct: pct(1, 2) }
  if (sa) return { phase: 1, subStep: 1, pct: pct(1, 1) }
  if (status !== 'ersterfassung') return { phase: 0, subStep: 1, pct: pct(0, 1) }
  return { phase: 0, subStep: 0, pct: pct(0, 0) }
}
