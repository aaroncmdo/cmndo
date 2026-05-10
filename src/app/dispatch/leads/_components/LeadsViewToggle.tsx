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
import { Chip } from '@/components/ui/Chip'
import DensityToggle from '@/components/shared/DensityToggle'
import { useDensityPreference, type Density } from '@/hooks/useDensityPreference'

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
  whatsapp_verfuegbar: boolean | null
  created_at: string
  updated_at: string
}

function waPill(verfuegbar: boolean | null, telefon: string | null): { label: string; cls: string } | null {
  if (!telefon) return null
  if (verfuegbar === true) return { label: '📱 WA', cls: 'bg-emerald-100 text-emerald-700' }
  if (verfuegbar === false) return { label: '📵', cls: 'bg-claimondo-bg text-claimondo-ondo/50' }
  return { label: '⏳ WA?', cls: 'bg-amber-50 text-amber-600' }
}

function flowLinkBadge(offen: boolean | null, abgeschlossen: boolean | null): { label: string; cls: string } {
  if (abgeschlossen) return { label: 'Abgeschlossen', cls: 'bg-green-100 text-green-700' }
  if (offen) return { label: 'Offen', cls: 'bg-amber-100 text-amber-700' }
  return { label: '—', cls: 'text-claimondo-ondo/50' }
}

export default function LeadsViewToggle({ leads }: { leads: Lead[] }) {
  const [view, setView] = useState<'liste' | 'kanban'>('liste')
  const [density] = useDensityPreference('dispatch-leads')

  return (
    <div className="space-y-3">
      {/* Toggle-Reihe — View-Toggle links + DensityToggle rechts (nur in
          Liste-View, im Kanban macht Density wenig Unterschied). */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 w-fit">
          <Chip
            variant={view === 'liste' ? 'selected' : 'default'}
            onClick={() => setView('liste')}
          >
            <ListIcon className="w-3.5 h-3.5" />
            Liste
          </Chip>
          <Chip
            variant={view === 'kanban' ? 'selected' : 'default'}
            onClick={() => setView('kanban')}
          >
            <LayoutGridIcon className="w-3.5 h-3.5" />
            Kanban
          </Chip>
        </div>
        {view === 'liste' && <DensityToggle listKey="dispatch-leads" />}
      </div>

      {view === 'liste' ? <ListView leads={leads} density={density} /> : <KanbanView leads={leads} />}
    </div>
  )
}

function ListView({ leads, density }: { leads: Lead[]; density: Density }) {
  const compact = density === 'compact'
  const rowPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  const cellPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  return (
    <div className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
      {/* Mobile/Tablet-Card-Liste (<lg) — Portal-Review D3 */}
      <div className="lg:hidden divide-y divide-claimondo-border">
        {leads.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-claimondo-ondo/70">Keine Leads gefunden</p>
        ) : leads.map((lead) => {
          const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
          const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
          return (
            <Link
              key={lead.id}
              href={`/dispatch/leads/${lead.id}`}
              className={`flex items-start justify-between gap-3 hover:bg-claimondo-bg active:bg-claimondo-ondo/5 transition-colors ${rowPadCls}`}
            >
              <div className={`flex-1 min-w-0 ${compact ? 'space-y-0.5' : 'space-y-1.5'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-claimondo-navy truncate">
                    {lead.vorname} {lead.nachname}
                  </p>
                  <span className="text-[10px] text-claimondo-ondo/70 shrink-0 tabular-nums">
                    {new Date(lead.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase ?? ''] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                    {PHASE_LABELS[lead.qualifizierungs_phase ?? ''] ?? lead.qualifizierungs_phase ?? '—'}
                  </span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                  {wa && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${wa.cls}`}>{wa.label}</span>
                  )}
                  <span className="text-[10px] text-claimondo-ondo">
                    {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-claimondo-ondo/80">
                  {lead.telefon ? (
                    <span className="truncate">{lead.telefon}</span>
                  ) : (
                    <span className="text-claimondo-ondo/50">Keine Telefonnummer</span>
                  )}
                  {lead.schadens_fall_typ && (
                    <>
                      <span className="text-claimondo-ondo/40">·</span>
                      <span className="truncate">{lead.schadens_fall_typ}</span>
                    </>
                  )}
                </div>
              </div>
              <ExternalLinkIcon className="w-4 h-4 text-claimondo-ondo/60 shrink-0 mt-0.5" />
            </Link>
          )
        })}
      </div>

      {/* Desktop-Tabelle (lg+) */}
      <div className="overflow-x-auto hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-claimondo-border bg-claimondo-bg/50">
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>Name</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>Telefon</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>WA</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>Status</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>FlowLink</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>Service</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}>Erstellt</th>
              <th className={`text-left ${cellPadCls} font-medium text-claimondo-ondo text-xs`}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claimondo-border">
            {leads.map((lead) => {
              const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
              const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
              return (
                <tr key={lead.id} className="hover:bg-claimondo-bg/50 transition-colors">
                  <td className={cellPadCls}>
                    <Link href={`/dispatch/leads/${lead.id}`} className="font-medium text-claimondo-navy hover:text-claimondo-ondo">
                      {lead.vorname} {lead.nachname}
                    </Link>
                    {lead.schadens_fall_typ && (
                      <span className="ml-2 text-[10px] text-claimondo-ondo/70">{lead.schadens_fall_typ}</span>
                    )}
                  </td>
                  <td className={cellPadCls}>
                    {lead.telefon ? (
                      <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
                    ) : (
                      <span className="text-claimondo-ondo/50">—</span>
                    )}
                  </td>
                  <td className={cellPadCls}>
                    {wa ? (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${wa.cls}`}>{wa.label}</span>
                    ) : (
                      <span className="text-claimondo-ondo/40 text-[10px]">—</span>
                    )}
                  </td>
                  <td className={cellPadCls}>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase ?? ''] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                      {PHASE_LABELS[lead.qualifizierungs_phase ?? ''] ?? lead.qualifizierungs_phase ?? '—'}
                    </span>
                  </td>
                  <td className={cellPadCls}>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                  </td>
                  <td className={`${cellPadCls} text-xs text-claimondo-ondo`}>
                    {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                  </td>
                  <td className={`${cellPadCls} text-xs text-claimondo-ondo/70`}>
                    {new Date(lead.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className={cellPadCls}>
                    <Link href={`/dispatch/leads/${lead.id}`} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
                      <ExternalLinkIcon className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-claimondo-ondo/70">Keine Leads gefunden</td>
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
          <div key={phase} className="min-w-[260px] w-[260px] bg-claimondo-bg rounded-xl p-2 space-y-2 flex-shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${PHASE_BADGES[phase] ?? 'bg-claimondo-border text-claimondo-ondo'}`}>
                {PHASE_LABELS[phase] ?? phase}
              </span>
              <span className="text-[10px] text-claimondo-ondo/70 tabular-nums">{bucket.length}</span>
            </div>
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
              {bucket.map((lead) => {
                const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
                const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
                return (
                  <Link
                    key={lead.id}
                    href={`/dispatch/leads/${lead.id}`}
                    className="block bg-white rounded-lg border border-claimondo-border p-2.5 hover:border-claimondo-ondo transition-colors"
                  >
                    <p className="text-xs font-medium text-claimondo-navy truncate">
                      {lead.vorname} {lead.nachname}
                    </p>
                    {lead.telefon && (
                      <p className="text-[10px] text-claimondo-ondo flex items-center gap-1 mt-0.5">
                        <PhoneIcon className="w-2.5 h-2.5" />
                        {lead.telefon}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                      {wa && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${wa.cls}`}>{wa.label}</span>
                      )}
                      <span className="text-[9px] text-claimondo-ondo/70 ml-auto">
                        {new Date(lead.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </Link>
                )
              })}
              {bucket.length === 0 && (
                <p className="text-[10px] text-claimondo-ondo/50 text-center py-4 italic">Keine Leads</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
