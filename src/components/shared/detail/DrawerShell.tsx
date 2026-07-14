'use client'

// P0 (Detail-View-Konsistenz): Drawer-Huelle fuer Intercepting-Routes.
// Vorher SV-lokal (admin/sachverstaendige/@drawer/DrawerShell.tsx, AAR-691 /
// AAR-803), jetzt geteilt — jede drillbare Liste nutzt dieselbe Huelle.
// Schliesst via ESC / Backdrop / Close-Button ueber router.back().
//
// Rezept fuer neue Detail-Views: docs/superpowers/detail-view-recipe.md

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'
import { Drawer } from '@/components/primitives/Drawer'

type Props = {
  children: ReactNode
  title?: string
  /** Breite in px ab md+. Default 720. */
  width?: number
}

export default function DrawerShell({ children, title, width = 720 }: Props) {
  const router = useRouter()

  const close = () => router.back()

  // Scroll-Lock auf Body waehrend Drawer offen
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <Drawer
      open
      onClose={close}
      width={width}
      noPadding
      hideCloseButton
      ariaLabel={title ?? 'Details'}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border shrink-0">
          <h2 className="text-sm font-semibold text-claimondo-navy truncate">
            {title ?? 'Details'}
          </h2>
          <button
            type="button"
            onClick={close}
            className="p-1 rounded-ios-lg hover:bg-claimondo-bg text-claimondo-ondo/70"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </Drawer>
  )
}
