'use client'

// AAR-frontend-konsolidierung-p2 (P2-T7): Claimondo-getoktes Tabellen-Set —
// ersetzt das tote, shadcn-getokte ui/table und die ~44 inline-gestylten
// <table>/<thead>/<tr>/<th>/<td> in Listen/Dashboards. Jede Sub-Component trägt
// die Default-Konvention; `className` wird via cn()/tailwind-merge gemergt —
// d.h. eine `className`-Klasse die mit einem Default kollidiert (z. B. eigenes
// `bg-transparent` gegen das `bg-claimondo-bg`-Default, `normal-case` gegen
// `uppercase`, `divide-y-0` gegen `divide-y`, `py-2` gegen `py-3`) GEWINNT
// automatisch — KEIN `!`-Prefix nötig. (Falls man echtes `!important` braucht:
// Tailwind v4 nutzt den Suffix `class!`, nicht den Prefix `!class`.) Token-
// gebunden (claimondo-* → var(--brand-*)). Mobile-Karten-Fallbacks bleiben
// Caller-Sache (die Regel betrifft die Tabelle, nicht das responsive Layout).

import { cn } from '@/lib/utils'
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
  ReactNode,
} from 'react'

/**
 * Card-Rahmen + Horizontal-Scroll-Container. Optional — Caller kann auch selbst
 * wrappen. `variant='card'` = weiße Card mit Border + overflow-hidden (Default);
 * `variant='plain'` = nur overflow-x-auto, kein Rahmen (für Caller die einen
 * eigenen/abweichenden Wrapper haben, z. B. mit shadow-ios-md oder rounded-ios-lg
 * — den per `className` mitgeben).
 */
export function DataTableContainer({
  children,
  variant = 'card',
  className,
}: {
  children: ReactNode
  variant?: 'card' | 'plain'
  className?: string
}) {
  return (
    <div
      className={cn(
        variant === 'card' && 'rounded-ios-md border border-claimondo-border bg-white overflow-hidden',
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full text-sm', className)} {...props} />
}

export function Thead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-claimondo-bg text-left text-xs uppercase tracking-wider text-claimondo-ondo', className)}
      {...props}
    />
  )
}

export function Tbody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-claimondo-border', className)} {...props} />
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn(className)} {...props} />
}

/** Klickbare Zeile (Row-Link-Pattern) — Hover-Tint + Pointer; `onClick` durchreichen. */
export function ClickableTr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('cursor-pointer transition-colors hover:bg-claimondo-bg', className)} {...props} />
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-4 py-3 font-medium', className)} {...props} />
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 text-claimondo-navy', className)} {...props} />
}
