'use client'

// Shared Portal-Sidebar-Footer (dark variant). Extrahiert aus dem identischen
// footerSlot-Muster von Dispatch/Admin/Makler/Werkstatt: Support + Avatar +
// optionale Profil-/Einstellungen-Links + optionale Extras (UpdatesNav, Badges)
// + Logout. JEDE Funktion bleibt erhalten (via Props/Slots — nichts weggelassen).
//
// Logout ist bewusst ein <form>-POST (kein primitives.Button): der Server-seitige
// Session-Invalidate braucht den nativen Form-Submit auf /api/auth/logout.

import Link from 'next/link'
import { LogOutIcon, UserIcon, SettingsIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SupportButton } from '@/components/support/SupportButton'

// Exakt das Item-Styling der bestehenden dark-Footer (byte-identisch zu Dispatch).
const ITEM_CLS =
  'flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors w-full text-claimondo-light-blue hover:bg-white/5 hover:text-white'

export type PortalUserFooterProps = {
  /** SupportButton-Kontext. `rolle` ist ein freier String (kein Enum). */
  rolle: string
  supportUserName?: string | null
  /** Avatar-Initialen. */
  initials: string
  /** Haupt-Caption (Name ODER Email). */
  primaryText: string
  /** Optionale zweite Zeile (z.B. Email unter dem Namen). */
  secondaryText?: string
  /** Optionaler „Mein Profil"-Link. */
  profilHref?: string
  profilLabel?: string
  /** Optionaler „Einstellungen"-Link. */
  einstellungenHref?: string
  einstellungenLabel?: string
  /** Optionale Extra-Nodes (UpdatesNav, OutboxBadge …), über dem Logout. */
  extra?: ReactNode
  /** Logout-Endpoint (Default /api/auth/logout). */
  logoutAction?: string
}

export function PortalUserFooter({
  rolle,
  supportUserName,
  initials,
  primaryText,
  secondaryText,
  profilHref,
  profilLabel = 'Mein Profil',
  einstellungenHref,
  einstellungenLabel = 'Einstellungen',
  extra,
  logoutAction = '/api/auth/logout',
}: PortalUserFooterProps) {
  return (
    <>
      <SupportButton userName={supportUserName ?? primaryText} rolle={rolle} />
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-claimondo-ondo text-white">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 truncate">{primaryText}</p>
          {secondaryText ? (
            <p className="text-xs text-claimondo-light-blue truncate">{secondaryText}</p>
          ) : null}
        </div>
      </div>
      {profilHref ? (
        <Link href={profilHref} className={ITEM_CLS}>
          <UserIcon style={{ width: 17, height: 17 }} />
          {profilLabel}
        </Link>
      ) : null}
      {einstellungenHref ? (
        <Link href={einstellungenHref} className={ITEM_CLS}>
          <SettingsIcon style={{ width: 17, height: 17 }} />
          {einstellungenLabel}
        </Link>
      ) : null}
      {extra}
      <form action={logoutAction} method="POST">
        <button type="submit" className={ITEM_CLS}>
          <LogOutIcon style={{ width: 17, height: 17 }} />
          Abmelden
        </button>
      </form>
    </>
  )
}
