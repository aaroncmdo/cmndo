'use client'

// AAR-519 (S2): Support-Button + Drawer-Trigger.
// Wird in GutachterShell + AdminNav vor der User-Card eingehängt.
//
// Variante "dark" (Default) passt zu Navy-Sidebars (Gutachter + Admin).
// Variante "light" für helle Sidebars falls später benötigt.

import { useState } from 'react'
import { MessageSquareIcon } from 'lucide-react'
import { SupportDrawer } from './SupportDrawer'

type Variant = 'dark' | 'light'

export function SupportButton({
  userName,
  rolle,
  variant = 'dark',
}: {
  userName?: string | null
  rolle?: string | null
  variant?: Variant
}) {
  const [open, setOpen] = useState(false)

  const className =
    variant === 'dark'
      ? 'w-full flex items-center gap-3 px-3 py-2 rounded-ios-xl text-xs font-medium bg-white text-claimondo-navy hover:bg-claimondo-bg transition-colors'
      : 'w-full flex items-center gap-3 px-3 py-2 rounded-ios-xl text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg transition-colors'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label="Hilfe und Support öffnen"
      >
        <MessageSquareIcon className="w-4 h-4" />
        Hilfe &amp; Support
      </button>
      <SupportDrawer open={open} onClose={() => setOpen(false)} userName={userName} rolle={rolle} />
    </>
  )
}
