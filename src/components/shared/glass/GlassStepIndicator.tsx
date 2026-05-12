'use client'

// AAR-glass-s1: Wizard-Step-Indicator als Glass-Pill.
// Aktiver Step = Brand-Gradient. Vergangene Steps = Brand-Solid (55%).
// Kommende Steps = Brand-Solid (25%).

import { cn } from '@/lib/utils'
import { GlassPill } from './GlassPill'

interface Props {
  current: number
  total: number
  className?: string
}

export function GlassStepIndicator({ current, total, className }: Props) {
  return (
    <GlassPill className={cn('gap-2', className)}>
      <span
        className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{
          fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
          color: 'var(--brand-secondary, var(--claimondo-ondo))',
        }}
      >
        Schritt {current} / {total}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const idx = i + 1
          const state: 'done' | 'active' | 'todo' =
            idx < current ? 'done' : idx === current ? 'active' : 'todo'
          return (
            <span
              key={idx}
              className={cn(
                'block h-1 w-4 rounded-full',
                state === 'active' && 'shadow-[0_0_6px_color-mix(in_srgb,_transparent_50%,_var(--brand-secondary,_var(--claimondo-ondo)))]',
              )}
              style={{
                background:
                  state === 'active'
                    ? 'linear-gradient(90deg, var(--brand-secondary, var(--claimondo-ondo)), var(--brand-shield, var(--claimondo-light-blue)))'
                    : state === 'done'
                      ? 'color-mix(in srgb, transparent 45%, var(--brand-secondary, var(--claimondo-ondo)))'
                      : 'color-mix(in srgb, transparent 75%, var(--brand-secondary, var(--claimondo-ondo)))',
              }}
            />
          )
        })}
      </span>
    </GlassPill>
  )
}
