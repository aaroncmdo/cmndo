'use client'

// AAR-137 / W3: DispatchShell — 2-Column Layout.
// Links: Phase-Stepper + aktive Phase. Rechts: fixe Sidebar (Timer, Disqual,
// Rückruf, Gesprächshilfe, Einwände). Empfängt Server-Side-Daten als Props
// und setzt den DispatchPhaseProvider auf.

import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import {
  DispatchPhaseProvider,
  type Phase,
} from './lib/phase-context'
import type {
  LeadLike,
  AktiverTerminLike,
} from './lib/qualification-engine'
import PhaseHeader from './PhaseHeader'
import PhaseContent from './PhaseContent'
import {
  TimerWidget,
  DisqualifizierenButton,
  RueckrufButton,
  TerminListeSidebar,
  GespraechshilfePanel,
  EinwandKarten,
} from './sidebar/SidebarStubs'
import { computeFlowLinkStufe, FLOWLINK_STUFE_LABEL } from '@/lib/dispatch/fahrzeug-marken'
import { PHASE_LABELS as PHASE_LABELS_CONST, PHASE_BADGES } from '../_components/leadPhaseConstants'

type FlowLinkRow = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
  geoeffnet_am?: string | null
  abgeschlossen_am?: string | null
  fall_id?: string | null
}

type FallSnapshot = {
  sa_unterschrieben?: boolean | null
  // AAR-583 (N6): vollmacht_unterschrieben (bool) → vollmacht_signiert_am
  // (timestamptz). Bool-Semantik wird im Consumer via IS NOT NULL abgeleitet.
  vollmacht_signiert_am?: string | null
}


export default function DispatchShell({
  lead,
  aktiverTermin,
  flowLinks,
  fall,
  initialPhase,
  saUnterschrieben,
  fallIdFuerBanner,
}: {
  lead: LeadLike & {
    id: string
    vorname?: string | null
    nachname?: string | null
    qualifizierungs_phase?: string | null
  }
  aktiverTermin: AktiverTerminLike
  flowLinks: FlowLinkRow[]
  fall: FallSnapshot | null
  initialPhase: Phase
  saUnterschrieben: boolean
  fallIdFuerBanner: string | null
}) {
  const latestFlow = flowLinks[0]
  const flowStufe = computeFlowLinkStufe(lead as Parameters<typeof computeFlowLinkStufe>[0], latestFlow)
  const flowStufeBadge = FLOWLINK_STUFE_LABEL[flowStufe]
  const flowLinkGesendet = flowStufe !== 'nicht_gesendet'

  const phase = lead.qualifizierungs_phase ?? 'neu'
  const phaseLabel = PHASE_LABELS_CONST[phase] ?? phase
  const phaseColor = PHASE_BADGES[phase] ?? 'bg-gray-100 text-gray-600'

  return (
    <DispatchPhaseProvider
      initialLead={lead}
      initialTermin={aktiverTermin}
      initialPhase={initialPhase}
    >
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-64px)]">
        {/* Hauptfläche */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/dispatch/leads" className="text-gray-400 hover:text-gray-600">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                {lead.vorname ?? ''} {lead.nachname ?? ''}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* AAR-276: Phase-Badge nur zeigen wenn FlowLink noch nicht
                    versendet ist — sobald der FlowStufe-Badge greift, sagt
                    er das Gleiche granularer (Gesendet/Geöffnet/SA/Vollmacht).
                    Phase-Label „Flow gesendet" wäre dann doppelt. */}
                {!flowLinkGesendet && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${phaseColor}`}>
                    {phaseLabel}
                  </span>
                )}
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${flowStufeBadge.cls}`}>
                  {flowStufeBadge.label}
                </span>
              </div>
            </div>
          </div>

          {/* AAR-631: Lead-Edit-Lockdown nach Conversion — Banner informiert
              Dispatcher dass Stammdaten-Änderungen ab jetzt über die Fallakte
              gemacht werden müssen. saveStammdaten verweigert Writes hier. */}
          {saUnterschrieben && fallIdFuerBanner && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <span className="text-amber-600 text-lg leading-none mt-0.5">ℹ</span>
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-900">Lead ist konvertiert</p>
                <p className="text-amber-800 mt-0.5">
                  Stammdaten-Änderungen jetzt in der Fallakte machen — Lead-Daten sind als
                  Snapshot eingefroren.
                </p>
                <Link
                  href={`/faelle/${fallIdFuerBanner}`}
                  className="inline-block mt-2 text-[#4573A2] hover:underline font-medium"
                >
                  Zur Fallakte →
                </Link>
              </div>
            </div>
          )}

          <PhaseHeader
            flowLinkGesendet={flowLinkGesendet}
            saUnterschrieben={saUnterschrieben}
          />

          <PhaseContent flowLinks={flowLinks} fall={fall} />
        </main>

        {/* Sidebar */}
        <aside className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-[#f8f9fb] overflow-y-auto p-4 space-y-3">
          <TimerWidget />
          <DisqualifizierenButton />
          <RueckrufButton />
          <TerminListeSidebar />
          <GespraechshilfePanel />
          <EinwandKarten />
        </aside>
      </div>
    </DispatchPhaseProvider>
  )
}
