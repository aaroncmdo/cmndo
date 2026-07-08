'use client'

// Geteilter Portal-Rahmen: Desktop Navy-Canvas + schwebende gerundete Content-
// Card + Glass-Pills (via Sidebar-Slot), Mobile-Chrome + optionaler Seiten-
// Drawer. Praesentational; nur der Drawer-Open-State ist Client. Server-Layouts
// reichen server-gerenderte sidebar/children als Props durch (Standard-Pattern).

import { useState } from 'react'
import { MenuIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { portalShellClasses, type PortalShellBreakpoint } from './classes'
import { PortalShellDrawerProvider } from './context'

export type PortalShellProps = {
  /** Sidebar-Element — PortalNav (dark) oder bespoke Aside (kunde). */
  sidebar: React.ReactNode
  /** Seiteninhalt — wird in die schwebende Card gewrappt. */
  children: React.ReactNode
  /** Desktop-Breakpoint, MUSS zum Sidebar-Breakpoint passen. Default 'md'. */
  breakpoint?: PortalShellBreakpoint
  /** Content-Offset (Sidebar-Breite als linkes Gutter), am SELBEN Breakpoint.
   *  Literal (Tailwind-JIT). Default 'md:pl-56'. */
  contentOffsetClass?: string
  /** 'self' = PortalShell fuegt keine Mobile-Chrome hinzu (Portal managed selbst).
   *  'shell-drawer' = Hamburger + Overlay + Slide-in-Panel (admin/dispatch/KB). */
  mobileNav?: 'self' | 'shell-drawer'
  /** Optionaler Mobile-Header-Inhalt (Logo/Badge/Trailing). Bei 'shell-drawer'
   *  setzt PortalShell den Hamburger links davor. */
  mobileHeader?: React.ReactNode
  /** Optionaler fixed Top-Right-Slot (Desktop) — z.B. UpdatesNav-Pill. */
  desktopTopRight?: React.ReactNode
  /** Zusatzklassen fuer die Content-Card (z.B. 'md:pr-36'). */
  contentClassName?: string
}

export function PortalShell({
  sidebar,
  children,
  breakpoint = 'md',
  contentOffsetClass = 'md:pl-56',
  mobileNav = 'self',
  mobileHeader,
  desktopTopRight,
  contentClassName,
}: PortalShellProps) {
  const [open, setOpen] = useState(false)
  const { canvas, card, cardGutter, mobileHide } = portalShellClasses(breakpoint)
  const isDrawer = mobileNav === 'shell-drawer'

  return (
    <PortalShellDrawerProvider value={{ inShellDrawer: isDrawer, onNavigate: () => setOpen(false) }}>
      <div className={cn('h-screen flex overflow-hidden bg-claimondo-bg', canvas)}>
        {/* Mobile-Overlay (nur Drawer + offen) */}
        {isDrawer && open && (
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setOpen(false)}
            className={cn('fixed inset-0 z-40 bg-black/50', mobileHide)}
          />
        )}

        {/* Sidebar: bei 'self' bare (PortalNav self-positioniert wie heute); bei
            'shell-drawer' wrappt PortalShell sie in ein positioniertes Panel —
            Desktop statischer Rail, Mobile Off-Canvas-Slide. PortalNav rendert
            dann via Context als Panel (kein eigenes fixed/hidden). */}
        {isDrawer ? (
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-200 ease-out',
              // Mobile solid, Desktop transparent (Glass-Pills via data-sidebar-mode).
              'bg-claimondo-navy',
              breakpoint === 'md'
                ? 'md:bg-transparent md:translate-x-0'
                : 'lg:bg-transparent lg:translate-x-0',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {sidebar}
          </div>
        ) : (
          sidebar
        )}

        <div className={cn('flex-1 flex flex-col min-w-0 h-screen', contentOffsetClass)}>
          {(mobileHeader || isDrawer) && (
            <header
              className={cn(
                'flex items-center gap-3 px-4 py-3 glass-dark shadow-ios-md shrink-0',
                mobileHide,
              )}
            >
              {isDrawer && (
                <button
                  type="button"
                  aria-label="Menü öffnen"
                  onClick={() => setOpen(true)}
                  className="text-white p-1 -ml-1"
                >
                  <MenuIcon style={{ width: 22, height: 22 }} />
                </button>
              )}
              {mobileHeader}
            </header>
          )}

          {desktopTopRight}

          <div className={cn('flex-1 overflow-hidden', cardGutter)}>
            <main
              id="main-content"
              role="main"
              className={cn('h-full overflow-y-auto', card, contentClassName)}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </PortalShellDrawerProvider>
  )
}
