'use client'

// AAR-162 / W2: Fallakte-Shell — 2-Column Layout mit 5 Tabs + Sidebar.
// AAR-172: Ersetzt den 210-KB-Monolithen FallakteClient.tsx endgültig
// (Monolith wurde gelöscht, siehe AAR-172 Commit).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListIcon, FolderOpenIcon, MessageCircleIcon, GitBranchIcon, ActivityIcon, ClockIcon } from 'lucide-react'
import { TabDropContent } from '@/components/ui/TabDropContent'
import { FallProvider, type FallLike, type LeadLike } from './FallContext'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
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
// AAR-727 (fallphasen-glass): Aside nutzt shared FallPhasenPanel (glass-light).
import { FallPhasenPanel } from '@/components/shared/fall-phases'
import type { Rolle as PhasenRolle } from '@/components/shared/fall-phases'
import { FallActionBar } from '@/components/admin/fallakte/FallActionBar'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
// AAR-840: Endzustand-Dropdown + Claim-Status-Badge im Header
import { EndzustandDropdown, ClaimStatusBadge, KanzleiWunschDropdown } from '@/components/shared/claims'
// AAR-843: Timeline-View für den Verlaufs-Tab
import { TimelineView } from '@/components/shared/claims'
import type { ClaimTimelineEvent } from '@/lib/claims/timeline-queries'
import type { ProjectedEvent } from '@/lib/claims/timeline-projection'
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

type TabId = 'uebersicht' | 'dokumente' | 'kommunikation' | 'prozess' | 'timeline' | 'verlauf'

const TABS: { id: TabId; label: string; icon: typeof ListIcon }[] = [
  { id: 'uebersicht', label: 'Übersicht', icon: ListIcon },
  { id: 'dokumente', label: 'Dokumente', icon: FolderOpenIcon },
  { id: 'kommunikation', label: 'Kommunikation', icon: MessageCircleIcon },
  { id: 'prozess', label: 'Prozess', icon: GitBranchIcon },
  { id: 'verlauf', label: 'Verlauf', icon: ClockIcon },
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
  // AAR-840: claim_id + claims.status für Endzustand-Dropdown im Header
  claimId: string | null
  claimStatus: string | null
  // AAR-841: claims.kanzlei_wunsch für KB-Sidebar-Override-Dropdown
  claimKanzleiWunsch: string | null
  // AAR-844: "Paket jetzt versenden"-Quick-Action im Dropdown conditional
  kanzleiPaketPending: boolean
  // AAR-843: Timeline-Daten für den Verlaufs-Tab (server-seitig geladen)
  timelineEvents: ClaimTimelineEvent[]
  futureEvents: ProjectedEvent[]
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
  claimId,
  claimStatus,
  claimKanzleiWunsch,
  kanzleiPaketPending,
  timelineEvents,
  futureEvents,
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
      <FallRealtimeRefresh fallId={fall.id} claimId={claimId ?? null} />
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
            {/* AAR-840: Status-Badge + Endzustand-Dropdown rechts im Header.
                Sichtbar für Admin (immer) und KB (durch EndzustandDropdown
                rolle-intern guarded). claimId-Guard: ohne Claim kein Dropdown. */}
            {claimStatus && (
              <ClaimStatusBadge status={claimStatus} viewerRole="admin" size="sm" withIcon />
            )}
            {claimId && (
              <EndzustandDropdown
                claimId={claimId}
                currentStatus={claimStatus ?? 'dispatch_done'}
                viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : 'kunde'}
              />
            )}
            {/* AAR-841 Self-Review-Fix: KanzleiWunschDropdown war als shared
                Component gebaut aber nicht eingebunden. KB sieht jetzt den
                aktuellen Wunsch + kann Override triggern. */}
            {claimId && (
              <KanzleiWunschDropdown
                claimId={claimId}
                currentWunsch={claimKanzleiWunsch}
                viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : 'kunde'}
                paketVersandPending={kanzleiPaketPending}
              />
            )}
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
            {activeTab === 'verlauf' && (
              <TimelineView
                events={timelineEvents}
                futureEvents={futureEvents}
                viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : userRolle === 'sachverstaendiger' ? 'sv' : 'kunde'}
                variant="full"
                showKategorieBadge
              />
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
