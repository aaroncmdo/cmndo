'use client'

// AAR-956 WP-B (Task 9): Werkstatt-Portal-Shell.
// Gespiegelt nach MaklerShell — thin-Wrapper ueber shared PortalNav (dark variant).

import {
  LayoutDashboardIcon,
  ClipboardListIcon,
  QrCodeIcon,
  HandshakeIcon,
  ReceiptIcon,
  LogOutIcon,
  WrenchIcon,
  FileUpIcon,
} from 'lucide-react'
import { SupportButton } from '@/components/support/SupportButton'
import UpdatesNav from '@/components/shared/updates'
import TasksPill from '@/components/shared/TasksPill'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

type WerkstattShellProps = {
  werkstatt: {
    id: string
    name: string
    status: string
  }
  email: string
  userId: string
  children: React.ReactNode
}

const WERKSTATT_NAV_ITEMS: PortalNavItem[] = [
  { href: '/werkstatt', label: 'Übersicht', icon: LayoutDashboardIcon, exact: true },
  { href: '/werkstatt/auftraege', label: 'Aufträge', icon: ClipboardListIcon },
  { href: '/werkstatt/promo', label: 'QR-Code', icon: QrCodeIcon },
  { href: '/werkstatt/kva', label: 'Kostenvoranschlag', icon: FileUpIcon },
  { href: '/werkstatt/vermittlungen', label: 'Meine Vermittlungen', icon: HandshakeIcon },
  { href: '/werkstatt/abrechnungen', label: 'Provisionen', icon: ReceiptIcon },
]

const WERKSTATT_MOBILE_ITEMS = WERKSTATT_NAV_ITEMS

export function WerkstattShell({ werkstatt, email, userId, children }: WerkstattShellProps) {
  const initials = werkstatt.name
    ? werkstatt.name.substring(0, 2).toUpperCase()
    : (email?.substring(0, 2).toUpperCase() ?? 'WS')

  return (
    <>
    <div className="h-screen relative overflow-hidden bg-claimondo-bg">
      {/* Atmosphaerische Hintergrund-Spotlights */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute inset-0"
          style={{
            background: [
              'radial-gradient(65% 55% at 85% 0%, color-mix(in srgb, var(--brand-accent, #7BA3CC) 10%, transparent), transparent 65%)',
              'radial-gradient(55% 65% at 0% 100%, color-mix(in srgb, var(--brand-secondary, #4573A2) 6%, transparent), transparent 70%)',
            ].join(', '),
          }}
        />
      </div>

      <PortalNav
        variant="dark"
        ariaLabel="Werkstatt-Navigation"
        sections={[{ items: WERKSTATT_NAV_ITEMS }]}
        mobileItems={WERKSTATT_MOBILE_ITEMS}
        headerSlot={
          <>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                <span className="text-white">Claim</span>
                <span className="text-claimondo-light-blue">ondo</span>
              </span>
              <TasksPill userId={userId} href="/werkstatt" />
            </div>
            <p className="mt-1 inline-block rounded bg-claimondo-shield px-2 py-0.5 text-caption uppercase tracking-wider text-claimondo-light-blue">
              Werkstatt
            </p>
            <p className="mt-1 truncate text-xs text-claimondo-light-blue">{werkstatt.name}</p>
          </>
        }
        footerSlot={
          <>
            <SupportButton userName={werkstatt.name} />
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-claimondo-ondo text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/90">{werkstatt.name}</p>
                <p className="truncate text-body-xs text-claimondo-light-blue">{email}</p>
              </div>
              {/* Sidebar-Footer sitzt unten-links → Popover nach oben-rechts. */}
              <UpdatesNav variant="dark" placement="up-right" />
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
          <span className="rounded bg-claimondo-shield px-2 py-0.5 text-caption uppercase tracking-wider text-claimondo-light-blue">
            Werkstatt
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
    </>
  )
}
