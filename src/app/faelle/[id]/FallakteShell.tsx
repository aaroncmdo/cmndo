'use client'

// AAR-162 / W2: Fallakte-Shell — 2-Column Layout mit 5 Tabs + Sidebar.
// AAR-172: Ersetzt den 210-KB-Monolithen FallakteClient.tsx endgültig
// (Monolith wurde gelöscht, siehe AAR-172 Commit).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListIcon, FolderOpenIcon, MessageCircleIcon, GitBranchIcon, ActivityIcon, ClipboardListIcon, WrenchIcon } from 'lucide-react'
import { TabDropContent } from '@/components/ui/TabDropContent'
import { FallProvider, type FallLike, type LeadLike } from './FallContext'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// AAR-687: alle 5 Tabs leben jetzt im _tabs/-Ordner (private-folder-
// Konvention). Vorher war 4× tabs/ + 1× _tabs/ parallel.
import UebersichtTab from './_tabs/UebersichtTab'
import KommunikationTab, { type FallTeilnehmer } from './_tabs/KommunikationTab'
import TimelineTab from './_tabs/TimelineTab'
import ProzessTab from './_tabs/ProzessTab'
import DokumenteTab from './_tabs/DokumenteTab'
// AAR-834: Gutachten-Tab
import GutachtenTab from './_tabs/GutachtenTab'
import type { GutachtenMitSv } from '@/lib/gutachten/queries'
// AAR-836: Reparatur-Tab
import ReparaturTab from './_tabs/ReparaturTab'
import type { RepairMitWerkstatt } from '@/lib/repairs/queries'
import FallSidebar from './_sidebar/FallSidebar'
// AAR-307: Ad-hoc Task-Anlegen aus der Tab-Bar
import { TaskAnlegenButton } from '@/components/tasks/TaskAnlegenButton'
// AAR-567 (V1): PhasePipeline als linke Spalte + FallActionBar über der Tab-Bar
// AAR-727 (fallphasen-glass): Aside nutzt shared FallPhasenPanel (glass-light).
import { FallPhasenPanel } from '@/components/shared/fall-phases'
import type { Rolle as PhasenRolle } from '@/components/shared/fall-phases'
import { FallActionBar } from '@/components/admin/fallakte/FallActionBar'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
// AAR-746 (Phase B): Shared Identity-Header — neu auch im Admin-Portal.
import { FallIdentityHeader } from '@/components/shared/fall-header'
// AAR-770: Mitteilungs-Banner ganz oben in der Fallakte
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'
// AAR-776: Shared Tab-Bar
import { FallakteTabs } from '@/components/shared/fall-tabs'

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

type TabId = 'uebersicht' | 'dokumente' | 'kommunikation' | 'prozess' | 'timeline' | 'gutachten' | 'reparatur'

const TABS: { id: TabId; label: string; icon: typeof ListIcon }[] = [
  { id: 'uebersicht',    label: 'Übersicht',    icon: ListIcon },
  { id: 'dokumente',     label: 'Dokumente',    icon: FolderOpenIcon },
  { id: 'kommunikation', label: 'Kommunikation', icon: MessageCircleIcon },
  { id: 'prozess',       label: 'Prozess',       icon: GitBranchIcon },
  { id: 'gutachten',     label: 'Gutachten',     icon: ClipboardListIcon },
  { id: 'reparatur',     label: 'Reparatur',     icon: WrenchIcon },
  { id: 'timeline',      label: 'Timeline',      icon: ActivityIcon },
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
  // AAR-834: Gutachten für den Gutachten-Tab
  gutachten: GutachtenMitSv[]
  // AAR-836: Repairs für den Reparatur-Tab
  repairs: RepairMitWerkstatt[]
  claimId: string | null
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
  gutachten,
  repairs,
  claimId,
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

  // AAR-567 (V1) / AAR-727: Pipeline-Input für FallPhasenPanel. Die Panel-
  // Komponente ruft buildPhasePipelineData intern auf.
  const phasenRolle = toPhasenRolle(userRolle)
  const aktuellePhaseSnake = (fall.aktuelle_phase as string | null | undefined) ?? null
  const phasenFall = {
    id: fall.id,
    aktuelle_phase: aktuellePhaseSnake,
    phase_nummer: subphase.phase,
    abgeschlossen_am: fall.abgeschlossen_am ?? null,
  }

  return (
    <FallProvider fall={fall} lead={lead} userRolle={userRolle}>
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-96px)] gap-0">
        {/* AAR-567 (V1) / AAR-727: Linke Spalte — Glass-Panel (aside). */}
        <aside className="lg:w-72 xl:w-80 shrink-0 overflow-y-auto">
          <div className="px-4 py-4">
            <FallPhasenPanel
              fall={phasenFall}
              rolle={phasenRolle}
              variant="aside"
            />
          </div>
        </aside>

        {/* Haupt-Column: Konsolidierter Header + Tabs + Content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {/* AAR-758: Ein gemeinsamer Header-Block statt vorher zwei (IdentityHeader + ActionBar).
              FallIdentityHeader zeigt Fallnummer · Kunde · Ort, die ActionBar-
              Buttons landen im actions-Slot rechts. Phase-Label weggelassen —
              steht bereits in der Aside-Phasen-Pipeline, keine Dopplung mehr. */}
          {/* AAR-770: Mitteilungs-Banner ganz oben — vor dem Identity-Header */}
          <div className="px-4 sm:px-6 pt-4">
            <FallMitteilungenBanner fallId={fall.id} rolle={userRolle} />
          </div>
          <FallIdentityHeader
            rolle="admin"
            fallNummer={fall.fall_nummer ?? fall.id.slice(0, 8)}
            kundenName={
              lead
                ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null
                : null
            }
            ort={(fall.schadens_ort as string | null) ?? null}
          >
            <FallActionBar result={subphase} fallId={fall.id} compact />
          </FallIdentityHeader>
          {/* AAR-776: Tab-Bar als shared Component (FallakteTabs) — gleiches
              Component wie SV-Fallakte und Kunde-Fallakte. */}
          <FallakteTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            rightSlot={
              <TaskAnlegenButton fallId={fall.id} rolle={userRolle} label="Task anlegen" />
            }
          />

          {/* Content */}
          <TabDropContent tabKey={activeTab} className="px-4 sm:px-6 py-6">
            {activeTab === 'uebersicht' && <UebersichtTab />}
            {activeTab === 'dokumente' && <DokumenteTab {...dokumenteTabProps} />}
            {activeTab === 'kommunikation' && (
              <KommunikationTab currentUserId={currentUserId} teilnehmer={teilnehmer} />
            )}
            {activeTab === 'prozess' && <ProzessTab subphase={subphase} />}
            {activeTab === 'gutachten' && (
              <GutachtenTab fallId={fall.id} claimId={claimId} gutachten={gutachten} />
            )}
            {activeTab === 'reparatur' && (
              <ReparaturTab fallId={fall.id} claimId={claimId} repairs={repairs} />
            )}
            {activeTab === 'timeline' && <TimelineTab events={events} />}
          </TabDropContent>
        </main>

        {/* Sidebar */}
        <FallSidebar kundenbetreuer={kundenbetreuer} sv={sv} />
      </div>
    </FallProvider>
  )
}
