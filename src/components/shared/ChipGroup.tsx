'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// AAR-463 F5: Pill-Selector. Single-Select (Radio-Semantik) by default,
// `multi` → Checkbox-Semantik.
export type ChipOption = {
  value: string
  label: string
  icon?: ReactNode
}

type SingleProps = {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  multi?: false
  className?: string
  ariaLabel?: string
}

type MultiProps = {
  options: ChipOption[]
  value: string[]
  onChange: (value: string[]) => void
  multi: true
  className?: string
  ariaLabel?: string
}

type Props = SingleProps | MultiProps

export function ChipGroup(props: Props) {
  const { options, className, ariaLabel } = props
  const selected = props.multi ? props.value : [props.value]

  function toggle(v: string) {
    if (props.multi) {
      const next = selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v]
      props.onChange(next)
    } else {
      props.onChange(v)
    }
  }

  return (
    <div
      role={props.multi ? 'group' : 'radiogroup'}
      aria-label={ariaLabel}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value)
        const role = props.multi ? 'checkbox' : 'radio'
        return (
          <button
            key={opt.value}
            type="button"
            role={role}
            aria-checked={isSelected}
            onClick={() => toggle(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors',
              isSelected
                ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                : 'border-claimondo-border bg-claimondo-card text-claimondo-navy hover:border-claimondo-ondo',
            )}
          >
            {opt.icon && <span aria-hidden="true">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
