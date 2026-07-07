// Dispatch-Leads-Workflow-Rebuild (2026-07-07): Praesentations-Meta zum
// abgeleiteten Workflow-Zustand — die Next-Best-Action-Copy (Hero) + die grobe
// Pipeline-Schiene. Reine Label-Maps (KEINE Farben -> status-registry-ratchet-safe;
// Farben leben in der Registry-Domain lead-workflow). UI-Strings mit echten Umlauten.
import type { LeadWorkflowState } from './deriveLeadWorkflowState'

export type LeadWorkflowMeta = {
  /** Titel der Next-Best-Action (Hero-Ueberschrift). */
  heroTitle: string
  /** Erklaerung was + warum jetzt zu tun ist. */
  heroDescription: string
  /** Primaerer CTA-Text; LEER bei read-only-Zustaenden (terminal). */
  ctaLabel: string
}

export const LEAD_WORKFLOW_META: Record<LeadWorkflowState, LeadWorkflowMeta> = {
  neu: {
    heroTitle: 'Kunde anrufen & qualifizieren',
    heroDescription:
      'Noch kein Kontakt. Ruf den Kunden an und nimm die Erstqualifizierung auf.',
    ctaLabel: 'Kunde anrufen',
  },
  qualifizieren: {
    heroTitle: 'Qualifizierung abschließen',
    heroDescription:
      'Erfasse die restlichen Pflichtangaben (Schuldfrage, Schaden, Fahrzeug), bis der Lead SV-reif ist.',
    ctaLabel: 'Weiter qualifizieren',
  },
  sv_zuweisen: {
    heroTitle: 'Sachverständigen zuweisen',
    heroDescription:
      'Alle Angaben stehen — jetzt einen passenden SV mit Termin reservieren.',
    ctaLabel: 'SV zuweisen',
  },
  flowlink_senden: {
    heroTitle: 'FlowLink senden',
    heroDescription:
      'Der Lead ist vollständig qualifiziert. Sende dem Kunden den FlowLink zur Schadensanzeige.',
    ctaLabel: 'FlowLink senden',
  },
  nachfassen: {
    heroTitle: 'Nachfassen',
    heroDescription:
      'Der FlowLink wurde gesendet, aber noch nicht geöffnet. Erneut senden oder anrufen.',
    ctaLabel: 'Erneut senden',
  },
  warten: {
    heroTitle: 'Auf Kunde warten',
    heroDescription:
      'Der Kunde hat den FlowLink geöffnet und füllt ihn aus. Nur bei Bedarf leicht erinnern.',
    ctaLabel: 'Kunde erinnern',
  },
  rueckruf: {
    heroTitle: 'Rückruf',
    heroDescription:
      'Der Kunde wurde nicht erreicht oder ein Rückruf ist geplant. Zum vereinbarten Zeitpunkt anrufen.',
    ctaLabel: 'Jetzt anrufen',
  },
  terminal: {
    heroTitle: 'Abgeschlossen',
    heroDescription:
      'Dieser Lead ist konvertiert, disqualifiziert oder kalt. Keine Aktion nötig.',
    ctaLabel: '',
  },
}

/**
 * Grobe Pipeline-Meilensteine (die Schiene). Der Badge zeigt den EXAKTEN Zustand;
 * die Schiene zeigt nur, wie weit der Lead im Haupt-Funnel ist.
 */
export const LEAD_WORKFLOW_SPINE = [
  { key: 'kontakt', label: 'Kontakt' },
  { key: 'qualifizieren', label: 'Qualifizieren' },
  { key: 'sv', label: 'SV-Termin' },
  { key: 'flowlink', label: 'FlowLink' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
] as const

// Zustand -> Meilenstein-Index. Off-Spine-Zustaende mappen auf ihre naechste
// Funnel-Stufe (rueckruf=Kontakt-Phase, nachfassen/warten=FlowLink-Phase).
const SPINE_INDEX: Record<LeadWorkflowState, number> = {
  neu: 0,
  rueckruf: 0,
  qualifizieren: 1,
  sv_zuweisen: 2,
  flowlink_senden: 3,
  nachfassen: 3,
  warten: 3,
  terminal: 4,
}

/** Meilenstein-Index (0..4) fuer einen Workflow-Zustand — fuer die Pipeline-Schiene. */
export function spineIndexForState(state: LeadWorkflowState): number {
  return SPINE_INDEX[state]
}
