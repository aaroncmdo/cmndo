'use client'

import { Badge } from '@/components/primitives/Badge/Badge.web'
import { Text } from '@/components/primitives/Text/Text.web'
import type { LeadPin } from '@/lib/live-ops'

// Status → Badge-Tone
function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  switch (status) {
    case 'aktiv':
    case 'in_bearbeitung':
      return 'info'
    case 'offen':
    case 'neu':
      return 'warning'
    default:
      return 'neutral'
  }
}

// Status → Deutsches Label
function statusLabel(status: string): string {
  switch (status) {
    case 'neu':
      return 'Neu'
    case 'offen':
      return 'Offen'
    case 'aktiv':
      return 'Aktiv'
    case 'in_bearbeitung':
      return 'In Bearbeitung'
    case 'abgeschlossen':
      return 'Abgeschlossen'
    default:
      return status
  }
}

// Kanal → lesbares Label
function kanalLabel(kanal: string | null): string | null {
  if (!kanal) return null
  switch (kanal) {
    case 'self_service':
      return 'Self-Service'
    case 'mini_wizard':
      return 'Mini-Wizard'
    case 'finder':
      return 'Gutachter-Finder'
    case 'autounfall_io':
      return 'autounfall.io'
    case 'makler-anfrage':
      return 'Makler-Anfrage'
    case 'manuell':
      return 'Manuell'
    default:
      return kanal
  }
}

export interface LeadPopupProps {
  lead: LeadPin
  role: string
  onAssign?: (leadId: string) => void
}

export default function LeadPopup({ lead, role, onAssign }: LeadPopupProps) {
  const kannLeadOeffnen = role === 'admin' || role === 'dispatch'
  const kanal = kanalLabel(lead.kanal)

  return (
    <div
      style={{
        minWidth: 200,
        maxWidth: 260,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Name */}
      <Text variant="headingSm" color="navy" as="span">
        {lead.name}
      </Text>

      {/* Status-Badge */}
      <Badge tone={statusTone(lead.status)} size="sm">
        {statusLabel(lead.status)}
      </Badge>

      {/* Ort */}
      {lead.ort && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" color="lightBlue" as="span">
            Ort:
          </Text>
          <Text variant="caption" color="navy" as="span">
            {lead.ort}
          </Text>
        </div>
      )}

      {/* Kanal */}
      {kanal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" color="lightBlue" as="span">
            Kanal:
          </Text>
          <Text variant="caption" color="navy" as="span">
            {kanal}
          </Text>
        </div>
      )}

      {/* Lead öffnen */}
      {kannLeadOeffnen && (
        <div style={{ marginTop: 2 }}>
          <a
            href={`/dispatch/leads/${lead.id}`}
            style={{
              fontSize: 11,
              color: 'var(--brand-secondary, #4573A2)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            Lead öffnen →
          </a>
        </div>
      )}

      {/* SV zuweisen */}
      {kannLeadOeffnen && onAssign && !lead.hasActiveTermin && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => onAssign(lead.id)}
            style={{
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              color: '#ffffff', background: 'var(--brand-primary, #0D1B3E)',
              border: 'none', borderRadius: 8, padding: '4px 10px',
            }}
          >
            SV zuweisen
          </button>
        </div>
      )}
    </div>
  )
}
