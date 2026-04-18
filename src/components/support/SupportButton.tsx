'use client'

// AAR-519 (S2): Support-Button + Drawer-Trigger.
// Wird in GutachterShell + AdminNav vor der User-Card eingehaengt.
//
// Variante "dark" (Default) passt zu Navy-Sidebars (Gutachter + Admin).
// Variante "light" fuer helle Sidebars falls spaeter benoetigt.

import { useState } from 'react'
import { MessageSquareIcon } from 'lucide-react'
import { SupportDrawer } from './SupportDrawer'

type Variant = 'dark' | 'light'

export function SupportButton({
  userName,
  variant = 'dark',
}: {
  userName?: string | null
  variant?: Variant
}) {
  const [open, setOpen] = useState(false)

  const className =
    variant === 'dark'
      ? 'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors'
      : 'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[#4573A2] hover:text-[#0D1B3E] hover:bg-gray-50 transition-colors'

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
      <SupportDrawer open={open} onClose={() => setOpen(false)} userName={userName} />
    </>
  )
}
