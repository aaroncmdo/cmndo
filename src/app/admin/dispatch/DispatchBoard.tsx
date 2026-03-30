'use client'

import { useState, useTransition, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { updateFallStatus, updateLeadStatus, createLead } from './actions'
import {
  UserPlusIcon,
  PhoneCallIcon,
  PhoneOffIcon,
  ClipboardListIcon,
  SendIcon,
  FileTextIcon,
  CheckCircle2Icon,
  SearchIcon,
  PhoneIcon,
  GlobeIcon,
  MessageCircleIcon,
  UsersIcon,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type Lead = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  status: string
  source_channel: string | null
  kontaktversuche: number | null
  updated_at: string | null
  created_at: string | null
  qualifizierungs_phase: string | null
  schadenfall_typ: string | null
  personenschaden_flag: boolean | null
  mietwagen_flag: boolean | null
  zugewiesen_an: string | null
  rueckruf_datum: string | null
  rueckruf_notiz: string | null
  rueckruf_erledigt: boolean | null
  anruf_versuche: number | null
  letzter_anruf_am: string | null
  letzter_anruf_status: string | null
  flow_link_geoeffnet: boolean | null
  flow_link_abgeschlossen: boolean | null
  sa_unterschrieben: boolean | null
  vollmacht_unterschrieben: boolean | null
  leasing_flag: boolean | null
}

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  sv_id: string | null
  lead_id: string | null
  kundenbetreuer_id: string | null
  onboarding_complete: boolean | null
  regulierung_am: string | null
  status_changed_at: string | null
  updated_at: string | null
  created_at: string
  vorschaden_vorhanden: boolean | null
  vs_eskalationsstufe: string | null
  anschlussschreiben_am: string | null
}

// ─── 7 Kanban-Spalten (BUG-27) ─────────────────────────────────────────────

type Column = { key: string; label: string; sub: string; color: string; bg: string; icon: typeof FileTextIcon }

const COLUMNS: Column[] = [
  { key: 'neu',               label: 'NEU',              sub: 'Noch nicht angerufen',     color: 'text-sky-600',     bg: 'bg-sky-500',     icon: UserPlusIcon },
  { key: 'nicht-erreicht',    label: 'NICHT ERREICHT',   sub: 'Angerufen, kein Kontakt',  color: 'text-red-500',     bg: 'bg-red-500',     icon: PhoneOffIcon },
  { key: 'rueckruf',          label: 'RUECKRUF',         sub: 'Termin vereinbart',        color: 'text-amber-500',   bg: 'bg-amber-500',   icon: PhoneCallIcon },
  { key: 'in-qualifizierung', label: 'IN QUALIFIZIERUNG',sub: 'Im Gespraech',             color: 'text-blue-600',    bg: 'bg-blue-500',    icon: ClipboardListIcon },
  { key: 'flow-versendet',    label: 'FLOW VERSENDET',   sub: 'Wartet auf Kunde',         color: 'text-violet-500',  bg: 'bg-violet-500',  icon: SendIcon },
  { key: 'sa-ausstehend',     label: 'SA AUSSTEHEND',    sub: 'Unterschriften fehlen',    color: 'text-orange-500',  bg: 'bg-orange-500',  icon: FileTextIcon },
  { key: 'konvertiert',       label: 'KONVERTIERT',      sub: 'Lead -> Fallakte',         color: 'text-emerald-600', bg: 'bg-emerald-500', icon: CheckCircle2Icon },
]

function mapPhaseToColumn(phase: string | null): string {
  switch (phase) {
    case 'neu': return 'neu'
    case 'nicht-erreicht': return 'nicht-erreicht'
    case 'rueckruf': return 'rueckruf'
    case 'erstkontakt':
    case 'in-qualifizierung':
    case 'schadentyp-erfasst':
    case 'konstellation-erfasst':
    case 'gegner-daten':
    case 'gutachtertermin':
      return 'in-qualifizierung'
    case 'flow-versendet':
    case 'flow-gesendet':
      return 'flow-versendet'
    case 'sa-ausstehend':
    case 'sa-unterschrieben':
      return 'sa-ausstehend'
    case 'konvertiert':
    case 'abgeschlossen':
      return 'konvertiert'
    default: return 'neu'
  }
}

const SOURCE_ICON: Record<string, typeof GlobeIcon> = {
  website: GlobeIcon, 'google-ads': GlobeIcon,
  telefon: PhoneIcon, email: GlobeIcon,
  whatsapp: MessageCircleIcon, empfehlung: UsersIcon,
}

const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', telefon: 'Telefon', email: 'E-Mail',
  whatsapp: 'WhatsApp', empfehlung: 'Empfehlung', 'google-ads': 'Google',
}

const SF_SHORT: Record<string, string> = {
  'sf-01': 'SF-01', 'sf-02': 'SF-02', 'sf-03': 'SF-03',
  'sf-04': 'SF-04', 'sf-05': 'SF-05', 'sf-06': 'SF-06',
}

function timeSince(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `${Math.floor(ms / 60000)}min`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function DispatchBoard({
  leads,
  faelle,
  leadNameMap,
  svMap,
  betreuerMap,
  currentUserId,
}: {
  leads: Lead[]
  faelle: Fall[]
  leadNameMap: Record<string, string>
  svMap: Record<string, string>
  betreuerMap: Record<string, string>
  currentUserId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [newLead, setNewLead] = useState({ vorname: '', nachname: '', telefon: '+491633628571', email: '', source_channel: 'telefon', schadenfall_typ: '' })
  const [newLeadSaving, setNewLeadSaving] = useState(false)
  const [showDisqualifiziert, setShowDisqualifiziert] = useState(false)

  const disqualifiziertCount = useMemo(() => leads.filter(l => l.status === 'disqualifiziert' || l.qualifizierungs_phase === 'disqualifiziert').length, [leads])

  const pipelineLeads = useMemo(() => {
    return leads.filter(l => {
      if (l.status === 'disqualifiziert' || l.status === 'kalt' || l.qualifizierungs_phase === 'disqualifiziert') return false
      if (search) {
        const q = search.toLowerCase()
        const name = `${l.vorname ?? ''} ${l.nachname ?? ''}`.toLowerCase()
        if (!name.includes(q) && !(l.email ?? '').toLowerCase().includes(q) && !(l.telefon ?? '').includes(q)) return false
      }
      return true
    })
  }, [leads, search])

  const disqualifiziertLeads = useMemo(() => {
    return leads.filter(l => l.status === 'disqualifiziert' || l.qualifizierungs_phase === 'disqualifiziert')
  }, [leads])

  // Heutige Rueckrufe
  const now = Date.now()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const heutigeRueckrufe = useMemo(() => {
    return leads
      .filter(l => {
        if (!l.rueckruf_datum || l.rueckruf_erledigt) return false
        const t = new Date(l.rueckruf_datum).getTime()
        return t <= todayEnd.getTime()
      })
      .sort((a, b) => new Date(a.rueckruf_datum!).getTime() - new Date(b.rueckruf_datum!).getTime())
  }, [leads, todayEnd])

  // Sort leads per column
  const sortedByColumn = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const col of COLUMNS) {
      const items = pipelineLeads.filter(l => mapPhaseToColumn(l.qualifizierungs_phase) === col.key)
      items.sort((a, b) => {
        if (col.key === 'rueckruf') return new Date(a.rueckruf_datum ?? '9999').getTime() - new Date(b.rueckruf_datum ?? '9999').getTime()
        if (col.key === 'konvertiert') return new Date(b.updated_at ?? '0').getTime() - new Date(a.updated_at ?? '0').getTime()
        return new Date(a.created_at ?? '0').getTime() - new Date(b.created_at ?? '0').getTime()
      })
      map[col.key] = items
    }
    return map
  }, [pipelineLeads])

  // ─── Drag-and-Drop handler ─────────────────────────────────────
  const onDragEnd = useCallback((result: DropResult) => {
    const { draggableId, destination, source } = result
    if (!destination || destination.droppableId === source.droppableId) return

    const newPhase = destination.droppableId
    const lead = pipelineLeads.find(l => l.id === draggableId)
    if (!lead) return

    // Validation
    if (newPhase === 'konvertiert') {
      if (!lead.sa_unterschrieben || !lead.vollmacht_unterschrieben) {
        showToast('SA und Vollmacht muessen zuerst unterschrieben sein')
        return
      }
    }
    if (newPhase === 'flow-versendet') {
      if (!lead.schadenfall_typ) {
        showToast('Schadentyp muss zuerst gesetzt werden')
        return
      }
    }
    if (newPhase === 'rueckruf') {
      if (!lead.rueckruf_datum) {
        showToast('Bitte zuerst Rueckruf-Datum im Lead-Detail setzen')
        return
      }
    }

    setError(null)
    startTransition(async () => {
      try {
        await updateLeadStatus(draggableId, newPhase)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }, [pipelineLeads, router, startTransition])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="px-3 py-2 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="max-w-full mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header - compact */}
        <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-gray-900">Dispatch</h1>
            <span className="text-gray-500 text-xs">
              {pipelineLeads.length} Leads
              {disqualifiziertCount > 0 && (
                <button onClick={() => setShowDisqualifiziert(!showDisqualifiziert)}
                  className="ml-2 text-red-500 hover:text-red-400 transition-colors">
                  ({disqualifiziertCount} disq.)
                </button>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNewLead(!showNewLead)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5">
              <UserPlusIcon className="w-3.5 h-3.5" /> Neuer Lead
            </button>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
                className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-lg animate-fade-in-up">
            <p className="text-red-700 text-sm font-medium">{toast}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Neuer Lead Formular */}
        {showNewLead && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Neuer Lead</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <input placeholder="Vorname *" value={newLead.vorname} onChange={e => setNewLead(p => ({ ...p, vorname: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="Nachname *" value={newLead.nachname} onChange={e => setNewLead(p => ({ ...p, nachname: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="Telefon *" value={newLead.telefon} onChange={e => setNewLead(p => ({ ...p, telefon: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="E-Mail" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select value={newLead.source_channel} onChange={e => setNewLead(p => ({ ...p, source_channel: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2">
                <option value="telefon">Telefon</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="empfehlung">Empfehlung</option><option value="google-ads">Google Ads</option>
              </select>
              <select value={newLead.schadenfall_typ} onChange={e => setNewLead(p => ({ ...p, schadenfall_typ: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2">
                <option value="">Schadentyp (optional)</option><option value="sf-01">SF-01 Unfall mit Gegner</option><option value="sf-02">SF-02 Teilschuld</option><option value="sf-03">SF-03 Parkschaden</option><option value="sf-05">SF-05 Personenschaden</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button disabled={newLeadSaving || !newLead.vorname.trim() || !newLead.nachname.trim()}
                onClick={async () => {
                  setNewLeadSaving(true)
                  try { await createLead(newLead); setShowNewLead(false); setNewLead({ vorname: '', nachname: '', telefon: '+491633628571', email: '', source_channel: 'telefon', schadenfall_typ: '' }); router.refresh() }
                  catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
                  setNewLeadSaving(false)
                }}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                {newLeadSaving ? 'Erstellt...' : 'Lead erstellen'}
              </button>
              <button onClick={() => setShowNewLead(false)} className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2">Abbrechen</button>
            </div>
          </div>
        )}

        {/* Heutige Rueckrufe - compact */}
        {heutigeRueckrufe.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 mb-2 shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <PhoneCallIcon className="w-3.5 h-3.5 text-amber-600" />
              <h3 className="text-xs font-semibold text-amber-700">Rueckrufe heute ({heutigeRueckrufe.length})</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {heutigeRueckrufe.map(lead => {
                const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
                const time = new Date(lead.rueckruf_datum!)
                const isOverdue = time.getTime() < now
                const minutesUntil = Math.round((time.getTime() - now) / 60000)
                return (
                  <Link key={lead.id} href={`/admin/dispatch/lead/${lead.id}`}
                    className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors border border-gray-100">
                    <span className={`text-xs font-bold tabular-nums shrink-0 w-20 ${isOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                      {isOverdue ? 'UEBERFAELLIG' : time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isOverdue && minutesUntil > 0 && minutesUntil < 120 && (
                      <span className="text-[10px] text-amber-500 shrink-0">In {minutesUntil}min</span>
                    )}
                    <div className="min-w-0 flex-1"><p className="text-gray-800 text-sm truncate">{name}</p></div>
                    {lead.telefon && (
                      <a href={`tel:${lead.telefon}`} onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 text-green-600 text-xs font-medium hover:bg-green-100 shrink-0">
                        <PhoneIcon className="w-3 h-3" /> Anrufen
                      </a>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Disqualifizierte Leads */}
        {showDisqualifiziert && disqualifiziertLeads.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Disqualifizierte Leads ({disqualifiziertLeads.length})</h3>
            <div className="space-y-1.5">
              {disqualifiziertLeads.map(lead => (
                <Link key={lead.id} href={`/admin/dispatch/lead/${lead.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white hover:bg-gray-50 transition-colors border border-gray-100">
                  <span className="text-gray-700 text-sm truncate flex-1">{`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'}</span>
                  <span className="text-red-400 text-xs">{(lead as Record<string, unknown>).disqualifiziert_grund as string ?? ''}</span>
                  <span className="text-gray-400 text-xs">{lead.created_at ? new Date(lead.created_at).toLocaleDateString('de-DE') : ''}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Kanban-Board with Drag-and-Drop - fills remaining height */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 min-h-0 overflow-x-auto">
            <div className="flex gap-1.5 h-full">
              {COLUMNS.map(col => {
                const Icon = col.icon
                const sorted = sortedByColumn[col.key] ?? []

                return (
                  <div key={col.key} className="min-w-[160px] flex-1 flex flex-col h-full">
                    <div className="mb-1.5 px-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${col.color}`} />
                        <span className={`text-[10px] font-bold tracking-wide uppercase ${col.color}`}>{col.label}</span>
                        <span className="text-gray-500 text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded-full ml-auto">{sorted.length}</span>
                      </div>
                    </div>
                    <div className={`h-0.5 ${col.bg} rounded-full mb-1.5 opacity-40 shrink-0`} />

                    <Droppable droppableId={col.key}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-1.5 flex-1 overflow-y-auto rounded-lg p-1 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-blue-50 border-2 border-dashed border-blue-300' : ''
                          }`}
                        >
                          {sorted.length === 0 && !snapshot.isDraggingOver && (
                            <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center">
                              <p className="text-gray-300 text-[10px]">Leer</p>
                            </div>
                          )}
                          {sorted.map((lead, index) => (
                            <Draggable key={lead.id} draggableId={lead.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className={`transition-shadow ${dragSnapshot.isDragging ? 'opacity-80 shadow-xl' : ''}`}
                                >
                                  <LeadCard lead={lead} columnKey={col.key} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </div>
        </DragDropContext>
      </div>
    </div>
  )
}

// ─── Lead Card (no dropdown, drag-only) ──────────────────────────────────────

function LeadCard({ lead, columnKey }: { lead: Lead; columnKey: string }) {
  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
  const age = timeSince(lead.created_at)
  const SourceIcon = SOURCE_ICON[lead.source_channel ?? ''] ?? GlobeIcon

  const hasCallback = !!lead.rueckruf_datum && !lead.rueckruf_erledigt
  const callbackInPast = hasCallback && new Date(lead.rueckruf_datum!) < new Date()

  return (
    <div className="bg-white rounded-lg p-2 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing">
      {/* Rueckruf Badge */}
      {hasCallback && (
        <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded mb-1 ${
          callbackInPast ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
        }`}>
          {callbackInPast ? 'UEBERFAELLIG' : `RR ${new Date(lead.rueckruf_datum!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      {/* Name + Age */}
      <div className="flex items-center justify-between mb-0.5">
        <Link href={`/admin/dispatch/lead/${lead.id}`} className="text-gray-800 text-sm font-medium leading-snug truncate hover:text-blue-600 transition-colors flex-1 min-w-0"
          onClick={e => e.stopPropagation()}>
          {name}
        </Link>
        <span className="text-[10px] text-gray-400 shrink-0 ml-1">{age}</span>
      </div>

      {/* Telefon */}
      {lead.telefon && (
        <a href={`tel:${lead.telefon}`} onClick={e => e.stopPropagation()}
          className="text-blue-500 hover:text-blue-600 text-[11px] mb-1.5 block truncate transition-colors">
          {lead.telefon}
        </a>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        <span className="bg-gray-100 text-gray-500 text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
          <SourceIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel}
        </span>
        {lead.schadenfall_typ && (
          <span className="bg-blue-50 text-blue-600 text-[9px] font-medium px-1.5 py-0.5 rounded">
            {SF_SHORT[lead.schadenfall_typ] ?? lead.schadenfall_typ}
          </span>
        )}
        {lead.personenschaden_flag && <span className="bg-red-50 text-red-500 text-[9px] px-1 py-0.5 rounded">Pers.</span>}
        {lead.mietwagen_flag && <span className="bg-amber-50 text-amber-500 text-[9px] px-1 py-0.5 rounded">MW</span>}
        {lead.leasing_flag && <span className="bg-purple-50 text-purple-500 text-[9px] px-1 py-0.5 rounded">Leasing</span>}
      </div>

      {/* Column-specific info */}
      {columnKey === 'nicht-erreicht' && (
        <div className="text-[10px] text-red-500 mb-1">
          {lead.anruf_versuche ?? 0}x nicht erreicht
          {lead.letzter_anruf_am && <span className="text-gray-400"> &middot; {timeSince(lead.letzter_anruf_am)}</span>}
        </div>
      )}
      {columnKey === 'rueckruf' && lead.rueckruf_notiz && (
        <p className="text-[10px] text-gray-500 truncate mb-1">{lead.rueckruf_notiz}</p>
      )}
      {columnKey === 'flow-versendet' && (
        <div className="text-[10px] text-gray-500 mb-1">
          {lead.flow_link_abgeschlossen ? <span className="text-emerald-600">FlowLink abgeschlossen</span>
            : lead.flow_link_geoeffnet ? <span className="text-blue-500">FlowLink geoeffnet</span>
            : <span>Wartet seit {timeSince(lead.updated_at)}</span>}
        </div>
      )}
      {columnKey === 'sa-ausstehend' && (
        <div className="text-[10px] text-orange-500 mb-1">
          {!lead.sa_unterschrieben && !lead.vollmacht_unterschrieben ? 'SA + Vollmacht fehlen'
            : !lead.sa_unterschrieben ? 'SA fehlt'
            : 'Vollmacht fehlt'}
        </div>
      )}
      {columnKey === 'konvertiert' && lead.status === 'umgewandelt' && (
        <div className="text-[10px] text-emerald-600 mb-1">Fallakte erstellt</div>
      )}
    </div>
  )
}
