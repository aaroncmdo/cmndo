// AAR-289: Phasen + Subphasen-Ableitung für die SV-Fallakte.
// Single Source of Truth — alle UI-Komponenten leiten Subphase via getSvSubphase
// aus den bestehenden faelle-Feldern ab. Keine neuen DB-Spalten nötig.

export type SvSubphaseCode =
  | 'auftrag-eingegangen'
  | 'termin-bestaetigt'
  | 'vor-ort'
  | 'gutachten-erstellen'
  | 'kanzlei-uebergeben'
  | 'anspruchsschreiben'
  | 'regulierung'
  | 'zahlung-eingegangen'
  | 'honorar-ueberwiesen'
  | 'abgeschlossen'
  | 'storniert'

export type SvSubphase = {
  code: SvSubphaseCode
  phase: 4 | 5 | 6
  phaseLabel: 'Begutachtung' | 'Kanzlei-Bearbeitung' | 'Abschluss' | 'Abgeschlossen' | 'Storniert'
  label: string
  /** Index innerhalb der Phase (0-indexiert), für Stepper-Rendering */
  subphaseIndex: number
  /** Anzahl Subphasen in dieser Phase (für Stepper-Rendering) */
  subphaseCount: number
}

const PHASE_4_SUBPHASEN: Array<{ code: SvSubphaseCode; label: string }> = [
  { code: 'auftrag-eingegangen', label: 'Auftrag eingegangen' },
  { code: 'termin-bestaetigt', label: 'Termin bestätigt' },
  { code: 'vor-ort', label: 'Vor Ort / am Termintag' },
  { code: 'gutachten-erstellen', label: 'Gutachten erstellen' },
]

const PHASE_5_SUBPHASEN: Array<{ code: SvSubphaseCode; label: string }> = [
  { code: 'kanzlei-uebergeben', label: 'An Kanzlei übergeben' },
  { code: 'anspruchsschreiben', label: 'Anspruchsschreiben versandt' },
  { code: 'regulierung', label: 'Regulierung läuft' },
]

const PHASE_6_SUBPHASEN: Array<{ code: SvSubphaseCode; label: string }> = [
  { code: 'zahlung-eingegangen', label: 'Zahlung eingegangen' },
  { code: 'honorar-ueberwiesen', label: 'Honorar überwiesen' },
]

function indexIn(
  subphasen: Array<{ code: SvSubphaseCode }>,
  code: SvSubphaseCode,
): number {
  return subphasen.findIndex((s) => s.code === code)
}

export type FallSubphaseInput = {
  status: string | null
  gutachter_termin_bestaetigt: boolean | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  zahlung_eingegangen_am?: string | null
}

export type AbrechnungSubphaseInput = {
  ausgezahlt_am: string | null
} | null

export function getSvSubphase(
  fall: FallSubphaseInput,
  abrechnung?: AbrechnungSubphaseInput,
  now: Date = new Date(),
): SvSubphase {
  const svTermin = fall.sv_termin ? new Date(fall.sv_termin) : null
  const nachTermin24h = svTermin
    ? new Date(svTermin.getTime() + 24 * 60 * 60 * 1000)
    : null

  // Terminal-Zustände
  if (fall.status === 'storniert') {
    return {
      code: 'storniert',
      phase: 6,
      phaseLabel: 'Storniert',
      label: 'Fall storniert',
      subphaseIndex: 0,
      subphaseCount: 1,
    }
  }

  if (abrechnung?.ausgezahlt_am) {
    return {
      code: 'honorar-ueberwiesen',
      phase: 6,
      phaseLabel: 'Abschluss',
      label: 'Honorar überwiesen',
      subphaseIndex: 1,
      subphaseCount: PHASE_6_SUBPHASEN.length,
    }
  }

  if (fall.status === 'abgeschlossen') {
    return {
      code: 'zahlung-eingegangen',
      phase: 6,
      phaseLabel: 'Abschluss',
      label: 'Zahlung eingegangen',
      subphaseIndex: 0,
      subphaseCount: PHASE_6_SUBPHASEN.length,
    }
  }

  // Phase 6 — Abschluss
  if (fall.status === 'zahlung-eingegangen' || fall.zahlung_eingegangen_am) {
    return {
      code: 'zahlung-eingegangen',
      phase: 6,
      phaseLabel: 'Abschluss',
      label: 'Zahlung eingegangen',
      subphaseIndex: 0,
      subphaseCount: PHASE_6_SUBPHASEN.length,
    }
  }

  // Phase 5 — Kanzlei-Bearbeitung
  if (fall.status === 'regulierung' || fall.status === 'regulierung-laeuft') {
    return {
      code: 'regulierung',
      phase: 5,
      phaseLabel: 'Kanzlei-Bearbeitung',
      label: 'Regulierung läuft',
      subphaseIndex: 2,
      subphaseCount: PHASE_5_SUBPHASEN.length,
    }
  }
  if (fall.status === 'anschlussschreiben') {
    return {
      code: 'anspruchsschreiben',
      phase: 5,
      phaseLabel: 'Kanzlei-Bearbeitung',
      label: 'Anspruchsschreiben versandt',
      subphaseIndex: 1,
      subphaseCount: PHASE_5_SUBPHASEN.length,
    }
  }
  if (
    fall.status === 'kanzlei-uebergeben' ||
    fall.status === 'filmcheck' ||
    fall.status === 'qc-pruefung'
  ) {
    return {
      code: 'kanzlei-uebergeben',
      phase: 5,
      phaseLabel: 'Kanzlei-Bearbeitung',
      label: 'An Kanzlei übergeben',
      subphaseIndex: 0,
      subphaseCount: PHASE_5_SUBPHASEN.length,
    }
  }

  // Phase 4 — Begutachtung
  if (fall.gutachten_eingegangen_am) {
    return {
      code: 'gutachten-erstellen',
      phase: 4,
      phaseLabel: 'Begutachtung',
      label: 'Gutachten erstellt (wartet auf Kanzlei-Übergabe)',
      subphaseIndex: 3,
      subphaseCount: PHASE_4_SUBPHASEN.length,
    }
  }
  if (svTermin && nachTermin24h && now > nachTermin24h) {
    return {
      code: 'gutachten-erstellen',
      phase: 4,
      phaseLabel: 'Begutachtung',
      label: 'Gutachten erstellen',
      subphaseIndex: 3,
      subphaseCount: PHASE_4_SUBPHASEN.length,
    }
  }
  if (svTermin && nachTermin24h && now >= svTermin && now <= nachTermin24h) {
    return {
      code: 'vor-ort',
      phase: 4,
      phaseLabel: 'Begutachtung',
      label: 'Vor Ort / am Termintag',
      subphaseIndex: 2,
      subphaseCount: PHASE_4_SUBPHASEN.length,
    }
  }
  if (fall.gutachter_termin_bestaetigt && svTermin && now < svTermin) {
    return {
      code: 'termin-bestaetigt',
      phase: 4,
      phaseLabel: 'Begutachtung',
      label: 'Termin bestätigt',
      subphaseIndex: 1,
      subphaseCount: PHASE_4_SUBPHASEN.length,
    }
  }

  // Default: Auftrag eingegangen
  return {
    code: 'auftrag-eingegangen',
    phase: 4,
    phaseLabel: 'Begutachtung',
    label: 'Auftrag eingegangen',
    subphaseIndex: 0,
    subphaseCount: PHASE_4_SUBPHASEN.length,
  }
}

/** Hilfsfunktion für Stepper-Rendering */
export function getPhaseSubphasen(
  phase: 4 | 5 | 6,
): Array<{ code: SvSubphaseCode; label: string }> {
  switch (phase) {
    case 4:
      return PHASE_4_SUBPHASEN
    case 5:
      return PHASE_5_SUBPHASEN
    case 6:
      return PHASE_6_SUBPHASEN
  }
}

// Helper damit Linter `indexIn` nicht anmault wenn nicht extern genutzt
export const _internal = { indexIn }
