'use client'

// 2026-05-14: Floating-Tab-Bar für SV-Mobile (Tesla-Cockpit-Approach).
//
// 5 Glass-Pills am unteren Rand mit Safe-Area-Inset, schweben über dem
// Content (kein Sidebar-Drawer mehr nötig für die Primary-Navigation, der
// Hamburger geht nur noch für „mehr"). Brand-tinted: aktives Item bekommt
// var(--brand-secondary) als Hintergrund + weiße Schrift, alle anderen
// var(--brand-sidebar-text) auf Glass-Pill mit backdrop-blur.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MapPinIcon,
  ClipboardListIcon,
  FolderOpenIcon,
  CalendarIcon,
  MenuIcon,
} from 'lucide-react'

export type GutachterMobileTabBarProps = {
  /** Callback um den Sidebar-Drawer zu öffnen (für „mehr"-Tab). */
  onOpenDrawer: () => void
  /** Badge-Counter pro Route (z. B. Aufträge=3, Kalender=2). */
  badges?: Partial<Record<'auftraege' | 'kalender' | 'faelle', number>>
}

const TABS = [
  { key: 'heute', href: '/gutachter/heute', label: 'Heute', icon: MapPinIcon },
  { key: 'auftraege', href: '/gutachter/auftraege', label: 'Aufträge', icon: ClipboardListIcon, badge: 'auftraege' as const },
  { key: 'faelle', href: '/gutachter/faelle', label: 'Fälle', icon: FolderOpenIcon, badge: 'faelle' as const },
  { key: 'kalender', href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon, badge: 'kalender' as const },
]

export default function GutachterMobileTabBar({ onOpenDrawer, badges = {} }: GutachterMobileTabBarProps) {
  const pathname = usePathname() ?? ''

  function isActive(href: string) {
    if (href === '/gutachter/heute') return pathname === href || pathname === '/gutachter'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      role="navigation"
      aria-label="SV-Mobile-Navigation"
      className="lg:hidden fixed left-3 right-3 z-50 flex items-stretch gap-1.5"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg, #0D1B3E) 55%, transparent)',
        backdropFilter: 'saturate(180%) blur(22px)',
        WebkitBackdropFilter: 'saturate(180%) blur(22px)',
        border: '1px solid color-mix(in srgb, white 22%, transparent)',
        borderRadius: 22,
        padding: '6px',
        boxShadow:
          '0 14px 36px color-mix(in srgb, var(--brand-sidebar-bg, #0D1B3E) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 25%, transparent)',
      }}
    >
      {TABS.map(tab => {
        const Icon = tab.icon
        const active = isActive(tab.href)
        const count = tab.badge ? badges[tab.badge] ?? 0 : 0
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2 min-h-[52px] transition-all active:scale-[0.96]"
            style={{
              backgroundColor: active ? 'var(--brand-secondary, #4573A2)' : 'transparent',
              color: active ? '#FFFFFF' : 'var(--brand-sidebar-text, #7BA3CC)',
              fontFamily: 'var(--brand-font-heading, inherit)',
            }}
          >
            <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.4 : 1.9} />
            <span className="text-[10px] font-semibold tracking-wide uppercase">{tab.label}</span>
            {count > 0 && (
              <span
                className="absolute top-1 right-2.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white border-2"
                style={{ borderColor: 'var(--brand-sidebar-bg, #0D1B3E)' }}
                aria-label={`${count} neue ${tab.label}`}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        )
      })}
      {/* Mehr-Tab → öffnet den klassischen Sidebar-Drawer für Sekundär-Nav
          (Abrechnung, Vertrag, Statistiken, Einstellungen, Abmelden). */}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Mehr öffnen"
        className="relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2 min-h-[52px] transition-all active:scale-[0.96]"
        style={{
          color: 'var(--brand-sidebar-text, #7BA3CC)',
          fontFamily: 'var(--brand-font-heading, inherit)',
        }}
      >
        <MenuIcon className="w-[22px] h-[22px]" strokeWidth={1.9} />
        <span className="text-[10px] font-semibold tracking-wide uppercase">Mehr</span>
      </button>
    </nav>
  )
}
