import { tierColors } from '@/lib/design-tokens'
import { tierLabel, type Tier } from '@/lib/community/rang'

// Partner-Tier-Pille (Bronze/Silber/Gold) fuer die Community — kompakt, inline neben
// dem Autor-Namen (analog zum Redaktion-Badge in PostCard). Spiegelt die src-PartnerRangBadge
// (pillOnly) visuell; eigenstaendig, weil Marketing ein separater Build ist (KEIN src-Import).
// Tier-Farben tragen Bedeutung (Rang) und werden NICHT gebrandet (AGENTS.md §branding-rules).
export function PartnerRangPille({ tier }: { tier: Tier }) {
  const c = tierColors[tier]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 9999,
        backgroundColor: c.soft,
        color: c.text,
        border: `1px solid color-mix(in srgb, ${c.accent} 32%, transparent)`,
        paddingLeft: 7,
        paddingRight: 8,
        height: 18,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width={11}
        height={11}
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.accent}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="6" />
        <path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11" />
      </svg>
      {tierLabel(tier)}
    </span>
  )
}
