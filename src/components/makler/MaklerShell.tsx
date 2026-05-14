'use client'

// AAR-483 (M1) / AAR-frontend-konsolidierung-p1: Makler-Portal-Shell.
// Thin-Wrapper über die shared PortalNav (dark variant) — wie AdminNav/DispatchNav.
// Vorher: ~178 Zeilen self-contained Sidebar mit dupliziertem isActive + Item-
// Rendering + Hard-Hex-BG (#f2f3f7) + text-claimondo-shield-auf-navy (B3, dunkel
// auf dunkel). Jetzt: nur Makler-spezifische Config (Items, Header-/Footer-Slot).

import {
  LayoutDashboardIcon,
  UserPlusIcon,
  FolderOpenIcon,
  ReceiptIcon,
  QrCodeIcon,
  SettingsIcon,
  LogOutIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import UpdatesNav from '@/components/shared/updates'
import { MitteilungenProvider } from '@/components/mitteilungszentrale/MitteilungenProvider'
import TasksPill from '@/components/shared/TasksPill'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

type MaklerShellProps = {
  makler: {
    id: string
    firma: string
    ansprechpartner_vorname: string
    status: string
  }
  email: string
  userId: string
  children: React.ReactNode
}

const MAKLER_NAV_ITEMS: PortalNavItem[] = [
  { href: '/makler', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/makler/leads', label: 'Leads', icon: UserPlusIcon },
  { href: '/makler/akten', label: 'Akten', icon: FolderOpenIcon },
  { href: '/makler/abrechnungen', label: 'Abrechnungen', icon: ReceiptIcon },
  { href: '/makler/promo', label: 'Promo & QR', icon: QrCodeIcon },
  { href: '/makler/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
]

const MAKLER_MOBILE_ITEMS = MAKLER_NAV_ITEMS.slice(0, 4)

export function MaklerShell({ makler, email, userId, children }: MaklerShellProps) {
  const initials = makler.ansprechpartner_vorname
    ? makler.ansprechpartner_vorname.substring(0, 2).toUpperCase()
    : (email?.substring(0, 2).toUpperCase() ?? 'MA')

  return (
    <MitteilungenProvider>
    <div className="h-screen relative overflow-hidden bg-claimondo-bg">
      {/* Atmosphärische Hintergrund-Spotlights — identisch mit Admin-Layout */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.10), transparent 65%)',
              'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.06), transparent 70%)',
            ].join(', '),
          }}
        />
      </div>

      <PortalNav
        variant="dark"
        ariaLabel="Makler-Navigation"
        sections={[{ items: MAKLER_NAV_ITEMS }]}
        mobileItems={MAKLER_MOBILE_ITEMS}
        headerSlot={
          <>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                <span className="text-white">Claim</span>
                <span className="text-claimondo-light-blue">ondo</span>
              </span>
              {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
              <TasksPill userId={userId} href="/makler" />
            </div>
            <p className="mt-1 inline-block rounded bg-claimondo-shield px-2 py-0.5 text-[10px] uppercase tracking-wider text-claimondo-light-blue">
              Makler
            </p>
            <p className="mt-1 truncate text-xs text-claimondo-light-blue">{makler.firma}</p>
          </>
        }
        footerSlot={
          <>
            <SupportButton userName={makler.ansprechpartner_vorname} />
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-claimondo-ondo text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/90">{makler.ansprechpartner_vorname}</p>
                <p className="truncate text-[11px] text-claimondo-light-blue">{email}</p>
              </div>
              <UpdatesNav variant="dark" />
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white"
              >
                <LogOutIcon style={{ width: 17, height: 17 }} />
                Abmelden
              </button>
            </form>
          </>
        }
      />

      {/* Content-Bereich — Offset durch die fixe PortalNav-Sidebar (w-56) */}
      <div className="relative z-10 flex h-screen flex-col md:ml-56">
        {/* Mobile header */}
        <header className="flex shrink-0 items-center justify-between px-4 py-3 glass-dark shadow-ios-md md:hidden">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-claimondo-light-blue">ondo</span>
          </span>
          <span className="rounded bg-claimondo-shield px-2 py-0.5 text-[10px] uppercase tracking-wider text-claimondo-light-blue">
            Makler
          </span>
        </header>

        <main
          id="main-content"
          role="main"
          className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0"
        >
          {children}
        </main>
      </div>
    </div>
    </MitteilungenProvider>
  )
}
