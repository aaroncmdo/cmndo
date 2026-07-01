import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Titel-Panel mit Header-Leiste (Titel + Count + optionaler Aktion-Link) und
 * randlosem, divider-getrenntem Body — das Listen-Pendant zur SectionCard
 * (die p-5 um Content legt). Fuer Dashboard-/Listen-Panels quer durch die Portale.
 */
export function Panel({
  title,
  count,
  actionLabel = 'Alle',
  actionHref,
  icon,
  children,
  className,
  bodyClassName,
}: {
  title: string
  count?: number
  actionLabel?: string
  actionHref?: string
  icon?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-ios-md border border-claimondo-border bg-white', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-claimondo-border px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-heading-sm text-claimondo-navy">
          {icon}
          <span className="truncate">{title}</span>
          {count != null ? <span className="text-body-sm font-normal text-claimondo-ondo">{count}</span> : null}
        </h2>
        {actionHref ? (
          <Link
            href={actionHref}
            className="shrink-0 text-body-xs font-medium text-claimondo-ondo transition-colors hover:text-claimondo-navy"
          >
            {actionLabel}
          </Link>
        ) : null}
      </header>
      <div className={cn('divide-y divide-claimondo-border', bodyClassName)}>{children}</div>
    </section>
  )
}
