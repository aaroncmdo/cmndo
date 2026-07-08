'use client'

// Shared PortalNav (dark = detached Navy-Panel). Header-/Footer-Slots tragen die
// frueher im Top-Bar gerenderten Aktionen (Logo/Badge/TasksPill + Updates/Logout).

import { LayoutDashboardIcon, KanbanSquareIcon, CalendarIcon, ShieldCheckIcon, LogOutIcon } from 'lucide-react'
import { PortalNav } from '@/components/shared/portal-nav'
import TasksPill from '@/components/shared/TasksPill'
import UpdatesNav from '@/components/shared/updates'

export default function KanzleiNav({ userId, displayName }: { userId: string; displayName: string }) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Kanzlei-Navigation"
      sections={[{
        items: [
          { href: '/kanzlei/mandate', label: 'Mandate', icon: LayoutDashboardIcon },
          { href: '/kanzlei/kanban', label: 'Pipeline', icon: KanbanSquareIcon },
          { href: '/kanzlei/termin', label: 'Termin buchen', icon: CalendarIcon },
          { href: '/kanzlei/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
        ],
      }]}
      headerSlot={
        <>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/claimondo-shield.svg" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span>
            </span>
            <TasksPill userId={userId} href="/kanzlei/mandate" />
          </div>
          <p className="mt-1 inline-block rounded border border-claimondo-light-blue/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-claimondo-light-blue">
            Kanzlei
          </p>
        </>
      }
      footerSlot={
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            {/* Fuss unten-links → Popover nach oben-rechts. */}
            <UpdatesNav variant="dark" placement="up-right" />
            <span className="min-w-0 flex-1 truncate text-sm text-white/90">{displayName}</span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-ios-lg px-3 py-2.5 text-sm text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} /> Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
