// AAR-432 (Child 3 von AAR-429): „Jetzt zu tun"-Card für das Kunden-Portal.
// Rendert genau eine Aktion aus `getKundenJetztZuTun`. Drei Varianten:
//   - default → Claimondo-Primary Akzent mit CTA-Button
//   - live    → grüner/amberner Puls-Effekt (Termin läuft gerade)
//   - info    → gedämpft grau, kein CTA
//
// Nutzt die CSS-Variablen aus dem Theme-System (AAR-418 Whitelabeling) —
// keine hardcoded Hex-Farben.

import Link from 'next/link'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'

type Props = { aktion: KundeAktion | null }

export default function KundeJetztZuTunCard({ aktion }: Props) {
  if (!aktion) return null
  // kein-aktionsbedarf → minimale Info-Card
  if (aktion.state === 'kein-aktionsbedarf') {
    return (
      <div
        className="mb-4 rounded-xl border px-4 py-3"
        style={{
          background: 'var(--brand-surface-muted, #f8f9fb)',
          borderColor: 'var(--brand-border, #e5e7eb)',
          color: 'var(--brand-text-secondary, #6b7280)',
        }}
      >
        <p className="text-sm">{aktion.titel}</p>
        <p className="text-xs mt-0.5">{aktion.beschreibung}</p>
      </div>
    )
  }

  const isLive = aktion.variant === 'live'
  const isInfo = aktion.variant === 'info'

  // Severity-Akzent: über CSS-Vars mit Fallback-Farben des Claimondo-Schemas.
  // Critical = Rot, Warning = Amber, Success = Grün (live), Neutral = Primary.
  const accent = (() => {
    if (isLive && aktion.severity === 'success') return 'var(--brand-success, #16a34a)'
    if (isLive) return 'var(--brand-accent, #4573A2)'
    if (aktion.severity === 'critical') return 'var(--brand-danger, #dc2626)'
    if (aktion.severity === 'warning') return 'var(--brand-warning, #d97706)'
    return 'var(--brand-primary, #0D1B3E)'
  })()

  const bg = (() => {
    if (isInfo) return 'var(--brand-surface-muted, #f8f9fb)'
    if (isLive && aktion.severity === 'success') return 'var(--brand-success-soft, #ecfdf5)'
    if (isLive) return 'var(--brand-primary-soft, #eff6ff)'
    if (aktion.severity === 'critical') return 'var(--brand-danger-soft, #fef2f2)'
    if (aktion.severity === 'warning') return 'var(--brand-warning-soft, #fffbeb)'
    return 'var(--brand-primary-soft, #eff6ff)'
  })()

  const deadlineText = aktion.deadline_am ? formatDeadline(aktion.deadline_am) : null

  return (
    <div
      className="mb-4 relative rounded-xl border-l-4 border px-4 py-4 shadow-sm"
      style={{
        background: bg,
        borderLeftColor: accent,
        borderColor: 'var(--brand-border, #e5e7eb)',
      }}
      role="region"
      aria-label="Jetzt zu tun"
    >
      {isLive && (
        <span
          aria-hidden
          className="absolute top-3 right-3 inline-flex h-3 w-3"
        >
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ background: accent }}
          />
          <span
            className="relative inline-flex h-3 w-3 rounded-full"
            style={{ background: accent }}
          />
        </span>
      )}
      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
      >
        {aktion.titel}
      </p>
      <p
        className="text-xs mt-1 leading-relaxed"
        style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
      >
        {aktion.beschreibung}
      </p>
      {deadlineText && (
        <p
          className="text-[11px] mt-2 font-medium"
          style={{ color: accent }}
        >
          Frist: {deadlineText}
        </p>
      )}
      {aktion.cta?.href && (
        <Link
          href={aktion.cta.href}
          className="inline-flex items-center gap-1 mt-3 text-sm font-medium rounded-md px-3 py-1.5 transition-colors"
          style={{
            background: accent,
            color: 'var(--brand-text-on-primary, #ffffff)',
          }}
        >
          {aktion.cta.label}
          <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
