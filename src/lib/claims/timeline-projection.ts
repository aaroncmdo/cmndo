// AAR-843: Future-Projection — was kommt als nächstes basierend auf claim.phase
//
// Pure Function. Kein DB-Zugriff. Wird vom Server als Teil der Timeline-Page
// gerendert. Bei Endzustand-Phasen (9_*) leeres Array.

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

const ENDZUSTAENDE = new Set(['9_reguliert', '9_abgelehnt', '9_an_externe_kanzlei', '9_storniert'])

export function projectNextEvents(input: {
  phase: string | null
  /** Optional: erwartetes Reparatur-Ende aus repairs.geplanter_ende für Phase 5 */
  reparaturEndeIso?: string | null
}): ProjectedEvent[] {
  const { phase, reparaturEndeIso } = input

  if (!phase || ENDZUSTAENDE.has(phase)) return []

  switch (phase) {
    case '0_lead':
    case '1_neu':
      return [
        {
          event_typ: 'claim.kb_zugewiesen',
          labelKunde: 'Kundenbetreuer wird zugewiesen',
          labelInternal: 'KB-Pool weist Claim zu',
          estimatedHorizon: 'innerhalb 1 Werktag',
          isRange: true,
        },
      ]
    case '2_in_bearbeitung':
      return [
        {
          event_typ: 'gutachten.beauftragt',
          labelKunde: 'Gutachter wird beauftragt',
          labelInternal: 'KB beauftragt SV',
          estimatedHorizon: 'in 1–3 Tagen',
          isRange: true,
        },
      ]
    case '3_gutachter_unterwegs':
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
    case '4_gutachten_fertig':
      return [
        {
          event_typ: 'repair.geplant',
          labelKunde: 'Reparatur wird beauftragt',
          labelInternal: 'KB plant Reparatur',
          estimatedHorizon: 'in 2–5 Tagen',
          isRange: true,
        },
      ]
    case '5_in_reparatur': {
      const events: ProjectedEvent[] = []
      if (reparaturEndeIso) {
        events.push({
          event_typ: 'repair.abgeschlossen',
          labelKunde: 'Reparatur erwartet abgeschlossen',
          labelInternal: 'Werkstatt schließt Reparatur ab',
          estimatedHorizon: `bis ${formatDeShort(reparaturEndeIso)}`,
          isRange: false,
        })
      } else {
        events.push({
          event_typ: 'repair.abgeschlossen',
          labelKunde: 'Reparatur abgeschlossen',
          labelInternal: 'Werkstatt schließt Reparatur ab',
          estimatedHorizon: 'in 5–14 Tagen',
          isRange: true,
        })
      }
      events.push({
        event_typ: 'vs.brief_versendet',
        labelKunde: 'Forderung an Versicherung',
        labelInternal: 'KB sendet Schadenforderung',
        estimatedHorizon: 'kurz nach Reparatur',
        isRange: true,
      })
      return events
    }
    case '6_kommunikation_versicherung':
      return [
        {
          event_typ: 'payment.erhalten',
          labelKunde: 'Antwort der Versicherung erwartet',
          labelInternal: 'VS reagiert auf Forderung',
          estimatedHorizon: 'in 7–21 Tagen',
          isRange: true,
        },
      ]
    default:
      return []
  }
}

function formatDeShort(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}
