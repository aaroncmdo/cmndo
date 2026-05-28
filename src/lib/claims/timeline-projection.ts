// AAR-843 / CMM-44 MP-6c: Future-Projection — was kommt als nächstes basierend
// auf der Claim-Phase.
//
// Pure Function. Kein DB-Zugriff. Wird vom Server als Teil der Timeline-Page
// gerendert. Bei Abschluss-Phase leeres Array.
//
// CMM-44 MP-6c: claims.phase (10-Code) wurde gedroppt. Die Projektion läuft jetzt
// über das v_claim_phase-Modell (mainPhase + subPhase). Mapping der alten 10-Code-
// Cases auf die Subphasen:
//   1_neu/0_lead              -> erfassung/*            (KB-Zuweisung erwartet)
//   2_in_bearbeitung          -> begutachtung/termin    (Gutachter wird beauftragt)
//   3_gutachter_unterwegs     -> begutachtung/besichtigung (Besichtigung + Gutachten)
//   4_gutachten_fertig        -> begutachtung/gutachten | kanzlei_uebergabe (Reparatur geplant)
//   5_in_reparatur            -> (kein direkter Sub — Reparatur-Tracking läuft über repairs)
//   6_kommunikation_versicherung -> regulierung/versicherungskontakt (VS-Antwort erwartet)

import type { ClaimMainPhase, ClaimSubPhase } from './lifecycle'

export type ProjectedEvent = {
  event_typ:    string
  /** Kunde-friendly Label */
  labelKunde:   string
  /** Fachsprache für Admin/KB */
  labelInternal: string
  /** Geschätzte Zeit. Range = "in 7-14 Tagen", non-Range = "bis 02.05." */
  estimatedHorizon: string
  /** true: Range/grob — false: präziseres Datum */
  isRange:      boolean
}

export function projectNextEvents(input: {
  mainPhase: ClaimMainPhase | null
  subPhase: ClaimSubPhase | null
  /** Optional: erwartetes Reparatur-Ende aus repairs.geplanter_ende */
  reparaturEndeIso?: string | null
}): ProjectedEvent[] {
  const { mainPhase, subPhase, reparaturEndeIso } = input

  if (!mainPhase || mainPhase === 'abschluss') return []

  // ── Erfassung ── Lead noch nicht durch → KB-Zuweisung steht an.
  if (mainPhase === 'erfassung') {
    return [
      {
        event_typ: 'claim.kb_zugewiesen',
        labelKunde: 'Kundenbetreuer wird zugewiesen',
        labelInternal: 'KB-Pool weist Claim zu',
        estimatedHorizon: 'innerhalb 1 Werktag',
        isRange: true,
      },
    ]
  }

  // ── Begutachtung ── je nach Subphase: Termin → Besichtigung → Gutachten → Reparatur.
  if (mainPhase === 'begutachtung') {
    switch (subPhase) {
      case 'termin':
        return [
          {
            event_typ: 'gutachten.beauftragt',
            labelKunde: 'Gutachter wird beauftragt',
            labelInternal: 'KB beauftragt SV',
            estimatedHorizon: 'in 1–3 Tagen',
            isRange: true,
          },
        ]
      case 'besichtigung':
        return [
          {
            event_typ: 'termin.durchgefuehrt',
            labelKunde: 'Gutachter besichtigt Fahrzeug',
            labelInternal: 'SV-Besichtigung',
            estimatedHorizon: 'in 2–5 Tagen',
            isRange: true,
          },
          {
            event_typ: 'gutachten.fertig',
            labelKunde: 'Gutachten erwartet',
            labelInternal: 'Gutachten final + OCR',
            estimatedHorizon: 'in 5–10 Tagen',
            isRange: true,
          },
        ]
      case 'gutachten':
      case 'kanzlei_uebergabe':
        return [
          {
            event_typ: 'repair.geplant',
            labelKunde: 'Reparatur wird beauftragt',
            labelInternal: 'KB plant Reparatur',
            estimatedHorizon: 'in 2–5 Tagen',
            isRange: true,
          },
        ]
      default:
        return []
    }
  }

  // ── Regulierung ── VS-Kontakt: Forderung raus, Reparatur ggf. noch offen.
  if (mainPhase === 'regulierung') {
    if (subPhase === 'versicherungskontakt') {
      const events: ProjectedEvent[] = []
      if (reparaturEndeIso) {
        events.push({
          event_typ: 'repair.abgeschlossen',
          labelKunde: 'Reparatur erwartet abgeschlossen',
          labelInternal: 'Werkstatt schließt Reparatur ab',
          estimatedHorizon: `bis ${formatDeShort(reparaturEndeIso)}`,
          isRange: false,
        })
      }
      events.push({
        event_typ: 'payment.erhalten',
        labelKunde: 'Antwort der Versicherung erwartet',
        labelInternal: 'VS reagiert auf Forderung',
        estimatedHorizon: 'in 7–21 Tagen',
        isRange: true,
      })
      return events
    }
    // auszahlung o.ä. → Auszahlung erwartet.
    return [
      {
        event_typ: 'payment.erhalten',
        labelKunde: 'Auszahlung erwartet',
        labelInternal: 'VS-Auszahlung läuft',
        estimatedHorizon: 'in 7–21 Tagen',
        isRange: true,
      },
    ]
  }

  return []
}

function formatDeShort(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}
