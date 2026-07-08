// src/lib/vertrieb/derive-vertrieb-state.ts
// Vertrieb-CRM P0: reine Ableitung der VertriebStufe je kind (first-match). Kollabiert
// die fragmentierten SV-Onboarding/Verifizierungs-Spalten in EINE Stufe. Konsumiert die
// kanonische vertrieb-workflow-Domain. Vorbild: deriveLeadWorkflowState / deriveClaimWorkflowState.
import type { VertriebKontaktRow, VertriebKontakt } from './vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

function stufeFuer(row: VertriebKontaktRow): VertriebStufe {
  // gesperrt schlägt alles (kind-übergreifend)
  if (row.roh_gesperrt === true) return 'gesperrt'
  switch (row.kind) {
    case 'sv':
      if (
        row.roh_verifiziert === true &&
        row.roh_portal_zugang === true &&
        row.roh_onboarding_offen !== true &&
        row.roh_ist_aktiv === true
      )
        return 'aktiv'
      if (row.roh_ist_aktiv === false) return 'pausiert'
      return 'onboarding'
    case 'makler':
    case 'werkstatt':
      if (row.roh_status === 'aktiv' && row.roh_onboarding_offen !== true) return 'aktiv'
      if (row.roh_onboarding_offen === true) return 'onboarding'
      if (row.roh_status === 'pending' || row.roh_status === 'inaktiv') return 'kontaktiert'
      return 'neu'
    case 'partner-lead':
      if (row.roh_status === 'verloren' || row.roh_status === 'abgelehnt') return 'verloren'
      if (row.roh_status === 'konvertiert' || row.roh_status === 'umgewandelt') return 'aktiv'
      if (row.roh_status && row.roh_status !== 'neu') return 'kontaktiert'
      return 'neu'
    case 'sv-lead':
      if (row.roh_ist_aktiv === false) return 'verloren'
      if (row.roh_warteliste && row.roh_warteliste !== 'neu') return 'kontaktiert'
      return 'neu'
  }
}

export function deriveVertriebState(row: VertriebKontaktRow): VertriebKontakt {
  return { ...row, stufe: stufeFuer(row) }
}
