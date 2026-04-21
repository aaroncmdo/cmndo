'use client'

// AAR-162 / W2: Fallakte-Shell — 2-Column Layout mit 5 Tabs + Sidebar.
// AAR-172: Ersetzt den 210-KB-Monolithen FallakteClient.tsx endgültig
// (Monolith wurde gelöscht, siehe AAR-172 Commit).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListIcon, FolderOpenIcon, MessageCircleIcon, GitBranchIcon, ActivityIcon } from 'lucide-react'
import { FallProvider, type FallLike, type LeadLike } from './FallContext'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// AAR-687: alle 5 Tabs leben jetzt im _tabs/-Ordner (private-folder-
// Konvention). Vorher war 4× tabs/ + 1× _tabs/ parallel.
import UebersichtTab from './_tabs/UebersichtTab'
import KommunikationTab, { type FallTeilnehmer } from './_tabs/KommunikationTab'
import TimelineTab from './_tabs/TimelineTab'
import ProzessTab from './_tabs/ProzessTab'
import DokumenteTab from './_tabs/DokumenteTab'
import FallSidebar from './_sidebar/FallSidebar'
// AAR-307: Ad-hoc Task-Anlegen aus der Tab-Bar
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
// AAR-567 (V1): PhasePipeline als linke Spalte + FallActionBar über der Tab-Bar
import { PhasePipeline } from '@/components/shared/fall-phases'
import type { Rolle as PhasenRolle } from '@/components/shared/fall-phases'
import { buildPhasePipelineData } from '@/lib/fall/subphase-visibility'
import { FallActionBar } from '@/components/admin/fallakte/FallActionBar'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'

// Mapping FallakteRolle → shared PhasenRolle.
// Admin-Route sieht im Normalfall nur admin + kundenbetreuer; dispatch und
// sachverstaendiger werden defensiv auf admin gemappt (Sichtbarkeit = max).
function toPhasenRolle(r: FallakteRolle): PhasenRolle {
  if (r === 'kundenbetreuer') return 'kb'
  if (r === 'sachverstaendiger') return 'sv'
  if (r === 'kunde') return 'kunde'
  return 'admin'
}
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

  // AAR-567 (V1): Pipeline-Daten aus Visibility-Matrix ableiten.
  // `aktuelle_phase` (snake_case) ist die Quelle; falls noch nicht gesetzt,
  // dient `subphase.phase` (vom Resolver) als Fallback für die Phase-Nummer.
  const phasenRolle = toPhasenRolle(userRolle)
  const aktuellePhaseSnake = (fall.aktuelle_phase as string | null | undefined) ?? null
  const pipelinePhases = buildPhasePipelineData(
    {
      id: fall.id,
      aktuelle_phase: aktuellePhaseSnake,
      phase_nummer: subphase.phase,
      abgeschlossen_am: fall.abgeschlossen_am ?? null,
    },
    phasenRolle,
  )

  return (
    <FallProvider fall={fall} lead={lead} userRolle={userRolle}>
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-96px)] gap-0">
        {/* AAR-567 (V1): Linke Spalte — PhasePipeline (vertical) */}
        <aside className="lg:w-72 xl:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white overflow-y-auto">
          <div className="px-4 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Phasen
            </h3>
            <PhasePipeline
              fall={{ id: fall.id, aktuelle_phase: aktuellePhaseSnake }}
              rolle={phasenRolle}
              phases={pipelinePhases}
              variant="vertical"
              showTimestamps
            />
          </div>
        </aside>

        {/* Haupt-Column: Action-Bar + Tabs + Content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {/* AAR-567 (V1): Action-Bar ersetzt den Phase-Text-Badge. Status-
              Override, Kanzlei-Paket, Phase vorrücken und Trigger-Felder-
              Diagnostik. Phase-Darstellung ist in der linken Spalte. */}
          <FallActionBar result={subphase} fallId={fall.id} />
          {/* Tab-Bar — AAR-668: visuell verstärkt, aktiver Tab mit Hintergrund */}
          <nav className="border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4">
              <ul className="flex items-center gap-1 overflow-x-auto py-1.5">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id
                  const Icon = tab.icon
                  return (
                    <li key={tab.id}>
                      <button
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg transition-all whitespace-nowrap ${
                          active
                            ? 'bg-[#4573A2]/10 text-[#0D1B3E] font-semibold ring-1 ring-[#4573A2]/20'
                            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 font-medium'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${active ? 'text-[#4573A2]' : 'text-gray-400'}`} />
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
            {activeTab === 'prozess' && <ProzessTab subphase={subphase} />}
            {activeTab === 'timeline' && <TimelineTab events={events} />}
          </div>
        </main>

        {/* Sidebar */}
        <FallSidebar kundenbetreuer={kundenbetreuer} sv={sv} />
      </div>
    </FallProvider>
  )
}
