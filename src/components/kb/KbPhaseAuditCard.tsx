// AAR-433 (Child 4 von AAR-429): KB Phase-Audit-Card.
// Rendert genau eine Aktion aus `getKbPhaseAudit`. Farbvariante pro Priorität:
//   - kritisch → roter Akzent (SLA-Breach, muss sofort)
//   - hoch     → oranger Akzent (überfällig, Dispatch-Blocker, VS-Antwort)
//   - mittel   → Claimondo-Primary (Phase-stale, heute fällig, Kunde-wartet)
//   - niedrig  → gedämpft (routine-check, alles-ok)
//
// Nutzt die CSS-Variablen aus dem Theme-System (AAR-418 Whitelabeling) —
// keine hardcoded Hex-Farben (außer Fallback-Tokens).

import Link from 'next/link'
import type { KbAktion } from '@/lib/kb/phase-audit'

type Props = { aktion: KbAktion | null }

export default function KbPhaseAuditCard({ aktion }: Props) {
  if (!aktion) return null

  // alles-ok → minimale Info-Card
  if (aktion.state === 'alles-ok') {
    return (
      <div
        className="mb-4 rounded-xl border px-4 py-3"
        style={{
          background: 'var(--brand-surface-muted, #f8f9fb)',
          borderColor: 'var(--brand-border, #e5e7eb)',
          color: 'var(--brand-text-secondary, #6b7280)',
        }}
      >
        <p className="text-sm font-medium">{aktion.titel}</p>
        <p className="text-xs mt-0.5">{aktion.beschreibung}</p>
      </div>
    )
  }

  const accent = (() => {
    if (aktion.prioritaet === 'kritisch') return 'var(--brand-danger, #dc2626)'
    if (aktion.prioritaet === 'hoch') return 'var(--brand-warning, #d97706)'
    if (aktion.prioritaet === 'mittel') return 'var(--brand-primary, #0D1B3E)'
    return 'var(--brand-text-secondary, #6b7280)'
  })()

  const bg = (() => {
    if (aktion.prioritaet === 'kritisch') return 'var(--brand-danger-soft, #fef2f2)'
    if (aktion.prioritaet === 'hoch') return 'var(--brand-warning-soft, #fffbeb)'
    if (aktion.prioritaet === 'mittel') return 'var(--brand-primary-soft, #eff6ff)'
    return 'var(--brand-surface-muted, #f8f9fb)'
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
      aria-label="KB Phase-Audit"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
              style={{
                background: accent,
                color: 'var(--brand-text-on-primary, #ffffff)',
              }}
            >
              {prioritaetLabel(aktion.prioritaet)}
            </span>
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
            >
              {aktion.titel}
            </p>
          </div>
          <p
            className="text-xs mt-1 leading-relaxed"
            style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
          >
            {aktion.beschreibung}
          </p>
          {aktion.warnung && (
            <div
              className="mt-2 rounded-md px-2 py-1 text-[11px] font-medium"
              style={{
                background: 'var(--brand-surface, #ffffff)',
                color: accent,
                border: `1px solid ${accent}`,
              }}
            >
              {aktion.warnung}
            </div>
          )}
          {deadlineText && (
            <p className="text-[11px] mt-2 font-medium" style={{ color: accent }}>
              Frist: {deadlineText}
            </p>
          )}
        </div>
      </div>
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

function prioritaetLabel(p: KbAktion['prioritaet']): string {
  switch (p) {
    case 'kritisch':
      return 'Kritisch'
    case 'hoch':
      return 'Hoch'
    case 'mittel':
      return 'Mittel'
    case 'niedrig':
      return 'Niedrig'
  }
}

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
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
