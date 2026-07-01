import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatBarItem = {
  label: string
  value: number | string
  icon?: LucideIcon
  href?: string
  /** Toent die Zahl wenn die Metrik "heiss" ist (z.B. ueberfaellige Rueckrufe). */
  tone?: 'default' | 'warning' | 'danger' | 'success'
}

const TONE_TEXT: Record<NonNullable<StatBarItem['tone']>, string> = {
  default: 'text-claimondo-navy',
  warning: 'text-warning-strong',
  danger: 'text-danger-strong',
  success: 'text-success-strong',
}

/**
 * Verbundene Metrik-Leiste — ersetzt N gleich-grosse StatCards durch eine
 * zusammenhaengende Leiste (kein "identical card grid"). Responsiv: 3-Spalten-
 * Grid mobil, Flex-Reihe ab sm. 1px-Divider via gap-px auf dunklem Grund.
 */
export function StatBar({ items, className }: { items: StatBarItem[]; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-ios-md border border-claimondo-border bg-claimondo-border', className)}>
      <div className="grid grid-cols-3 gap-px sm:flex">
        {items.map((it) => {
          const Icon = it.icon
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-caption uppercase text-claimondo-ondo">
                {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{it.label}</span>
              </span>
              <span
                className={cn(
                  'mt-1 block text-heading-md font-bold leading-none tabular-nums',
                  TONE_TEXT[it.tone ?? 'default'],
                )}
              >
                {it.value}
              </span>
            </>
          )
          const cls = cn('block bg-white px-3 py-2.5 sm:flex-1', it.href && 'transition-colors hover:bg-claimondo-bg')
          return it.href ? (
            <Link key={it.label} href={it.href} className={cls}>
              {body}
            </Link>
          ) : (
            <div key={it.label} className={cls}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}
