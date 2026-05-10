'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, MessageSquareIcon, UserIcon, SearchIcon, CalendarIcon } from 'lucide-react'

// CMM-28: Fall-Item dynamisch — bei Single-Fall direkt zur Detail-Page
// und Label „Mein Fall" (statt „Meine Fälle" + Auto-Redirect-Flicker).
function buildNavItems(singleFallId: string | null) {
  const fallItem = singleFallId
    ? { href: `/kunde/faelle/${singleFallId}`, label: 'Mein Fall', icon: HomeIcon, exact: false }
    : { href: '/kunde', label: 'Meine Fälle', icon: HomeIcon, exact: true }
  return [
    fallItem,
    { href: '/kunde/termine', label: 'Termine', icon: CalendarIcon, exact: false },
    { href: '/kunde/nachbesichtigung', label: 'Nachbesichtigung', icon: SearchIcon, exact: false },
    { href: '/kunde/chat', label: 'Nachrichten', icon: MessageSquareIcon, exact: false },
    { href: '/kunde/profil', label: 'Profil', icon: UserIcon, exact: false },
  ]
}

export default function KundeNav({
  mobile,
  singleFallId = null,
}: {
  mobile?: boolean
  /** Wenn der Kunde nur einen Fall hat: faelle.id direkt durchreichen, damit
   *  die Nav direkt zur Detail-Page linkt statt zum Dashboard mit Liste. */
  singleFallId?: string | null
}) {
  const pathname = usePathname()
  const NAV_ITEMS = buildNavItems(singleFallId)
  const MOBILE_ITEMS = [
    NAV_ITEMS[0]!,
    NAV_ITEMS.find((i) => i.href === '/kunde/termine')!,
    NAV_ITEMS.find((i) => i.href === '/kunde/chat')!,
    NAV_ITEMS.find((i) => i.href === '/kunde/profil')!,
  ]

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    // Bei Single-Fall-Href (`/kunde/faelle/[id]`) ist active wenn der User
    // auf der Detail-Page ODER einer Sub-Page (kalender etc.) ist.
    return pathname === href || pathname?.startsWith(href + '/')
  }

  // Mobile: Bottom-Nav Items (Icons + kleine Labels)
  if (mobile) {
    return (
      <>
        {MOBILE_ITEMS.map(item => {
          const active = isActive(item.href, item.exact)
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 min-w-[48px] min-h-[48px] px-3 py-2 transition-colors duration-500 ${
                active ? 'text-white' : 'text-claimondo-light-blue hover:text-white'
              }`}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </>
    )
  }

  // Desktop: Sidebar Nav
  return (
    <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-light-blue px-3 pt-4 pb-2">Navigation</p>
      {NAV_ITEMS.map(item => {
        const active = isActive(item.href, item.exact)
        return (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
              active ? 'bg-claimondo-ondo text-white font-semibold' : 'text-claimondo-light-blue hover:bg-claimondo-shield hover:text-white'
            }`}>
            <item.icon style={{ width: 17, height: 17 }} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
