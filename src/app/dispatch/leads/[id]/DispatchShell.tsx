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
  GespraechshilfePanel,
  EinwandKarten,
} from './sidebar/SidebarStubs'
import { computeFlowLinkStufe, FLOWLINK_STUFE_LABEL } from '@/lib/dispatch/fahrzeug-marken'

type FlowLinkRow = {
  id: string
  token: string
  status: string
  created_at: string
  expires_at: string
}

type CallRow = {
  id: string
  direction: string
  started_at: string
  duration: number | null
  status: string | null
}

const PHASE_LABELS: Record<string, string> = {
  neu: 'Neu',
  'nicht-erreicht': 'Nicht erreicht',
  rueckruf: 'Rückruf',
  'in-qualifizierung': 'In Qualifizierung',
  'flow-versendet': 'Flow gesendet',
  'sa-ausstehend': 'SA ausstehend',
  konvertiert: 'Konvertiert',
  disqualifiziert: 'Disqualifiziert',
  kalt: 'Kalt',
}

const PHASE_COLORS: Record<string, string> = {
  neu: 'bg-blue-100 text-blue-700',
  'nicht-erreicht': 'bg-gray-100 text-gray-600',
  rueckruf: 'bg-amber-100 text-amber-700',
  'in-qualifizierung': 'bg-violet-100 text-violet-700',
  'flow-versendet': 'bg-emerald-100 text-emerald-700',
  konvertiert: 'bg-green-100 text-green-800',
  disqualifiziert: 'bg-red-100 text-red-700',
  kalt: 'bg-gray-200 text-gray-500',
}

export default function DispatchShell({
  lead,
  aktiverTermin,
  flowLinks,
  calls,
  initialPhase,
  saUnterschrieben,
}: {
  lead: LeadLike & {
    id: string
    vorname?: string | null
    nachname?: string | null
    qualifizierungs_phase?: string | null
  }
  aktiverTermin: AktiverTerminLike
  flowLinks: FlowLinkRow[]
  calls: CallRow[]
  initialPhase: Phase
  saUnterschrieben: boolean
}) {
  const latestFlow = flowLinks[0]
  const flowStufe = computeFlowLinkStufe(lead as Parameters<typeof computeFlowLinkStufe>[0], latestFlow)
  const flowStufeBadge = FLOWLINK_STUFE_LABEL[flowStufe]
  const flowLinkGesendet = flowStufe !== 'nicht_gesendet'

  const phase = lead.qualifizierungs_phase ?? 'neu'
  const phaseLabel = PHASE_LABELS[phase] ?? phase
  const phaseColor = PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-600'

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
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${phaseColor}`}>
                  {phaseLabel}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${flowStufeBadge.cls}`}>
                  {flowStufeBadge.label}
                </span>
              </div>
            </div>
          </div>

          <PhaseHeader
            flowLinkGesendet={flowLinkGesendet}
            saUnterschrieben={saUnterschrieben}
          />

          <PhaseContent flowLinks={flowLinks} calls={calls} />
        </main>

        {/* Sidebar */}
        <aside className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-[#f8f9fb] overflow-y-auto p-4 space-y-3">
          <TimerWidget />
          <DisqualifizierenButton />
          <RueckrufButton />
          <GespraechshilfePanel />
          <EinwandKarten />
        </aside>
      </div>
    </DispatchPhaseProvider>
  )
}
