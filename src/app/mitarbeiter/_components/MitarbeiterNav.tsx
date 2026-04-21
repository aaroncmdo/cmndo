'use client'

// AAR-61: Mitarbeiter-Portal Sidebar
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboardIcon, FolderOpenIcon, CheckSquareIcon, CalendarIcon,
  MessageCircleIcon, BarChart3Icon, AlertCircleIcon, UserIcon,
} from 'lucide-react'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboardIcon; exact?: boolean }

const ITEMS: NavItem[] = [
  { href: '/mitarbeiter', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/mitarbeiter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
  { href: '/mitarbeiter/tasks', label: 'Tasks', icon: CheckSquareIcon },
  { href: '/mitarbeiter/termine', label: 'Termine', icon: CalendarIcon },
  { href: '/mitarbeiter/nachrichten', label: 'Nachrichten', icon: MessageCircleIcon },
  { href: '/mitarbeiter/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
  { href: '/mitarbeiter/performance', label: 'Performance', icon: BarChart3Icon },
  // AAR-369: Eigenes Profil (Avatar + Anzeige-Infos) für KB/Admin
  { href: '/mitarbeiter/profil', label: 'Mein Profil', icon: UserIcon },
]

export default function MitarbeiterNav({ unreadNachrichten }: { unreadNachrichten?: number }) {
  const pathname = usePathname()
  const isActive = (item: NavItem) => item.exact ? pathname === item.href : pathname?.startsWith(item.href)

  return (
    <nav className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 min-h-[calc(100vh-60px)] p-3 space-y-1">
      {ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(item)
        const showBadge = item.href === '/mitarbeiter/nachrichten' && (unreadNachrichten ?? 0) > 0
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-500 ${
              active ? 'bg-[#0D1B3E] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{item.label}</span>
            {showBadge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                {unreadNachrichten}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
