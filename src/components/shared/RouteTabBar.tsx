'use client'

// Route-basierte Tab-Leiste (jede Tab = eigene URL). Visuelle Sprache = FallakteTabs
// (Pills, claimondo-Tokens). Fuer route-basierte Hubs (z.B. /admin/faelle). Aktiv-State
// via isRouteTabActive (pure, getestet). FallakteTabs bleibt fuer State-basierte Tabs.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { isRouteTabActive, type RouteTab } from './route-tabs'

type Props = {
  tabs: ReadonlyArray<RouteTab>
  /** Optionaler Slot rechts (z.B. Aktions-Button). */
  rightSlot?: ReactNode
}

export default function RouteTabBar({ tabs, rightSlot }: Props) {
  const pathname = usePathname()
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Tabs">
      <ul className="flex items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => {
          const active = isRouteTabActive(pathname, tab.href, tab.exact)
          const Icon = tab.icon
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-3.5 py-2 text-sm rounded-ios-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                    : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                }`}
              >
                {Icon ? (
                  <Icon className={`w-4 h-4 ${active ? 'text-claimondo-ondo' : 'text-claimondo-ondo/70'}`} />
                ) : null}
                {tab.label}
                {tab.badge && tab.badge > 0 ? (
                  <span
                    aria-label={`${tab.badge} offen`}
                    className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-danger"
                    style={{ borderRadius: '9999px 3px 9999px 9999px' }}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
      {rightSlot ? <div className="shrink-0 py-2">{rightSlot}</div> : null}
    </nav>
  )
}
