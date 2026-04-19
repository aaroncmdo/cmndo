// AAR-566 (B3): Rollen-Sichtbarkeits-Matrix für Subphasen.
//
// Single Source of Truth — welche Rolle sieht welche Subphase + mit welchem
// Label. Ersetzt alle hart-codierten `rolle === 'kunde'`-Checks in den
// Portalen. Source: Notion-Doc 3471da4c91248187b0f1de2d81063899 (Sub-Phasen-
// State-Machine) + AAR-563-Epic-Plan.
//
// Diese Datei ist bewusst eine Code-Konstante und liegt nicht in der DB:
// Änderungen gehen durch PR-Review. Der Phase-Resolver (AAR-538) schreibt
// weiter `fall.aktuelle_phase` (text mit CHECK-Constraint) — buildPhase-
// PipelineData liest das und leitet die Anzeige-States ab.

import type { PhaseState, PhaseStepData, Rolle, SubphaseData } from '@/components/shared/fall-phases/types'

export interface SubphaseRolleRule {
  visible: boolean
  labelOverride?: string
}

export interface SubphaseRuleSet {
  /** Haupt-Phase 1–10 (Pipeline-Bucket). */
  phase: number
  /** Default-Label aus Notion-Spec. */
  label: string
  /** Pro Rolle: Sichtbarkeit + optionaler Label-Override. */
  rollen: Record<Rolle, SubphaseRolleRule>
}

// ─── Haupt-Phasen-Metadaten ───────────────────────────────────────────────
// Die 10 Pipeline-Buckets aggregieren die 52 Sub-Phasen des Phase-Resolvers
// zu sichtbaren Cards. Reihenfolge = zeitlicher Ablauf.
export const PHASE_META: Record<number, { name: string }> = {
  1: { name: 'Ersterfassung & Termin' },
  2: { name: 'Begutachtung' },
  3: { name: 'Gutachten & QC' },
  4: { name: 'Kanzlei-Übergabe' },
  5: { name: 'Anschlussschreiben' },
  6: { name: 'VS-Reaktion & Verhandlung' },
  7: { name: 'Ablehnung & Klage' },
  8: { name: 'Nachbesichtigung' },
  9: { name: 'Regulierung & Zahlung' },
  10: { name: 'Auszahlung & Abschluss' },
}

// ─── Shortcut-Konstanten für die Matrix ───────────────────────────────────
function onlyInternal(overrides?: Partial<Record<Rolle, SubphaseRolleRule>>): Record<Rolle, SubphaseRolleRule> {
  return {
    admin: { visible: true },
    kb: { visible: true },
    sv: { visible: false },
    kunde: { visible: false },
    makler: { visible: false },
    ...overrides,
  } as Record<Rolle, SubphaseRolleRule>
}

function kundeGetsCompact(
  kundeLabel: string,
  overrides?: Partial<Record<Rolle, SubphaseRolleRule>>,
): Record<Rolle, SubphaseRolleRule> {
  return {
    admin: { visible: true },
    kb: { visible: true },
    sv: { visible: false },
    kunde: { visible: true, labelOverride: kundeLabel },
    makler: { visible: true, labelOverride: kundeLabel },
    ...overrides,
  } as Record<Rolle, SubphaseRolleRule>
}

// ─── Die Matrix: 52 Subphasen × 5 Rollen ──────────────────────────────────
// Keys = Werte aus Notion-CHECK-Constraint auf `faelle.aktuelle_phase`.
// Siehe Abschnitt 14 der Notion-Spec.
export const SUBPHASE_VISIBILITY: Record<string, SubphaseRuleSet> = {
  // ══ Phase 1: Ersterfassung & Termin ═════════════════════════════════════
  fallakte_wird_angelegt: {
    phase: 1,
    label: 'Fallakte wird angelegt',
    rollen: kundeGetsCompact('Schaden wird erfasst'),
  },
  fallakte_angelegt: {
    phase: 1,
    label: 'Fallakte angelegt',
    rollen: kundeGetsCompact('Schaden gemeldet'),
  },
  termin_bestaetigt: {
    phase: 1,
    label: 'Termin bestätigt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Termin bestätigt' },
      makler: { visible: true, labelOverride: 'Termin bestätigt' },
    },
  },
  sv_abgelehnt_ersatz_gesucht: {
    phase: 1,
    label: 'SV abgelehnt — Ersatz wird gesucht',
    rollen: onlyInternal(),
  },
  sv_gegenvorschlag_wartet: {
    phase: 1,
    label: 'SV hat Gegenvorschlag — Kunde wählt Slot',
    rollen: kundeGetsCompact('Neue Termin-Vorschläge — bitte wählen'),
  },

  // ══ Phase 2: Begutachtung ══════════════════════════════════════════════
  sv_unterwegs: {
    phase: 2,
    label: 'SV unterwegs',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachter ist unterwegs' },
      makler: { visible: true, labelOverride: 'Begutachtung läuft' },
    },
  },
  sv_vor_ort: {
    phase: 2,
    label: 'SV vor Ort',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachter ist da' },
      makler: { visible: true, labelOverride: 'Begutachtung läuft' },
    },
  },
  begutachtung_abgeschlossen: {
    phase: 2,
    label: 'Begutachtung abgeschlossen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Begutachtung abgeschlossen' },
      makler: { visible: true, labelOverride: 'Begutachtung abgeschlossen' },
    },
  },

  // ══ Phase 3: Gutachten & QC ════════════════════════════════════════════
  gutachten_wird_erstellt: {
    phase: 3,
    label: 'Gutachten wird erstellt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachten wird erstellt' },
      makler: { visible: true, labelOverride: 'Gutachten wird erstellt' },
    },
  },
  gutachten_erstellt: {
    phase: 3,
    label: 'Gutachten hochgeladen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachten in Prüfung' },
      makler: { visible: true, labelOverride: 'Gutachten in Prüfung' },
    },
  },
  filmcheck_laeuft: {
    phase: 3,
    label: 'Filmcheck läuft (KB-QC)',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachten wird geprüft' },
      makler: { visible: true, labelOverride: 'Gutachten wird geprüft' },
    },
  },
  qc_bestanden: {
    phase: 3,
    label: 'QC bestanden',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: true, labelOverride: 'Gutachten freigegeben' },
      makler: { visible: true, labelOverride: 'Gutachten freigegeben' },
    },
  },
  qc_nicht_bestanden: {
    phase: 3,
    label: 'QC-Fail — SV muss nachbessern',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true },
      kunde: { visible: false },
      makler: { visible: false },
    },
  },

  // ══ Phase 4: Kanzlei-Übergabe ══════════════════════════════════════════
  fallakte_wird_uebergeben: {
    phase: 4,
    label: 'Fallakte wird übergeben',
    rollen: kundeGetsCompact('Akte wird an Kanzlei übergeben'),
  },
  kanzlei_fallakte_wird_angelegt: {
    phase: 4,
    label: 'Kanzlei legt Akte an',
    rollen: kundeGetsCompact('Kanzlei bereitet Ihre Akte vor'),
  },
  kanzlei_fallakte_angelegt: {
    phase: 4,
    label: 'Kanzlei-Akte angelegt',
    rollen: kundeGetsCompact('Akte bei Kanzlei'),
  },
  anschlussschreiben_in_vorbereitung: {
    phase: 4,
    label: 'Anschlussschreiben in Vorbereitung',
    rollen: kundeGetsCompact('Anschreiben wird vorbereitet'),
  },

  // ══ Phase 5: Anschlussschreiben + Eskalation ══════════════════════════
  anschlussschreiben_versendet: {
    phase: 5,
    label: 'Anschlussschreiben versendet',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Anschreiben raus' },
      kunde: { visible: true, labelOverride: 'Anschreiben an Versicherung raus' },
      makler: { visible: true, labelOverride: 'Anschreiben raus' },
    },
  },
  warten_auf_vs: {
    phase: 5,
    label: 'Warten auf VS-Reaktion',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Warten auf Versicherung' },
      kunde: { visible: true, labelOverride: 'Wir warten auf die Versicherung' },
      makler: { visible: true, labelOverride: 'Warten auf Versicherung' },
    },
  },
  vs_kontakt_laeuft: {
    phase: 5,
    label: 'VS-Eskalation läuft (Tag 14/21/28)',
    rollen: onlyInternal({
      sv: { visible: false },
    }),
  },
  vs_kontakt_ergebnis_eingetragen: {
    phase: 5,
    label: 'Eskalations-Ergebnis eingetragen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Ergebnis der VS-Eskalation' },
      kunde: { visible: true, labelOverride: 'Rückmeldung der Versicherung' },
      makler: { visible: true, labelOverride: 'Rückmeldung der Versicherung' },
    },
  },

  // ══ Phase 6: VS-Reaktion & Verhandlung ═════════════════════════════════
  vollregulierung_angekuendigt: {
    phase: 6,
    label: 'Vollregulierung angekündigt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'VS reguliert voll' },
      kunde: { visible: true, labelOverride: 'Versicherung zahlt — Termin steht' },
      makler: { visible: true, labelOverride: 'Versicherung zahlt' },
    },
  },
  kuerzung_geprueft_wird: {
    phase: 6,
    label: 'Kürzung wird geprüft',
    rollen: kundeGetsCompact('Kanzlei prüft die Kürzung', {
      sv: { visible: true, labelOverride: 'Kürzung wird geprüft' },
    }),
  },
  technische_stellungnahme_angefordert: {
    phase: 6,
    label: 'Technische Stellungnahme angefordert',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Stellungnahme angefordert — bitte hochladen' },
      kunde: { visible: false },
      makler: { visible: false },
    },
  },
  technische_stellungnahme_hochgeladen: {
    phase: 6,
    label: 'Technische Stellungnahme hochgeladen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Stellungnahme hochgeladen' },
      kunde: { visible: false },
      makler: { visible: false },
    },
  },
  technische_stellungnahme_versandt: {
    phase: 6,
    label: 'Technische Stellungnahme versandt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Stellungnahme an Kanzlei' },
      kunde: { visible: false },
      makler: { visible: false },
    },
  },
  ruege_1_in_vorbereitung: {
    phase: 6,
    label: 'Rüge 1 in Vorbereitung',
    rollen: kundeGetsCompact('Kanzlei bereitet Rüge vor', {
      sv: { visible: true, labelOverride: 'Rüge 1 in Vorbereitung' },
    }),
  },
  ruege_1_versandt: {
    phase: 6,
    label: 'Rüge 1 versandt (14-Tage-Frist)',
    rollen: kundeGetsCompact('Rüge an Versicherung raus', {
      sv: { visible: true, labelOverride: 'Rüge 1 versandt' },
    }),
  },
  warten_auf_ruege_1_antwort: {
    phase: 6,
    label: 'Warten auf Rüge-1-Antwort',
    rollen: kundeGetsCompact('Warten auf Antwort der Versicherung', {
      sv: { visible: true, labelOverride: 'Warten auf Rüge-1-Antwort' },
    }),
  },
  ruege_2_in_vorbereitung: {
    phase: 6,
    label: 'Rüge 2 in Vorbereitung',
    rollen: kundeGetsCompact('Zweite Rüge wird vorbereitet', {
      sv: { visible: true, labelOverride: 'Rüge 2 in Vorbereitung' },
    }),
  },
  ruege_2_versandt: {
    phase: 6,
    label: 'Rüge 2 versandt (7-Tage-Frist)',
    rollen: kundeGetsCompact('Zweite Rüge raus', {
      sv: { visible: true, labelOverride: 'Rüge 2 versandt' },
    }),
  },
  warten_auf_ruege_2_antwort: {
    phase: 6,
    label: 'Warten auf Rüge-2-Antwort',
    rollen: kundeGetsCompact('Warten auf finale Antwort', {
      sv: { visible: true, labelOverride: 'Warten auf Rüge-2-Antwort' },
    }),
  },
  quotierung_eingegangen: {
    phase: 6,
    label: 'Quotierung eingegangen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Quotierung eingegangen' },
      kunde: { visible: true, labelOverride: 'Versicherung teilt Schuld auf' },
      makler: { visible: true, labelOverride: 'Quotierung eingegangen' },
    },
  },
  quotierung_wird_verhandelt: {
    phase: 6,
    label: 'Quotierung wird verhandelt',
    rollen: kundeGetsCompact('Kanzlei verhandelt die Quote', {
      sv: { visible: true, labelOverride: 'Quote wird verhandelt' },
    }),
  },

  // ══ Phase 7: Ablehnung & Klage ═════════════════════════════════════════
  ablehnung_kanzlei_prueft: {
    phase: 7,
    label: 'VS-Ablehnung — Kanzlei prüft',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'VS hat abgelehnt' },
      kunde: { visible: true, labelOverride: 'Versicherung hat abgelehnt — Kanzlei prüft' },
      makler: { visible: true, labelOverride: 'VS hat abgelehnt' },
    },
  },
  klage_entscheidung_ausstehend: {
    phase: 7,
    label: 'Klage-Entscheidung ausstehend',
    rollen: kundeGetsCompact('Entscheidung zur Klage steht aus', {
      sv: { visible: true, labelOverride: 'Klage-Entscheidung offen' },
    }),
  },
  klage_eingereicht: {
    phase: 7,
    label: 'Klage eingereicht',
    rollen: kundeGetsCompact('Klage wurde eingereicht', {
      sv: { visible: true, labelOverride: 'Klage eingereicht' },
    }),
  },
  fall_akzeptiert_storniert: {
    phase: 7,
    label: 'Fall storniert (Ablehnung akzeptiert)',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Fall storniert' },
      kunde: { visible: true, labelOverride: 'Fall abgeschlossen' },
      makler: { visible: true, labelOverride: 'Fall storniert' },
    },
  },

  // ══ Phase 8: Nachbesichtigung ══════════════════════════════════════════
  nachbesichtigung_gefordert: {
    phase: 8,
    label: 'Nachbesichtigung gefordert',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Nachbesichtigung gefordert' },
      kunde: { visible: true, labelOverride: 'Versicherung fordert Nachbesichtigung' },
      makler: { visible: true, labelOverride: 'Nachbesichtigung gefordert' },
    },
  },
  nachbesichtigung_terminkoordinierung: {
    phase: 8,
    label: 'Nachbesichtigung: Termin wird koordiniert',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Terminkoordination läuft' },
      kunde: { visible: true, labelOverride: 'Bitte Termin wählen' },
      makler: { visible: true, labelOverride: 'Terminkoordination läuft' },
    },
  },
  nachbesichtigung_mit_sv_dispatch: {
    phase: 8,
    label: 'Nachbesichtigung mit SV — Dispatch-Lite',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Nachbesichtigung: bitte annehmen' },
      kunde: { visible: true, labelOverride: 'Gutachter wird dabei sein' },
      makler: { visible: true, labelOverride: 'Nachbesichtigung mit SV' },
    },
  },
  nachbesichtigung_ohne_sv_direkt: {
    phase: 8,
    label: 'Nachbesichtigung ohne SV',
    rollen: kundeGetsCompact('Nachbesichtigung ohne Gutachter', {
      sv: { visible: false },
    }),
  },
  nachbesichtigung_sv_termin_bestaetigt: {
    phase: 8,
    label: 'Nachbesichtigungs-Termin mit SV bestätigt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Nachbesichtigungs-Termin bestätigt' },
      kunde: { visible: true, labelOverride: 'Termin mit Gutachter bestätigt' },
      makler: { visible: true, labelOverride: 'Termin bestätigt' },
    },
  },
  nachbesichtigung_durchgefuehrt: {
    phase: 8,
    label: 'Nachbesichtigung durchgeführt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Nachbesichtigung durchgeführt' },
      kunde: { visible: true, labelOverride: 'Nachbesichtigung erledigt' },
      makler: { visible: true, labelOverride: 'Nachbesichtigung erledigt' },
    },
  },
  warten_auf_gegnerisches_gutachten: {
    phase: 8,
    label: 'Warten auf gegnerisches Gutachten',
    rollen: kundeGetsCompact('Warten auf Gutachten der Versicherung', {
      sv: { visible: true, labelOverride: 'Warten auf gegnerisches Gutachten' },
    }),
  },
  regulierungsphase_klaeren_mit_kanzlei: {
    phase: 8,
    label: 'Regulierungsphase: Klärung mit Kanzlei',
    rollen: kundeGetsCompact('Kanzlei klärt die Regulierung', {
      sv: { visible: false },
    }),
  },

  // ══ Phase 9: Regulierung & Zahlung ═════════════════════════════════════
  regulierung_angekuendigt: {
    phase: 9,
    label: 'Regulierung angekündigt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Zahlung angekündigt' },
      kunde: { visible: true, labelOverride: 'Zahlung angekündigt' },
      makler: { visible: true, labelOverride: 'Zahlung angekündigt' },
    },
  },
  zahlung_wird_verbucht: {
    phase: 9,
    label: 'Zahlung wird verbucht',
    rollen: kundeGetsCompact('Zahlung eingegangen — Auszahlung wird vorbereitet'),
  },
  zahlung_verzoegert: {
    phase: 9,
    label: 'Zahlung verzögert',
    rollen: kundeGetsCompact('Zahlung verzögert — Kanzlei fragt nach', {
      sv: { visible: true, labelOverride: 'Zahlung verzögert' },
    }),
  },
  teilzahlung_eingegangen: {
    phase: 9,
    label: 'Teilzahlung eingegangen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Teilzahlung eingegangen' },
      kunde: { visible: true, labelOverride: 'Teilzahlung eingegangen' },
      makler: { visible: true, labelOverride: 'Teilzahlung eingegangen' },
    },
  },
  vollzahlung_eingegangen: {
    phase: 9,
    label: 'Vollzahlung eingegangen',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'Vollzahlung eingegangen' },
      kunde: { visible: true, labelOverride: 'Vollzahlung eingegangen' },
      makler: { visible: true, labelOverride: 'Vollzahlung eingegangen' },
    },
  },

  // ══ Phase 10: Auszahlung & Abschluss ═══════════════════════════════════
  auszahlungen_verteilt: {
    phase: 10,
    label: 'Auszahlungen verteilt',
    rollen: {
      admin: { visible: true },
      kb: { visible: true },
      sv: { visible: true, labelOverride: 'SV-Honorar ausgezahlt' },
      kunde: { visible: true, labelOverride: 'Auszahlung an Sie erfolgt' },
      makler: { visible: true, labelOverride: 'Auszahlung erfolgt' },
    },
  },
}

// ─── Helper 1: Einzelzugriff ──────────────────────────────────────────────
/**
 * Liefert für eine Subphase-ID + Rolle das visibility-Flag + ggf.
 * Label-Override. Unbekannte Subphasen sind für alle Rollen hidden
 * (defensive default — Resolver sollte nie nicht-registrierte Strings liefern).
 */
export function getSubphaseVisibilityForRolle(
  subphaseId: string,
  rolle: Rolle,
): SubphaseRolleRule {
  const rule = SUBPHASE_VISIBILITY[subphaseId]
  if (!rule) return { visible: false }
  return rule.rollen[rolle] ?? { visible: false }
}

// ─── Helper 2: Pipeline-Data bauen ────────────────────────────────────────

export interface FallForPipeline {
  id: string
  aktuelle_phase: string | null
  status?: string | null
  abgeschlossen_am?: string | null
  // Optional: Timeline von bereits erreichten Subphasen. Wenn nicht geliefert,
  // wird nur `aktuelle_phase` markiert.
  reached?: Array<{ subphase: string; at: string; by?: string }>
}

/**
 * Baut die komplette PhaseStepData[] für einen Fall + Rolle.
 *
 * Logik:
 * 1. Alle Subphasen aus SUBPHASE_VISIBILITY nach `phase` gruppieren.
 * 2. Pro Subphase: state ableiten (done / active / upcoming).
 * 3. Rollen-Filter: versteckte Subphasen bekommen `visible: false`.
 * 4. Phase-State aggregieren:
 *    - wenn irgendeine Subphase active → phase active
 *    - wenn alle sichtbaren done → phase done
 *    - sonst upcoming
 *
 * Die Subphasen-Timeline (Parameter `reached`) ist optional. Ohne Timeline
 * markieren wir nur die aktuelle + alle Subphasen mit niedrigerem phase-Wert
 * als done (grobe Heuristik). Der Phase-Resolver (AAR-538) kann präzisere
 * Timelines liefern.
 */
export function buildPhasePipelineData(
  fall: FallForPipeline,
  rolle: Rolle,
): PhaseStepData[] {
  const aktuelleSubphase = fall.aktuelle_phase ?? null
  const aktuelleRule = aktuelleSubphase ? SUBPHASE_VISIBILITY[aktuelleSubphase] : null
  const aktuellePhaseNr = aktuelleRule?.phase ?? 0
  const reachedMap = new Map<string, { at: string; by?: string }>()
  for (const r of fall.reached ?? []) {
    reachedMap.set(r.subphase, { at: r.at, by: r.by })
  }

  const phaseNumbers = Object.keys(PHASE_META).map(Number).sort((a, b) => a - b)

  return phaseNumbers.map((phaseNr) => {
    const phaseName = PHASE_META[phaseNr].name
    const subRules = Object.entries(SUBPHASE_VISIBILITY).filter(([, r]) => r.phase === phaseNr)

    const subphases: SubphaseData[] = subRules.map(([id, rule]) => {
      const rolleRule = rule.rollen[rolle] ?? { visible: false }
      const reached = reachedMap.get(id)
      let subState: PhaseState
      if (id === aktuelleSubphase) subState = 'active'
      else if (reached) subState = 'done'
      else if (phaseNr < aktuellePhaseNr) subState = 'done'
      else if (phaseNr > aktuellePhaseNr) subState = 'upcoming'
      else subState = 'upcoming'
      return {
        id,
        label: rolleRule.labelOverride ?? rule.label,
        state: subState,
        reachedAt: reached?.at,
        visible: rolleRule.visible,
      }
    })

    const sichtbare = subphases.filter((s) => s.visible)
    let phaseState: PhaseState
    if (fall.abgeschlossen_am && phaseNr === 10) phaseState = 'done'
    else if (sichtbare.some((s) => s.state === 'active')) phaseState = 'active'
    else if (phaseNr < aktuellePhaseNr) phaseState = 'done'
    else if (phaseNr === aktuellePhaseNr) phaseState = 'active'
    else phaseState = 'upcoming'

    return {
      phase: phaseNr,
      name: phaseName,
      state: phaseState,
      subphases,
    }
  })
}
