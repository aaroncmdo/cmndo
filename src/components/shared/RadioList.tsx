'use client'

import { cn } from '@/lib/utils'

// AAR-463 F5: Vertikale Radio-Cards für Auswahlen mit Beschreibungs-Text
// (z.B. Schuldfrage-Auswahl im Mandantenfragebogen).
export type RadioListOption = {
  value: string
  label: string
  description?: string
}

type Props = {
  options: RadioListOption[]
  value: string
  onChange: (value: string) => void
  name: string
  className?: string
  ariaLabel?: string
}

export function RadioList({
  options,
  value,
  onChange,
  name,
  className,
  ariaLabel,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('space-y-2', className)}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value
        return (
          <label
            key={opt.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
              isSelected
                ? 'border-claimondo-ondo bg-claimondo-ondo/5 ring-2 ring-claimondo-ondo/20'
                : 'border-claimondo-border bg-claimondo-card hover:border-claimondo-ondo/50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={isSelected}
              onChange={() => onChange(opt.value)}
              className="mt-1 h-4 w-4 accent-[var(--claimondo-ondo)]"
            />
            <div className="min-w-0">
              <div className="font-semibold text-claimondo-navy">{opt.label}</div>
              {opt.description && (
                <div className="mt-1 text-sm text-claimondo-ondo">
                  {opt.description}
                </div>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}
