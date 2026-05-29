'use client'

// AAR-776: Shared Tab-Bar für die Fallakte (alle drei Portale).
// Vorher hatte jede Fallakte (Admin, SV, Kunde) eine eigene Tab-Bar
// inline mit fast identischem Markup. Jetzt eine zentrale Komponente
// mit konsistentem Active-State, Icon, Hover, Token-Konsistenz.

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type FallakteTabDef<TKey extends string = string> = {
  id: TKey
  label: string
  icon: LucideIcon
  /** Optionaler Unread-Indikator (Tropfen) am Tab — z.B. neue Nachrichten */
  badgeCount?: number
}

type Props<TKey extends string> = {
  tabs: ReadonlyArray<FallakteTabDef<TKey>>
  activeTab: TKey
  onTabChange: (id: TKey) => void
  /** Optionaler Slot rechts neben den Tabs (z.B. „Task anlegen"-Button im Admin) */
  rightSlot?: ReactNode
}

export function FallakteTabs<TKey extends string>({
  tabs,
  activeTab,
  onTabChange,
  rightSlot,
}: Props<TKey>) {
  return (
    <nav className="border-b border-claimondo-border bg-white">
      <div className="flex items-center justify-between gap-3 px-4">
        <ul className="flex items-center gap-1 overflow-x-auto py-1.5">
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            const Icon = tab.icon
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 text-sm rounded-ios-lg transition-all whitespace-nowrap ${
                    active
                      ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                      : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      active ? 'text-claimondo-ondo' : 'text-claimondo-ondo/70'
                    }`}
                  />
                  {tab.label}
                  {tab.badgeCount && tab.badgeCount > 0 ? (
                    <span
                      aria-label={`${tab.badgeCount} ungelesen`}
                      className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold text-white bg-red-500"
                      style={{
                        // Wassertropfen-Form, passt zu DropletBadge-Primitive
                        borderRadius: '9999px 3px 9999px 9999px',
                      }}
                    >
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
        {rightSlot ? <div className="shrink-0 py-2">{rightSlot}</div> : null}
      </div>
    </nav>
  )
}
