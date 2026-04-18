'use client'

// AAR-179 P3-H + P3-I: Leads-Übersicht mit Toggle zwischen Liste (Tabelle)
// und Kanban (Karten gruppiert nach qualifizierungs_phase). Der Dispatcher
// wechselt zwischen „Schnell-Scan nach Zeit" (Tabelle) und „Was steht wo im
// Funnel?" (Kanban). Name als Link ist schon in beiden Views drin (P3-I).

import { useState } from 'react'
import Link from 'next/link'
import { PhoneIcon, ExternalLinkIcon, LayoutGridIcon, ListIcon } from 'lucide-react'
import { PHASE_BADGES, PHASE_LABELS, KANBAN_PHASEN } from './leadPhaseConstants'
import PhoneButton from '@/components/shared/PhoneButton'

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  qualifizierungs_phase: string | null
  schadens_fall_typ: string | null
  service_typ: string | null
  source_channel: string | null
  flow_link_geoeffnet: boolean | null
  flow_link_abgeschlossen: boolean | null
  created_at: string
  updated_at: string
}

function flowLinkBadge(offen: boolean | null, abgeschlossen: boolean | null): { label: string; cls: string } {
  if (abgeschlossen) return { label: 'Abgeschlossen', cls: 'bg-green-100 text-green-700' }
  if (offen) return { label: 'Offen', cls: 'bg-amber-100 text-amber-700' }
  return { label: '—', cls: 'text-gray-300' }
}

export default function LeadsViewToggle({ leads }: { leads: Lead[] }) {
  const [view, setView] = useState<'liste' | 'kanban'>('liste')

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setView('liste')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            view === 'liste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ListIcon className="w-3.5 h-3.5" />
          Liste
        </button>
        <button
          type="button"
          onClick={() => setView('kanban')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGridIcon className="w-3.5 h-3.5" />
          Kanban
        </button>
      </div>

      {view === 'liste' ? <ListView leads={leads} /> : <KanbanView leads={leads} />}
    </div>
  )
}

function ListView({ leads }: { leads: Lead[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Telefon</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">FlowLink</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Service</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Erstellt</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map((lead) => {
              const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
              return (
                <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dispatch/leads/${lead.id}`} className="font-medium text-gray-900 hover:text-[#4573A2]">
                      {lead.vorname} {lead.nachname}
                    </Link>
                    {lead.schadens_fall_typ && (
                      <span className="ml-2 text-[10px] text-gray-400">{lead.schadens_fall_typ}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {lead.telefon ? (
                      <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {PHASE_LABELS[lead.qualifizierungs_phase ?? ''] ?? lead.qualifizierungs_phase ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dispatch/leads/${lead.id}`} className="text-gray-400 hover:text-[#4573A2]">
                      <ExternalLinkIcon className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Keine Leads gefunden</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KanbanView({ leads }: { leads: Lead[] }) {
  // Kanban-Bucketing: jede DB-Phase muss eine eigene Spalte haben damit Leads
  // nicht stillschweigend in 'neu' verschwinden (Audit-Fix AAR-179 Follow-up).
  const gruppen: Record<string, Lead[]> = {}
  for (const p of KANBAN_PHASEN) gruppen[p] = []
  for (const lead of leads) {
    const k = lead.qualifizierungs_phase ?? 'neu'
    if (gruppen[k]) gruppen[k].push(lead)
    else {
      // Unerwarteter Phase-Wert (neue DB-Enum, fehlt in KANBAN_PHASEN).
      // Wir legen on-the-fly eine Spalte an damit nichts verloren geht.
      gruppen[k] = [lead]
    }
  }

  // Unbekannte Phase-Werte ans Ende hängen damit sie in der UI sichtbar werden
  const phasenOrder = [
    ...KANBAN_PHASEN,
    ...Object.keys(gruppen).filter((k) => !KANBAN_PHASEN.includes(k as typeof KANBAN_PHASEN[number])),
  ]

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {phasenOrder.map((phase) => {
        const bucket = gruppen[phase] ?? []
        return (
          <div key={phase} className="min-w-[260px] w-[260px] bg-gray-50 rounded-xl p-2 space-y-2 flex-shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${PHASE_BADGES[phase] ?? 'bg-gray-200 text-gray-600'}`}>
                {PHASE_LABELS[phase] ?? phase}
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums">{bucket.length}</span>
            </div>
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
              {bucket.map((lead) => {
                const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
                return (
                  <Link
                    key={lead.id}
                    href={`/dispatch/leads/${lead.id}`}
                    className="block bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#4573A2] transition-colors"
                  >
                    <p className="text-xs font-medium text-gray-900 truncate">
                      {lead.vorname} {lead.nachname}
                    </p>
                    {lead.telefon && (
                      <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                        <PhoneIcon className="w-2.5 h-2.5" />
                        {lead.telefon}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                      <span className="text-[9px] text-gray-400 ml-auto">
                        {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </Link>
                )
              })}
              {bucket.length === 0 && (
                <p className="text-[10px] text-gray-300 text-center py-4 italic">Keine Leads</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
