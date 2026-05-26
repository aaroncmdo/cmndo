import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ReactNode } from 'react'

// Doc 40 §2.3 / Doc 41 §1: Card-as-Link-Helper.
// Drei Varianten decken die im Codebase verwendeten Card-Stile ab:
//  - 'default': weisse Card mit border-claimondo-border (Sections-Standard)
//  - 'glass':   white/70 + backdrop-blur (Hub-Spezialfaelle, /kfz-gutachter)
//  - 'compact': claimondo-bg + kleinerer Padding (Spoke-Listings, Bezirks-Cards)

type Variant = 'default' | 'glass' | 'compact'

const BASE_CLS =
  'group block h-full rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo'

const GLASS_CLS =
  'group block h-full rounded-ios-md border border-white/60 bg-white/70 p-6 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_8px_24px_rgba(13,27,62,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo'

const COMPACT_CLS =
  'group block rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4 transition-all hover:border-claimondo-ondo hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo'

type CardLinkProps = {
  href: string
  title: string
  body?: string
  /** CTA-Text rechts unten, default „Mehr erfahren". Wird ins aria-label gemergt. */
  ctaLabel?: string
  variant?: Variant
  /**
   * Optionaler aria-label-Override. Standardmaessig KEIN aria-label —
   * der Accessible-Name wird aus dem sichtbaren Inhalt (Titel + Body + CTA)
   * berechnet, damit er den sichtbaren Text enthaelt (WCAG 2.5.3 Label-in-Name,
   * axe label-content-name-mismatch). Ein knapper Override darf NICHT verwendet
   * werden, wenn er den sichtbaren Text nicht als Teilmenge enthaelt.
   */
  ariaLabel?: string
  /** Inhalt zwischen body und CTA — z. B. Meta-Zeile mit Versicherer-Namen. */
  children?: ReactNode
  /** Tracking-Attribut fuer TrackingHooks (data-tracking="card-…"). */
  trackingId?: string
}

export function CardLink({
  href,
  title,
  body,
  ctaLabel = 'Mehr erfahren',
  variant = 'default',
  ariaLabel,
  children,
  trackingId,
}: CardLinkProps) {
  const cls = variant === 'glass' ? GLASS_CLS : variant === 'compact' ? COMPACT_CLS : BASE_CLS
  return (
    <Link
      href={href}
      className={cls}
      aria-label={ariaLabel}
      data-tracking={trackingId}
    >
      <h3 className="text-base font-bold leading-snug text-claimondo-navy sm:text-lg">{title}</h3>
      {body && <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{body}</p>}
      {children}
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo group-hover:text-claimondo-navy">
        {ctaLabel}
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  )
}
