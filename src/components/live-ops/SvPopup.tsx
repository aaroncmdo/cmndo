'use client'

import { Badge } from '@/components/primitives/Badge/Badge.web'
import { Text } from '@/components/primitives/Text/Text.web'
import type { SvLiveOps } from '@/lib/live-ops'

// Typ-Farben fuer Badge-Tone
function typTone(
  typ: string,
): 'info' | 'success' | 'warning' | 'neutral' | 'navy' {
  switch (typ) {
    case 'kfz':
      return 'info'
    case 'dat':
      return 'warning'
    case 'akademie':
      return 'success'
    case 'buero':
      return 'navy'
    default:
      return 'neutral'
  }
}

// Typ-Label auf Deutsch
function typLabel(typ: string): string {
  switch (typ) {
    case 'kfz':
      return 'KFZ'
    case 'dat':
      return 'DAT'
    case 'akademie':
      return 'Akademie'
    case 'buero':
      return 'Büro'
    default:
      return typ
  }
}

export interface SvPopupProps {
  sv: SvLiveOps
  role: string
  /**
   * Basis-Pfad fuer den "SV oeffnen"-Link (z.B. "/admin/vertrieb/sachverstaendige", damit der
   * Klick im Vertrieb-Cockpit die @drawer-Intercepting-Route trifft statt full-page zu navigieren).
   * Ohne Angabe -> unveraendertes admin/dispatch-Verhalten (die 3 Karten-Portale bleiben heil).
   */
  svHrefBase?: string
}

export default function SvPopup({ sv, role, svHrefBase }: SvPopupProps) {
  const unterwegs =
    sv.car.mode !== 'none' &&
    sv.car.lat != null &&
    sv.car.lng != null

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
      {/* Name + Typ-Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Text variant="headingSm" color="navy" as="span">
          {sv.name}
        </Text>
        {sv.verifiziert && (
          <span
            title="Verifiziert"
            style={{ color: '#22c55e', fontSize: 14, lineHeight: 1 }}
            aria-label="Verifiziert"
          >
            ✓
          </span>
        )}
      </div>

      {/* Typ + Paket */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Badge tone={typTone(sv.typ)} size="sm">
          {typLabel(sv.typ)}
        </Badge>
        <Badge tone="neutral" size="sm">
          {sv.paket}
        </Badge>
      </div>

      {/* Auslastung */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text variant="caption" color="lightBlue" as="span">
          Auslastung:
        </Text>
        <Text variant="caption" color="navy" as="span">
          {sv.genutzt}/{sv.gesamt}
        </Text>
      </div>

      {/* Status-Hinweise */}
      {sv.gesperrt && (
        <Badge tone="danger" size="sm">
          Gesperrt
        </Badge>
      )}
      {sv.urlaub && !sv.gesperrt && (
        <Badge tone="warning" size="sm">
          Urlaub
        </Badge>
      )}

      {/* Unterwegs-Info */}
      {unterwegs && (
        <div
          style={{
            borderTop: '1px solid rgba(13,27,62,0.10)',
            paddingTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Badge
              tone={sv.car.mode === 'unterwegs_derived' ? 'warning' : 'info'}
              size="sm"
            >
              {sv.car.mode === 'unterwegs_derived'
                ? 'Unterwegs (geschätzt)'
                : 'Unterwegs'}
            </Badge>
          </div>
          {sv.car.etaMinuten != null && (
            <Text variant="caption" color="lightBlue" as="span">
              ETA: {sv.car.etaMinuten} Min.
            </Text>
          )}
        </div>
      )}

      {/* Links — nur fuer admin/dispatch sichtbar */}
      {(role === 'admin' || role === 'dispatch') && (
        <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            href={
              svHrefBase
                ? `${svHrefBase}/${sv.id}`
                : role === 'dispatch'
                  ? `/dispatch/sachverstaendige/${sv.id}`
                  : `/admin/vertrieb/sachverstaendige/${sv.id}`
            }
            style={{
              fontSize: 11,
              color: 'var(--brand-secondary, #4573A2)',
              textDecoration: 'underline',
              fontWeight: 500,
            }}
          >
            SV öffnen →
          </a>
          {role === 'dispatch' && (
            <a
              href={`/dispatch/kalender?sv_id=${sv.id}&mode=create`}
              style={{
                fontSize: 11,
                color: 'var(--brand-secondary, #4573A2)',
                textDecoration: 'underline',
                fontWeight: 500,
              }}
            >
              Termin einplanen →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
