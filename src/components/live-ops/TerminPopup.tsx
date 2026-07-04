'use client'

import { Badge } from '@/components/primitives/Badge/Badge.web'
import { Text } from '@/components/primitives/Text/Text.web'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import type { TerminPin } from '@/lib/live-ops'

// Status → Badge-Tone
function statusTone(
  status: string,
): 'success' | 'warning' | 'info' | 'neutral' {
  switch (status) {
    case 'bestaetigt':
      return 'success'
    case 'reserviert':
      return 'warning'
    case 'unterwegs':
    case 'losgefahren':
      return 'info'
    default:
      return 'neutral'
  }
}

// Status → Deutschen Label
function statusLabel(status: string): string {
  switch (status) {
    case 'bestaetigt':
      return 'Bestätigt'
    case 'reserviert':
      return 'Reserviert'
    case 'unterwegs':
      return 'Unterwegs'
    case 'losgefahren':
      return 'Losgefahren'
    case 'abgeschlossen':
      return 'Abgeschlossen'
    case 'storniert':
      return 'Storniert'
    default:
      return status
  }
}

export interface TerminPopupProps {
  termin: TerminPin
  role: string
}

export default function TerminPopup({ termin, role }: TerminPopupProps) {
  const zeitFormatiert = formatBerlin(termin.startZeit, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const kannFallOeffnen =
    role === 'admin' || role === 'dispatch' || role === 'kundenbetreuer'

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
      {/* Kundenname */}
      <Text variant="headingSm" color="navy" as="span">
        {termin.kundeName}
      </Text>

      {/* Status-Badge */}
      <Badge tone={statusTone(termin.status)} size="sm">
        {statusLabel(termin.status)}
      </Badge>

      {/* Zeit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text variant="caption" color="lightBlue" as="span">
          Termin:
        </Text>
        <Text variant="caption" color="navy" as="span">
          {zeitFormatiert}
        </Text>
      </div>

      {/* SV-Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text variant="caption" color="lightBlue" as="span">
          Gutachter:
        </Text>
        <Text variant="caption" color="navy" as="span">
          {termin.svName}
        </Text>
      </div>

      {/* Fall-Nummer */}
      {termin.claimNummer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text variant="caption" color="lightBlue" as="span">
            Fall-Nr.:
          </Text>
          <Text variant="caption" color="navy" as="span">
            {termin.claimNummer}
          </Text>
        </div>
      )}

      {/* Fall öffnen — nur für admin/dispatch/kb */}
      {kannFallOeffnen && termin.claimNummer && (
        <div style={{ marginTop: 2 }}>
          <a
            href={`/faelle/${termin.claimNummer}`}
            style={{
              fontSize: 11,
              color: 'var(--brand-secondary, #4573A2)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            Fall öffnen →
          </a>
        </div>
      )}
    </div>
  )
}
