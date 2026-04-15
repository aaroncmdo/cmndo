'use client'

// AAR-162 / W2: Fallakte-Shell — 2-Column Layout mit 5 Tabs + Sidebar.
// AAR-172: Ersetzt den 210-KB-Monolithen FallakteClient.tsx endgültig
// (Monolith wurde gelöscht, siehe AAR-172 Commit).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListIcon, FolderOpenIcon, MessageCircleIcon, GitBranchIcon, ActivityIcon } from 'lucide-react'
import { FallProvider, type FallLike, type LeadLike } from './FallContext'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
import UebersichtTab from './tabs/UebersichtTab'
import KommunikationTab from './tabs/KommunikationTab'
import TimelineTab from './tabs/TimelineTab'
import ProzessTab from './tabs/ProzessTab'
import DokumenteTab from './DokumenteTab'
import FallSidebar from './sidebar/FallSidebar'

type TabId = 'uebersicht' | 'dokumente' | 'kommunikation' | 'prozess' | 'timeline'

const TABS: { id: TabId; label: string; icon: typeof ListIcon }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: ListIcon },
  { id: 'dokumente', label: 'Dokumente', icon: FolderOpenIcon },
  { id: 'kommunikation', label: 'Kommunikation', icon: MessageCircleIcon },
  { id: 'prozess', label: 'Prozess', icon: GitBranchIcon },
  { id: 'timeline', label: 'Timeline', icon: ActivityIcon },
]

// DokumenteTab erwartet eine große Menge Props aus dem alten Monolithen.
// Wir reichen die hier durch — siehe ShellProps unten.

type ShellProps = {
  fall: FallLike
  lead: LeadLike
  userRolle: FallakteRolle
  kundenbetreuer: {
    id: string
    vorname: string | null
    nachname: string | null
    email: string | null
    telefon: string | null
  } | null
  sv: {
    id: string
    paket: string
    profile: {
      vorname: string | null
      nachname: string | null
      email: string | null
      telefon: string | null
    } | null
  } | null
  timeline: Parameters<typeof TimelineTab>[0]['timeline']
  dokumenteTabProps: React.ComponentProps<typeof DokumenteTab>
}

export default function FallakteShell({
  fall,
  lead,
  userRolle,
  kundenbetreuer,
  sv,
  timeline,
  dokumenteTabProps,
}: ShellProps) {
  const router = useRouter()
  const search = useSearchParams()
  const tabParam = (search.get('tab') as TabId) ?? 'uebersicht'
  const [activeTab, setActiveTabState] = useState<TabId>(
    TABS.some((t) => t.id === tabParam) ? tabParam : 'uebersicht',
  )

  function setActiveTab(id: TabId) {
    setActiveTabState(id)
    // URL-Param sync — zurück-Button + Deep-Links funktionieren dadurch
    const params = new URLSearchParams(search?.toString() ?? '')
    params.set('tab', id)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <FallProvider fall={fall} lead={lead} userRolle={userRolle}>
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-96px)] gap-0">
        {/* Haupt-Column: Tabs + Content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {/* Tab-Bar */}
          <nav className="border-b border-gray-200 bg-white sticky top-0 z-10">
            <ul className="flex items-center gap-0 px-4 overflow-x-auto">
              {TABS.map((tab) => {
                const active = activeTab === tab.id
                const Icon = tab.icon
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                        active
                          ? 'border-[#4573A2] text-[#0D1B3E]'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Content */}
          <div className="px-4 sm:px-6 py-6">
            {activeTab === 'uebersicht' && <UebersichtTab />}
            {activeTab === 'dokumente' && <DokumenteTab {...dokumenteTabProps} />}
            {activeTab === 'kommunikation' && <KommunikationTab />}
            {activeTab === 'prozess' && <ProzessTab />}
            {activeTab === 'timeline' && <TimelineTab timeline={timeline} />}
          </div>
        </main>

        {/* Sidebar */}
        <FallSidebar kundenbetreuer={kundenbetreuer} sv={sv} />
      </div>
    </FallProvider>
  )
}
