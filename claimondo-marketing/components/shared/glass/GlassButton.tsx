'use client'

// AAR-glass-s1: Universal-Button mit zwei Varianten.
//   variant="cta"      → Primary: Brand-Gradient-Fill, weißer Text
//   variant="secondary" → Glass-Pill, Navy-Text (oder weiß im B2B-Dark)
//
// Beide Varianten haben identische Höhe (44px), Padding (13/26), Font-Size
// (14px) — Hierarchie nur via Fill + Text-Color. Icons werden in Schriftfarbe
// gerendert (kein Background-Kreis).

import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'cta' | 'secondary'
  children: ReactNode
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  className?: string
}

export function GlassButton({
  variant = 'cta',
  children,
  icon,
  iconPosition = 'right',
  className,
  type = 'button',
  ...rest
}: Props) {
  const base = cn(
    'inline-flex items-center gap-2 leading-none whitespace-nowrap',
    'rounded-[var(--glass-radius-pill)]',
    'px-[26px] py-[13px] min-h-[44px]',
    'text-[14px] font-semibold tracking-[-0.005em]',
    'cursor-pointer transition-transform duration-200 active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-60',
  )

  const variantStyles =
    variant === 'cta'
      ? cn(
          'text-white border border-white/30',
          '[background:var(--cta-gradient)]',
          '[box-shadow:0_12px_32px_color-mix(in_srgb,_transparent_60%,_var(--brand-primary,_var(--claimondo-ondo)))]',
          '[box-shadow:0_12px_32px_color-mix(in_srgb,_transparent_60%,_var(--brand-primary,_var(--claimondo-ondo)))_,_inset_0_1px_0_rgba(255,255,255,.3),_inset_0_-1px_0_rgba(0,0,0,.1)]',
        )
      : cn(
          'text-[var(--brand-primary,var(--claimondo-navy))]',
          'border-[1px] border-white/75',
          '[background:var(--glass-bg)]',
          '[backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)]',
          '[box-shadow:var(--glass-shadow)]',
        )

  return (
    <button
      type={type}
      className={cn(base, variantStyles, className)}
      style={{ fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)' }}
      {...rest}
    >
      {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
    </button>
  )
}
