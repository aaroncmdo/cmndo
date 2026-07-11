'use client'

// Mobile-only Dot am Menü-Tab der geteilten MobileNav: rot, wenn offene
// Action-Updates oder neue Info existieren. Self-contained (useUpdates), damit
// die generische MobileNav domain-agnostisch bleibt.
import { useUpdates } from './useUpdates'

export function MobileUpdatesDot() {
  const { actionCount, newInfoCount } = useUpdates()
  if (actionCount <= 0 && newInfoCount <= 0) return null
  return (
    <span
      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-danger"
      aria-hidden
    />
  )
}
