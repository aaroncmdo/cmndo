'use client'

// AAR-179 P3-H + P3-I: Leads-Übersicht mit Toggle zwischen Liste (Tabelle)
// und Kanban (Karten gruppiert nach qualifizierungs_phase). Der Dispatcher
// wechselt zwischen „Schnell-Scan nach Zeit" (Tabelle) und „Was steht wo im
// Funnel?" (Kanban). Name als Link ist schon in beiden Views drin (P3-I).
//
// Aaron 2026-05-19: Realtime-Subscription auf leads-INSERT — wenn ein Lead
// während des Browser-Sessions reinkommt (z. B. von der kfzgutachter-LP),
// wird er live oben in der Liste hinzugefügt und kurz hervorgehoben.

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { PhoneIcon, ExternalLinkIcon, LayoutGridIcon, ListIcon, BellIcon } from 'lucide-react'
import { PHASE_BADGES, PHASE_LABELS, KANBAN_PHASEN } from './leadPhaseConstants'
import PhoneButton from '@/components/shared/PhoneButton'
import { Chip } from '@/components/ui/Chip'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import DensityToggle from '@/components/shared/DensityToggle'
import { useDensityPreference, type Density } from '@/hooks/useDensityPreference'
import { createClient } from '@/lib/supabase/client'

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  qualifizierungs_phase: string | null
  status: string | null
  kunden_konstellation: string | null
  schadens_fall_typ: string | null
  service_typ: string | null
  source_channel: string | null
  flow_link_geoeffnet: boolean | null
  flow_link_abgeschlossen: boolean | null
  whatsapp_verfuegbar: boolean | null
  created_at: string
  updated_at: string
}

// lead_status (neu/rueckruf/quali-offen/flow-gesendet/umgewandelt/umgewandelt-sv/
// disqualifiziert/kalt) ist die grobe Lifecycle-Achse — orthogonal zur
// qualifizierungs_phase (Funnel-Schritt). Terminal-/Warnzustände bekommen
// Farbe, der Normalfall 'neu' bleibt unmarkiert (Redundanz zur Phase vermeiden).
const STATUS_BADGES: Record<string, string> = {
  rueckruf: 'bg-amber-50 text-amber-600',
  'quali-offen': 'bg-claimondo-bg text-claimondo-ondo',
  'flow-gesendet': 'bg-claimondo-ondo/10 text-claimondo-ondo',
  umgewandelt: 'bg-green-100 text-green-700',
  'umgewandelt-sv': 'bg-green-100 text-green-700',
  disqualifiziert: 'bg-red-50 text-red-600',
  kalt: 'bg-claimondo-bg text-claimondo-ondo/60',
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

export default function LeadsViewToggle({ leads: initialLeads }: { leads: Lead[] }) {
  const [view, setView] = useState<'liste' | 'kanban'>('liste')
  const [density] = useDensityPreference('dispatch-leads')
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set())
  const channelInstanceId = useId() // verhindert Channel-Kollision wenn der Component mehrfach mountet

  // Initial-Props syncen, falls Server eine Refresh ausliefert (revalidatePath
  // oder Phase-Filter wechselt → neue Props, lokaler State soll mit ziehen).
  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  // Realtime-Subscription auf neue Leads. Nur INSERT — Updates kommen ueber
  // den Server-Refresh, der reicht für den Status-Wechsel-Use-Case.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dispatch-leads-list:${channelInstanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const fresh = payload.new as Lead
          // Falls Phase-Filter aktiv ist, kommt der Lead trotzdem in den State —
          // der Server-Render filtert beim nächsten Refresh wieder weg, wenn
          // nicht passend. Lieber 1× sichtbar als verpasst.
          setLeads((prev) => {
            if (prev.some((l) => l.id === fresh.id)) return prev
            return [fresh, ...prev]
          })
          setNewLeadIds((prev) => new Set(prev).add(fresh.id))
          // Optional: kurz Audio-Cue (system beep via Web-API), aber lassen
          // wir bewusst weg — kann später als Pref-Toggle nachgezogen werden.

          // Highlight nach 12 s wieder entfernen
          setTimeout(() => {
            setNewLeadIds((prev) => {
              const next = new Set(prev)
              next.delete(fresh.id)
              return next
            })
          }, 12000)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelInstanceId])

  const newCount = newLeadIds.size

  return (
    <div className="space-y-3">
      {/* Segmented Control (Design-Brief §8.1) */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex p-[3px] bg-claimondo-navy/[0.06] rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => setView('liste')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-claimondo-md text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
              view === 'liste'
                ? 'bg-white text-claimondo-navy shadow-[0_1px_2px_rgba(15,30,68,.04),0_3px_8px_rgba(15,30,68,.06)]'
                : 'text-claimondo-shield hover:text-claimondo-navy'
            }`}
          >
            <ListIcon className="w-3.5 h-3.5" />
            Liste
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-claimondo-md text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
              view === 'kanban'
                ? 'bg-white text-claimondo-navy shadow-[0_1px_2px_rgba(15,30,68,.04),0_3px_8px_rgba(15,30,68,.06)]'
                : 'text-claimondo-shield hover:text-claimondo-navy'
            }`}
          >
            <LayoutGridIcon className="w-3.5 h-3.5" />
            Kanban
          </button>
        </div>

        {newCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900"
          >
            <BellIcon className="h-3.5 w-3.5" aria-hidden />
            {newCount === 1
              ? '1 neuer Lead'
              : `${newCount} neue Leads`}{' '}
            soeben eingegangen
          </div>
        )}
      </div>

      {view === 'liste' ? (
        <ListView leads={leads} density={density} highlightIds={newLeadIds} />
      ) : (
        <KanbanView leads={leads} highlightIds={newLeadIds} />
      )}
    </div>
  )
}

function ListView({
  leads,
  density,
  highlightIds,
}: {
  leads: Lead[]
  density: Density
  highlightIds: Set<string>
}) {
  const compact = density === 'compact'
  const rowPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  const cellPadCls = compact ? 'px-3 py-1.5' : 'px-4 py-3'
  return (
    <DataTableContainer variant="plain" className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden border border-claimondo-navy/[0.06]">
        <Table>
          <Thead className="!bg-transparent">
            <Tr className="border-b border-claimondo-navy/[0.08] bg-claimondo-navy/[0.03]">
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Name</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Telefon</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Status</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">FlowLink</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Service</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]">Erstellt</Th>
              <Th className="!font-semibold text-claimondo-shield text-[11px] uppercase tracking-[0.12em]"></Th>
            </Tr>
          </Thead>
          <Tbody className="!divide-claimondo-navy/[0.06]">
            {leads.map((lead) => {
              const fl = flowLinkBadge(lead.flow_link_geoeffnet, lead.flow_link_abgeschlossen)
              const wa = waPill(lead.whatsapp_verfuegbar, lead.telefon)
              return (
                <Tr
                  key={lead.id}
                  className={`transition-colors ${
                    highlightIds.has(lead.id)
                      ? 'bg-emerald-50/70 ring-2 ring-emerald-300 hover:bg-emerald-50'
                      : 'hover:bg-claimondo-navy/[0.03]'
                  }`}
                >
                  <Td>
                    <Link href={`/dispatch/leads/${lead.id}`} className="font-medium text-claimondo-navy hover:text-claimondo-ondo">
                      {lead.vorname} {lead.nachname}
                    </Link>
                    {lead.schadens_fall_typ && (
                      <span className="ml-2 text-[10px] text-claimondo-ondo/70">{lead.schadens_fall_typ}</span>
                    )}
                    {lead.kunden_konstellation && (
                      <span className="ml-1.5 text-[10px] text-claimondo-ondo/50">{lead.kunden_konstellation}</span>
                    )}
                  </Td>
                  <Td className={cellPadCls}>
                    {lead.telefon ? (
                      <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
                    ) : (
                      <span className="text-claimondo-ondo/50">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PHASE_BADGES[lead.qualifizierungs_phase ?? ''] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                        {PHASE_LABELS[lead.qualifizierungs_phase ?? ''] ?? lead.qualifizierungs_phase ?? '—'}
                      </span>
                      {lead.status && STATUS_BADGES[lead.status] && lead.status !== 'neu' && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_BADGES[lead.status]}`}>
                          {lead.status}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className={cellPadCls}>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${fl.cls}`}>{fl.label}</span>
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {lead.service_typ === 'nur_gutachter' ? 'Nur SV' : 'Komplett'}
                  </Td>
                  {/* suppressHydrationWarning: Datums-Formatierung via toLocaleDateString
                      ist server-seitig UTC, client-seitig Europe/Berlin → #418-Mismatch.
                      Der angezeigte Wert ist korrekt, nur das HTML-Attribut weicht ab. */}
                  <Td className="!text-claimondo-ondo/70 text-xs" suppressHydrationWarning>
                    {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </Td>
                  <Td>
                    <Link href={`/dispatch/leads/${lead.id}`} className="text-claimondo-ondo/70 hover:text-claimondo-ondo">
                      <ExternalLinkIcon className="w-4 h-4" />
                    </Link>
                  </Td>
                </Tr>
              )
            })}
            {leads.length === 0 && (
              <Tr>
                <Td colSpan={7} className="!py-12 text-center text-sm !text-claimondo-ondo/70">Keine Leads gefunden</Td>
              </Tr>
            )}
          </Tbody>
        </Table>
    </DataTableContainer>
  )
}

function KanbanView({
  leads,
  highlightIds,
}: {
  leads: Lead[]
  highlightIds: Set<string>
}) {
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
          <div key={phase} className="min-w-[260px] w-[260px] bg-claimondo-navy/[0.04] rounded-2xl p-3 space-y-2 flex-shrink-0 border border-claimondo-navy/[0.06]">
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
                    className={`block rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_2px_6px_rgba(15,30,68,.05)] ${
                      highlightIds.has(lead.id)
                        ? 'border-emerald-300 bg-emerald-50/70 ring-2 ring-emerald-300'
                        : 'border-claimondo-navy/[0.08] bg-white hover:border-claimondo-ondo'
                    }`}
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
                      {/* suppressHydrationWarning: toLocaleDateString UTC vs. Europe/Berlin (#418) */}
                      <span className="text-[9px] text-claimondo-ondo/70 ml-auto" suppressHydrationWarning>
                        {new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
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
