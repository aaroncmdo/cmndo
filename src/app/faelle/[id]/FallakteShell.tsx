'use client'

// AAR-162 / W2: Fallakte-Shell — 2-Column Layout mit 5 Tabs + Sidebar.
// AAR-172: Ersetzt den 210-KB-Monolithen FallakteClient.tsx endgültig
// (Monolith wurde gelöscht, siehe AAR-172 Commit).

import { ListIcon, FolderOpenIcon, MessageCircleIcon, GitBranchIcon, ActivityIcon, ClockIcon } from 'lucide-react'
import { FallProvider, type FallLike, type LeadLike } from './FallContext'
import type { FallakteRolle } from '@/lib/fall/field-permissions'
// C4d/e (Fundament „Eine Akte"): Staff rendert ueber den <FallAkte layout='tabs'>-Kern.
import { FallAkte } from '@/components/fall-akte/FallAkte'
import type { FallAkteConfig } from '@/components/fall-akte/types'
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
// CMM-44 MP-4b: 4-Phasen-Lifecycle (vom Server geladen, an FallPhasenPanel durchgereicht).
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import { FallActionBar } from '@/components/admin/fallakte/FallActionBar'
import type { SubphaseResult } from '@/lib/fall/subphase-resolver'
// AAR-840: Endzustand-Dropdown + Claim-Status-Badge im Header
import { EndzustandDropdown, KanzleiWunschDropdown } from '@/components/shared/claims'
// B3/T4: der Fallakte-Badge zeigt operative_status (fall-status-Domain) statt claims.status ?? work_state.
import FallStatusBadge from '@/components/shared/FallStatusBadge'
// FlowLink-Review C: fiktiv-Szenario-Badge (reparaturwunsch='fiktiv') im Header.
import { FiktivAbrechnungBadge } from '@/components/shared/FiktivAbrechnungBadge'
// AAR-843: Timeline-View für den Verlaufs-Tab
import { TimelineView } from '@/components/shared/claims'
import type { ClaimTimelineEvent } from '@/lib/claims/timeline-queries'
import type { ProjectedEvent } from '@/lib/claims/timeline-projection'
// AAR-746 (Phase B): Shared Identity-Header — neu auch im Admin-Portal.
import { FallIdentityHeader } from '@/components/shared/fall-header'
// AAR-770: Mitteilungs-Banner ganz oben in der Fallakte
import { FallMitteilungenBanner } from '@/components/shared/fall-mitteilungen'

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

// C4d/e: minimales vm — nur was realtime braucht; header/slots/tabContent schliessen ueber den Scope.
type StaffTabsVm = { fallId: string; claimId: string | null }

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
  // FlowLink-Review C: claims.reparaturwunsch fuers fiktiv-Szenario-Badge im Header.
  claimReparaturwunsch: string | null
  /**
   * CMM-Brücke: claim-Subset (admin/KB) für Stammdaten-Felder die noch nicht
   * namens-synchron gespiegelt sind — wird via FallProvider an Sections.tsx
   * durchgereicht. null für SV/Kunde (deren ReadSection braucht es nicht).
   */
  claim: Record<string, unknown> | null
  // AAR-844: "Paket jetzt versenden"-Quick-Action im Dropdown conditional
  kanzleiPaketPending: boolean
  // AAR-843: Timeline-Daten für den Verlaufs-Tab (server-seitig geladen)
  timelineEvents: ClaimTimelineEvent[]
  futureEvents: ProjectedEvent[]
  // CMM-44 MP-4b: 4-Phasen-Lifecycle für die Phasen-Anzeige (aside).
  lifecycle: ClaimLifecycle
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
  claimReparaturwunsch,
  claim,
  kanzleiPaketPending,
  timelineEvents,
  futureEvents,
  lifecycle,
}: ShellProps) {
  // AAR-567 (V1) / AAR-727 / CMM-44 MP-4b: Rolle-Mapping für FallPhasenPanel.
  const phasenRolle = toPhasenRolle(userRolle)

  // C4d/e: Staff-Fallakte ueber den <FallAkte layout='tabs'>-Kern. Der activeTab-State + ?tab=-Sync
  // leben jetzt im FallAkteTabs-Controller; hier wird nur die Config gebaut. FallProvider wrappt
  // <FallAkte> (unten), damit die Tab-Inhalte (UebersichtTab via FallContext etc.) Fall-Context haben.
  const vm: StaffTabsVm = { fallId: fall.id, claimId }

  const config: FallAkteConfig<StaffTabsVm, never> = {
    layout: 'tabs',
    zones: () => [],
    zoneComponents: {},
    tabs: TABS,
    realtime: (v) => ({ fallId: v.fallId, claimId: v.claimId }),
    // AAR-758: ein gemeinsamer Header-Block — FallIdentityHeader (Fallnr · Kunde · Ort) + ActionBar +
    // Status/Endzustand/Kanzlei-Dropdowns im actions-Slot rechts.
    header: () => ({
      custom: (
        <FallIdentityHeader
          rolle="admin"
          fallNummer={fall.claim_nummer ?? fall.id.slice(0, 8)}
          kundenName={
            lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null : null
          }
          ort={(fall.schadens_ort as string | null) ?? null}
        >
          <FallActionBar result={subphase} fallId={fall.id} compact />
          {claimStatus && <FallStatusBadge status={claimStatus} size="sm" />}
          <FiktivAbrechnungBadge reparaturwunsch={claimReparaturwunsch} size="sm" />
          {claimId && (
            <EndzustandDropdown
              claimId={claimId}
              currentStatus={claimStatus ?? 'dispatch_done'}
              viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : 'kunde'}
            />
          )}
          {claimId && (
            <KanzleiWunschDropdown
              claimId={claimId}
              currentWunsch={claimKanzleiWunsch}
              viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : 'kunde'}
              paketVersandPending={kanzleiPaketPending}
            />
          )}
        </FallIdentityHeader>
      ),
    }),
    slots: () => ({
      // AAR-567/AAR-727: linke Spalte = Phasen-Pipeline (aside).
      aside: (
        <FallPhasenPanel
          lifecycle={lifecycle}
          fallId={fall.id}
          rolle={phasenRolle}
          variant="aside"
        />
      ),
      sidebar: <FallSidebar kundenbetreuer={kundenbetreuer} sv={sv} />,
      // AAR-770: Mitteilungs-Banner ganz oben — vor dem Identity-Header.
      topBlocks: (
        <div className="px-4 sm:px-6 pt-4">
          <FallMitteilungenBanner fallId={fall.id} rolle={userRolle} />
        </div>
      ),
    }),
    // AAR-307: Ad-hoc Task-Anlegen aus der Tab-Bar.
    tabRightSlot: <TaskAnlegenButton fallId={fall.id} rolle={userRolle} label="Task anlegen" />,
    // Tab-Inhalte VORGERENDERT (heterogene Props); der Controller mountet nur den aktiven.
    tabContent: {
      uebersicht: <UebersichtTab />,
      dokumente: <DokumenteTab {...dokumenteTabProps} />,
      kommunikation: <KommunikationTab currentUserId={currentUserId} teilnehmer={teilnehmer} />,
      prozess: <ProzessTab subphase={subphase} />,
      // AAR-843: Timeline-View fuer den Verlaufs-Tab.
      verlauf: (
        <TimelineView
          events={timelineEvents}
          futureEvents={futureEvents}
          viewerRole={userRolle === 'kundenbetreuer' ? 'kb' : userRolle === 'admin' ? 'admin' : userRolle === 'sachverstaendiger' ? 'sv' : 'kunde'}
          variant="full"
          showKategorieBadge
        />
      ),
      // AAR-544 (C7): unified Event-Stream fuer den Timeline-Tab.
      timeline: <TimelineTab events={events} />,
    },
  }

  return (
    <FallProvider fall={fall} lead={lead} claim={claim} userRolle={userRolle}>
      <FallAkte config={config} vm={vm} />
    </FallProvider>
  )
}
