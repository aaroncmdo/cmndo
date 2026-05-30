'use client'

// AAR-939 · Monika-Embed · Stream 6 — schlanke SV-Portal-Shell.
// Eigene, vom Gutachter-Cockpit getrennte Navigation (Embed-Admin + Lead-Inbox).
// Claimondo-neutrale Chrome (interne Tool-Sicht, kein Whitelabel — AGENTS.md).

import { Code2Icon, InboxIcon, LogOutIcon } from 'lucide-react'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const NAV_ITEMS: PortalNavItem[] = [
  { href: '/sv-portal/embed-sites', label: 'Embed-Sites', icon: Code2Icon },
  { href: '/sv-portal/anfragen', label: 'Anfragen', icon: InboxIcon },
]

export default function SVPortalShell({ email, initials }: { email: string; initials: string }) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="SV-Portal-Navigation"
      sections={[{ label: 'Self-Service', items: NAV_ITEMS }]}
      mobileItems={NAV_ITEMS}
      headerSlot={
        <>
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-claimondo-light-blue">ondo</span>
          </span>
          <p className="text-[10px] mt-1 uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield inline-block px-2 py-0.5 rounded">
            SV-Portal
          </p>
          <p className="text-xs mt-1 text-claimondo-light-blue">{email}</p>
        </>
      }
      footerSlot={
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-claimondo-ondo text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 truncate">{email}</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors w-full text-claimondo-light-blue hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} />
              Abmelden
            </button>
          </form>
        </>
      }
    />
  )
}
