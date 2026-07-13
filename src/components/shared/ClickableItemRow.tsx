'use client'
import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'

// Projekt A / Slice A1: macht eine ganze Karte/Zeile klickbar -> navigiert zum Detail,
// ohne die Klicks der inneren Controls (Status-Select, Drag-Handle, Action-Buttons) zu
// stehlen. UpdateItem ist bereits ein voll klickbarer <button>; dieses Wrapper ist fuer
// die Task-/Listen-Oberflaechen mit inline-Controls, wo ein nackter <Link>/<button> nicht geht.

const INTERACTIVE_SELECTOR =
  'button, a, select, input, textarea, label, [role="button"], [data-no-nav]'

/** Pure: kam dieser Klick von einem interaktiven Control? Dann darf die Zeile NICHT navigieren. */
export function isInteractiveTarget(el: EventTarget | null): boolean {
  const node = el as { closest?: (s: string) => unknown } | null
  return !!(node && typeof node.closest === 'function' && node.closest(INTERACTIVE_SELECTOR))
}

export function ClickableItemRow({
  href,
  children,
  className,
  ariaLabel,
}: {
  href: string
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  const router = useRouter()
  const go = () => router.push(href)
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target)) return
    go()
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      go()
    }
  }
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
