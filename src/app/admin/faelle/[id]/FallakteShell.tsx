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
import KommunikationTab, { type FallTeilnehmer } from './tabs/KommunikationTab'
import TimelineTab from './tabs/TimelineTab'
import ProzessTab from './tabs/ProzessTab'
import DokumenteTab from './_tabs/DokumenteTab'
import FallSidebar from './sidebar/FallSidebar'
// AAR-307: Ad-hoc Task-Anlegen aus der Tab-Bar
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
// AAR-538 (C1): sticky Phase-Header + Subphase-Resolver
import { PhaseHeader } from '@/components/admin/fallakte/PhaseHeader'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
// AAR-544 (C7): unified Event-Stream für den Timeline-Tab
import type { FallEvent } from '@/lib/fall/event-stream'

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
  // AAR-544 (C7): unified Event-Stream aus 7 Quellen
  events: FallEvent[]
  dokumenteTabProps: React.ComponentProps<typeof DokumenteTab>
  // AAR-538 (C1): vom Server berechnete Subphase
  subphase: SubphaseResult
  // AAR-541 (C4): Kommunikations-Tab Props (currentUserId + Teilnehmer)
  currentUserId: string | null
  teilnehmer: FallTeilnehmer[]
}

export default function FallakteShell({
  fall,
  lead,
  userRolle,
  kundenbetreuer,
  sv,
  events,
  dokumenteTabProps,
  subphase,
  currentUserId,
  teilnehmer,
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
          {/* AAR-538 (C1): sticky Phase-Header — steht OBERHALB der Tab-Bar.
              Tab-Bar ist nicht mehr sticky, damit beide nicht am gleichen
              Anker konkurrieren. */}
          <PhaseHeader result={subphase} fallId={fall.id} />
          {/* Tab-Bar */}
          <nav className="border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4">
              <ul className="flex items-center gap-0 overflow-x-auto">
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
              {/* AAR-307: Ad-hoc Task-Anlegen — nur für KB/Admin (SV nutzt SV-Portal) */}
              <div className="shrink-0 py-2">
                <TaskAnlegenButton fallId={fall.id} rolle={userRolle} label="Task anlegen" />
              </div>
            </div>
          </nav>

          {/* Content */}
          <div className="px-4 sm:px-6 py-6">
            {activeTab === 'uebersicht' && <UebersichtTab />}
            {activeTab === 'dokumente' && <DokumenteTab {...dokumenteTabProps} />}
            {activeTab === 'kommunikation' && (
              <KommunikationTab currentUserId={currentUserId} teilnehmer={teilnehmer} />
            )}
            {activeTab === 'prozess' && <ProzessTab />}
            {activeTab === 'timeline' && <TimelineTab events={events} />}
          </div>
        </main>

        {/* Sidebar */}
        <FallSidebar kundenbetreuer={kundenbetreuer} sv={sv} />
      </div>
    </FallProvider>
  )
}
