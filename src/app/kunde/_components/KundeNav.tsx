'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, MessageSquareIcon, UserIcon, FolderOpenIcon, SearchIcon, ClockIcon } from 'lucide-react'

// AAR-101: Beratungstermin entfernt (Kunde hat keinen Kalender)
const NAV_ITEMS = [
  { href: '/kunde', label: 'Meine Fälle', icon: HomeIcon, exact: true },
  { href: '/kunde/faelle', label: 'Alle Fälle', icon: FolderOpenIcon },
  { href: '/kunde/termin', label: 'Termine', icon: ClockIcon },
  { href: '/kunde/nachbesichtigung', label: 'Nachbesichtigung', icon: SearchIcon },
  { href: '/kunde/chat', label: 'Nachrichten', icon: MessageSquareIcon },
  { href: '/kunde/profil', label: 'Profil', icon: UserIcon },
]

// Mobile: 5 wichtigste Items
const MOBILE_ITEMS = [
  NAV_ITEMS[0], // Meine Faelle
  NAV_ITEMS[1], // Alle Faelle
  NAV_ITEMS[4], // Nachrichten
  NAV_ITEMS[5], // Profil
  NAV_ITEMS[2], // Termine
]

export default function KundeNav({ mobile }: { mobile?: boolean }) {
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
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
                active ? 'text-white' : 'text-[#7BA3CC] hover:text-white'
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
      <p className="text-[10px] uppercase tracking-wider text-[#7BA3CC] px-3 pt-4 pb-2">Navigation</p>
      {NAV_ITEMS.map(item => {
        const active = isActive(item.href, item.exact)
        return (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-500 ${
              active ? 'bg-[#4573A2] text-white font-semibold' : 'text-[#7BA3CC] hover:bg-[#1E3A5F] hover:text-white'
            }`}>
            <item.icon style={{ width: 17, height: 17 }} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
