'use client'

import { useState, type ReactNode } from 'react'
import { ClipboardListIcon, PencilIcon, HistoryIcon } from 'lucide-react'

const TABS = [
  { key: 'uebersicht', label: 'Übersicht', icon: ClipboardListIcon },
  { key: 'felder', label: 'Alle Felder', icon: PencilIcon },
  { key: 'historie', label: 'Historie', icon: HistoryIcon },
] as const

type Tab = (typeof TABS)[number]['key']

export default function LeadDetailTabs({
  uebersichtContent,
  felderContent,
  historieContent,
}: {
  uebersichtContent: ReactNode
  felderContent: ReactNode
  historieContent: ReactNode
}) {
  const [tab, setTab] = useState<Tab>('uebersicht')

  return (
    <>
      {/* Tab bar */}
      <div className="sticky top-[89px] z-10 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-[#4573A2] text-[#4573A2]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'uebersicht' && uebersichtContent}
        {tab === 'felder' && felderContent}
        {tab === 'historie' && historieContent}
      </div>
    </>
  )
}
