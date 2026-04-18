import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// AAR-463 F5: Claimondo-CTA-Button für Landing-/Marketing-Flächen.
// Drei Varianten — primary (Navy), secondary (Outline-Navy), tertiary (Link).
type Variant = 'primary' | 'secondary' | 'tertiary'

type Props = {
  href: string
  children: ReactNode
  variant: Variant
  className?: string
  /** Rel für externe Links (z.B. 'noopener noreferrer'). */
  rel?: string
  /** Target für externe Links. */
  target?: '_blank' | '_self'
  ariaLabel?: string
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-claimondo-navy text-white shadow-[var(--shadow-claimondo-md)] hover:bg-claimondo-ondo',
  secondary:
    'bg-claimondo-card text-claimondo-navy border-2 border-claimondo-navy hover:bg-claimondo-bg',
  tertiary:
    'bg-transparent text-claimondo-navy underline-offset-4 hover:underline',
}

export function LandingCta({
  href,
  children,
  variant,
  className,
  rel,
  target,
  ariaLabel,
}: Props) {
  return (
    <Link
      href={href}
      rel={rel}
      target={target}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-colors',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </Link>
  )
}
