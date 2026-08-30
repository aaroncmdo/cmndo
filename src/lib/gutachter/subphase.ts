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
  // CMM-49 T1.2: abgeleitete Phase (v_claim_phase main_phase/sub_phase) statt legacy
  // faelle.status. Quelle: v_faelle_mit_aktuellem_termin (`*`-Select beim Caller).
  main_phase?: string | null
  sub_phase?: string | null
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

  // Terminal-Zustände (CMM-49 T1.2: abgeleitete sub_phase statt faelle.status).
  if (fall.sub_phase === 'storniert') {
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

  // erfolgreich_reguliert == altes faelle.status 'abgeschlossen'
  if (fall.sub_phase === 'erfolgreich_reguliert') {
    return {
      code: 'zahlung-eingegangen',
      phase: 6,
      phaseLabel: 'Abschluss',
      label: 'Zahlung eingegangen',
      subphaseIndex: 0,
      subphaseCount: PHASE_6_SUBPHASEN.length,
    }
  }

  // Phase 6 — Abschluss: Auszahlung läuft (== altes 'zahlung-eingegangen') ODER Zahlungs-Timestamp
  if (fall.sub_phase === 'auszahlung' || fall.zahlung_eingegangen_am) {
    return {
      code: 'zahlung-eingegangen',
      phase: 6,
      phaseLabel: 'Abschluss',
      label: 'Zahlung eingegangen',
      subphaseIndex: 0,
      subphaseCount: PHASE_6_SUBPHASEN.length,
    }
  }

  // Phase 5 — Kanzlei-Bearbeitung.
  //
  // ⚠ Die frühere Annahme hier war, das 4-Phasen-Modell kollabiere
  // 'anschlussschreiben'/'regulierung' auf 'versicherungskontakt' und
  // 'filmcheck'/'qc-pruefung' auf 'kanzlei_uebergabe'. **Die DB tut das nicht** —
  // gemessen 30.08.2026 auf prod (service_role-Sicht auf v_claim_phase): sie führt
  // `anschlussschreiben`, `filmcheck`, `vs-kuerzt` und `an_externe_kanzlei` als
  // EIGENE Werte. Kein Phase-5-Zweig griff für sie; sie fielen auf den Phase-4-
  // Default („Auftrag eingegangen") zurück. Folge im SV-Portal: falscher Stepper —
  // und ohne `gutachten_eingegangen_am` verschwand die GutachtenCard ganz
  // (GutachtenCard.tsx: `if (!istAbGutachtenErstellen(subphase) && …) return null`).
  //
  // Der Unit-Test fing das nicht: er speiste die Werte ein, die der Code erwartet,
  // teilte also dessen Annahme. Die Fälle unten sind deshalb mit den REAL in der
  // DB vorkommenden Werten belegt.
  //
  // Bewusst NICHT über `main_phase` gemappt: die Achsen sind nicht deckungsgleich.
  // `kanzlei_uebergabe` trägt `main_phase='begutachtung'` (der Claim ist noch in
  // Prüfung), gehört aus SV-Sicht aber in Phase 5 — seine Arbeit ist dort durch.
  // Ein main_phase-Mapping hätte diese 5 Fälle zurückgestuft.
  if (
    fall.sub_phase === 'versicherungskontakt' ||
    fall.sub_phase === 'anschlussschreiben' ||
    fall.sub_phase === 'vs-kuerzt'
  ) {
    return {
      code: 'regulierung',
      phase: 5,
      phaseLabel: 'Kanzlei-Bearbeitung',
      label: 'Regulierung läuft',
      subphaseIndex: 2,
      subphaseCount: PHASE_5_SUBPHASEN.length,
    }
  }
  if (
    fall.sub_phase === 'kanzlei_uebergabe' ||
    fall.sub_phase === 'filmcheck' ||
    fall.sub_phase === 'qc-pruefung' ||
    // an eine externe Kanzlei abgegeben: für den SV ist der Fall aus der
    // Begutachtung raus — Phase 4 („Auftrag eingegangen") wäre schlicht falsch.
    fall.sub_phase === 'an_externe_kanzlei'
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
