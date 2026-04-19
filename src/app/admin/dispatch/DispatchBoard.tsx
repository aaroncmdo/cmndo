'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import RueckrufModal from '@/components/RueckrufModal'
import PhoneButton from '@/components/shared/PhoneButton'
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
  XIcon,
  FilterIcon,
  ExternalLinkIcon,
  MailIcon,
  ClockIcon,
  AlertTriangleIcon,
  CarIcon,
  LayoutGridIcon,
  TableIcon,
  ColumnsIcon,
  ArrowUpDownIcon,
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
  schadens_fall_typ: string | null
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
  finanzierung_leasing: string | null
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
  hat_vorschaeden: boolean | null
  vs_eskalationsstufe: string | null
  anschlussschreiben_am: string | null
}

// ─── 7 Kanban-Spalten (BUG-27) ─────────────────────────────────────────────

type Column = { key: string; label: string; sub: string; color: string; bg: string; icon: typeof FileTextIcon }

const COLUMNS: Column[] = [
  { key: 'neu',               label: 'NEU',              sub: 'Noch nicht angerufen',     color: 'text-sky-600',     bg: 'bg-sky-500',     icon: UserPlusIcon },
  { key: 'nicht-erreicht',    label: 'NICHT ERREICHT',   sub: 'Angerufen, kein Kontakt',  color: 'text-red-500',     bg: 'bg-red-500',     icon: PhoneOffIcon },
  { key: 'rueckruf',          label: 'RUECKRUF',         sub: 'Termin vereinbart',        color: 'text-amber-500',   bg: 'bg-amber-500',   icon: PhoneCallIcon },
  { key: 'in-qualifizierung', label: 'IN QUALIFIZIERUNG',sub: 'Im Gespraech',             color: 'text-[#4573A2]',    bg: 'bg-[#4573A2]',    icon: ClipboardListIcon },
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
  telefon: PhoneIcon, email: MailIcon,
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

const SF_LABELS: Record<string, string> = {
  'sf-01': 'Unfall mit Gegner',
  'sf-02': 'Teilschuld',
  'sf-03': 'Parkschaden',
  'sf-04': 'Eigenverschulden',
  'sf-05': 'Personenschaden',
  'sf-06': 'Sonstiges',
}

function timeSince(dateStr: string | null): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `${Math.floor(ms / 60000)}min`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Filter Chip ────────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
        active
          ? 'bg-[#4573A2] text-white border-[#4573A2]'
          : 'bg-white text-gray-600 border-gray-200 hover:border-[#4573A2]/40 hover:text-[#4573A2]'
      }`}
    >
      {label}
    </button>
  )
}

// ─── Phase Progress Mini ────────────────────────────────────────────────────

const PHASES = [
  { key: 'neu', label: 'Neu' },
  { key: 'erstkontakt', label: 'Kontakt' },
  { key: 'schadentyp-erfasst', label: 'Typ' },
  { key: 'konstellation-erfasst', label: 'Konst.' },
  { key: 'gegner-daten', label: 'Gegner' },
  { key: 'gutachtertermin', label: 'Termin' },
  { key: 'sa-unterschrieben', label: 'SA' },
  { key: 'flow-gesendet', label: 'Flow' },
  { key: 'abgeschlossen', label: 'Fertig' },
]

function PhaseProgressMini({ phase }: { phase: string }) {
  const idx = PHASES.findIndex(p => p.key === phase)
  return (
    <div className="flex items-center gap-0.5">
      {PHASES.map((p, i) => (
        <div key={p.key} className="flex-1 flex flex-col items-center gap-0.5">
          <div className={`w-full h-1 rounded-full ${i <= idx ? 'bg-[#4573A2]' : 'bg-gray-100'}`} />
          <span className={`text-[8px] ${i <= idx ? 'text-[#4573A2]' : 'text-gray-300'}`}>{p.label}</span>
        </div>
      ))}
    </div>
  )
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
  const [localLeads, setLocalLeads] = useState(leads)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [newLead, setNewLead] = useState({ vorname: '', nachname: '', telefon: '', email: '', source_channel: 'telefon', schadens_fall_typ: '' })
  const [newLeadSaving, setNewLeadSaving] = useState(false)
  const [showDisqualifiziert, setShowDisqualifiziert] = useState(false)
  const [rueckrufModalLead, setRueckrufModalLead] = useState<Lead | null>(null)

  // Split-View state
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // View mode: kanban | karten | tabelle
  type ViewMode = 'kanban' | 'karten' | 'tabelle'
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  // Table sort
  const [sortField, setSortField] = useState<'name' | 'created_at' | 'source' | 'phase' | 'schadentyp'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Live-Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [filterSources, setFilterSources] = useState<string[]>([])
  const [filterSchadenTyp, setFilterSchadenTyp] = useState<string[]>([])
  const [filterPersonenschaden, setFilterPersonenschaden] = useState(false)
  const [filterMietwagen, setFilterMietwagen] = useState(false)
  const [filterLeasing, setFilterLeasing] = useState(false)

  const hasActiveFilters = filterSources.length > 0 || filterSchadenTyp.length > 0 || filterPersonenschaden || filterMietwagen || filterLeasing

  // Sync props → local state when server data changes
  useEffect(() => { setLocalLeads(leads) }, [leads])

  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null
    return localLeads.find(l => l.id === selectedLeadId) ?? null
  }, [selectedLeadId, localLeads])

  const disqualifiziertCount = useMemo(() => localLeads.filter(l => l.status === 'disqualifiziert' || l.qualifizierungs_phase === 'disqualifiziert').length, [localLeads])

  const pipelineLeads = useMemo(() => {
    return localLeads.filter(l => {
      if (l.status === 'disqualifiziert' || l.status === 'kalt' || l.qualifizierungs_phase === 'disqualifiziert') return false
      // Text search
      if (search) {
        const q = search.toLowerCase()
        const name = `${l.vorname ?? ''} ${l.nachname ?? ''}`.toLowerCase()
        if (!name.includes(q) && !(l.email ?? '').toLowerCase().includes(q) && !(l.telefon ?? '').includes(q)) return false
      }
      // Source filter
      if (filterSources.length > 0 && !filterSources.includes(l.source_channel ?? '')) return false
      // Schadentyp filter
      if (filterSchadenTyp.length > 0 && !filterSchadenTyp.includes(l.schadens_fall_typ ?? '')) return false
      // Flag filters
      if (filterPersonenschaden && !l.personenschaden_flag) return false
      if (filterMietwagen && !l.mietwagen_flag) return false
      if (filterLeasing && l.finanzierung_leasing !== 'leasing') return false
      return true
    })
  }, [localLeads, search, filterSources, filterSchadenTyp, filterPersonenschaden, filterMietwagen, filterLeasing])

  const disqualifiziertLeads = useMemo(() => {
    return leads.filter(l => l.status === 'disqualifiziert' || l.qualifizierungs_phase === 'disqualifiziert')
  }, [leads])

  // Heutige Rueckrufe
  const now = Date.now()
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

    if (newPhase === 'konvertiert') {
      if (!lead.sa_unterschrieben || !lead.vollmacht_unterschrieben) {
        showToast('SA und Vollmacht muessen zuerst unterschrieben sein')
        return
      }
    }
    if (newPhase === 'flow-versendet') {
      if (!lead.schadens_fall_typ) {
        showToast('Schadentyp muss zuerst gesetzt werden')
        return
      }
    }
    if (newPhase === 'rueckruf') {
      setRueckrufModalLead(lead)
      return
    }

    const snapshot = [...localLeads]
    setLocalLeads(prev => prev.map(l => l.id === draggableId ? { ...l, qualifizierungs_phase: newPhase } : l))

    updateLeadStatus(draggableId, newPhase).catch(e => {
      setLocalLeads(snapshot)
      showToast(e instanceof Error ? e.message : 'Fehler beim Speichern')
    })
  }, [pipelineLeads, localLeads])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function toggleFilter<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]
  }

  function clearAllFilters() {
    setFilterSources([])
    setFilterSchadenTyp([])
    setFilterPersonenschaden(false)
    setFilterMietwagen(false)
    setFilterLeasing(false)
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="w-full flex flex-col flex-1 min-h-0">
        {/* ─── Sticky Header ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 flex-shrink-0">
          {/* Row 1: Title + Actions */}
          <div className="flex items-center justify-between px-4 py-2 h-10">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-gray-900">Dispatch</h1>
              <span className="text-gray-500 text-xs">
                {pipelineLeads.length} Leads
                {disqualifiziertCount > 0 && (
                  <button onClick={() => setShowDisqualifiziert(!showDisqualifiziert)}
                    className="ml-2 text-red-500 hover:text-red-400 transition-colors">
                    ({disqualifiziertCount} disq.)
                  </button>
                )}
              </span>
              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-2">
                <button onClick={() => setViewMode('kanban')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${viewMode === 'kanban' ? 'bg-white text-[#4573A2] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <ColumnsIcon className="w-3 h-3" /> Kanban
                </button>
                <button onClick={() => setViewMode('karten')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${viewMode === 'karten' ? 'bg-white text-[#4573A2] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <LayoutGridIcon className="w-3 h-3" /> Karten
                </button>
                <button onClick={() => setViewMode('tabelle')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${viewMode === 'tabelle' ? 'bg-white text-[#4573A2] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <TableIcon className="w-3 h-3" /> Tabelle
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 h-7 border ${
                  hasActiveFilters
                    ? 'bg-[#4573A2]/10 text-[#4573A2] border-[#4573A2]/30'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                <FilterIcon className="w-3 h-3" />
                Filter
                {hasActiveFilters && (
                  <span className="bg-[#4573A2] text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                    {filterSources.length + filterSchadenTyp.length + (filterPersonenschaden ? 1 : 0) + (filterMietwagen ? 1 : 0) + (filterLeasing ? 1 : 0)}
                  </span>
                )}
              </button>
              <button onClick={() => setShowNewLead(!showNewLead)}
                className="bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 h-7">
                <UserPlusIcon className="w-3 h-3" /> Neu
              </button>
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
                  className="pl-7 pr-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#4573A2] w-40 h-7" />
              </div>
            </div>
          </div>

          {/* Row 2: Live-Filter Chips */}
          {showFilters && (
            <div className="px-4 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-50 pt-2">
              {/* Source */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mr-1">Quelle</span>
                {Object.entries(SOURCE_LABEL).map(([key, label]) => (
                  <FilterChip key={key} label={label} active={filterSources.includes(key)} onClick={() => setFilterSources(prev => toggleFilter(prev, key))} />
                ))}
              </div>
              {/* Schadentyp */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mr-1">Typ</span>
                {Object.entries(SF_SHORT).map(([key, label]) => (
                  <FilterChip key={key} label={label} active={filterSchadenTyp.includes(key)} onClick={() => setFilterSchadenTyp(prev => toggleFilter(prev, key))} />
                ))}
              </div>
              {/* Flags */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mr-1">Flags</span>
                <FilterChip label="Personenschaden" active={filterPersonenschaden} onClick={() => setFilterPersonenschaden(!filterPersonenschaden)} />
                <FilterChip label="Mietwagen" active={filterMietwagen} onClick={() => setFilterMietwagen(!filterMietwagen)} />
                <FilterChip label="Leasing" active={filterLeasing} onClick={() => setFilterLeasing(!filterLeasing)} />
              </div>
              {hasActiveFilters && (
                <button onClick={clearAllFilters} className="text-[11px] text-red-500 hover:text-red-400 font-medium flex items-center gap-0.5">
                  <XIcon className="w-3 h-3" /> Alle entfernen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-lg animate-fade-in-up">
            <p className="text-red-700 text-sm font-medium">{toast}</p>
          </div>
        )}

        {/* Rückruf-Modal */}
        {rueckrufModalLead && (
          <RueckrufModal
            leadId={rueckrufModalLead.id}
            leadName={`${rueckrufModalLead.vorname ?? ''} ${rueckrufModalLead.nachname ?? ''}`.trim() || '—'}
            defaultDatum={rueckrufModalLead.rueckruf_datum ? new Date(rueckrufModalLead.rueckruf_datum).toISOString().slice(0, 10) : undefined}
            onSave={async (leadId, datum, uhrzeit, notiz) => {
              const rueckrufDatum = new Date(`${datum}T${uhrzeit}:00`).toISOString()
              const snapshot = [...localLeads]
              setLocalLeads(prev => prev.map(l => l.id === leadId ? { ...l, qualifizierungs_phase: 'rueckruf', rueckruf_datum: rueckrufDatum, rueckruf_notiz: notiz, rueckruf_erledigt: false } : l))
              setRueckrufModalLead(null)
              try {
                const { createClient } = await import('@/lib/supabase/client')
                const supabase = createClient()
                await supabase.from('leads').update({ rueckruf_datum: rueckrufDatum, rueckruf_notiz: notiz || null, rueckruf_erledigt: false }).eq('id', leadId)
                await updateLeadStatus(leadId, 'rueckruf')
              } catch (e) {
                setLocalLeads(snapshot)
                showToast(e instanceof Error ? e.message : 'Fehler')
              }
            }}
            onCancel={() => setRueckrufModalLead(null)}
          />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Neuer Lead Formular */}
        {showNewLead && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 mx-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Neuer Lead</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <input placeholder="Vorname *" value={newLead.vorname} onChange={e => setNewLead(p => ({ ...p, vorname: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
              <input placeholder="Nachname *" value={newLead.nachname} onChange={e => setNewLead(p => ({ ...p, nachname: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
              <input placeholder="Telefon *" value={newLead.telefon} onChange={e => setNewLead(p => ({ ...p, telefon: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
              <input placeholder="E-Mail" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
              <select value={newLead.source_channel} onChange={e => setNewLead(p => ({ ...p, source_channel: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2">
                <option value="telefon">Telefon</option><option value="website">Website</option><option value="whatsapp">WhatsApp</option><option value="empfehlung">Empfehlung</option><option value="google-ads">Google Ads</option>
              </select>
              <select value={newLead.schadens_fall_typ} onChange={e => setNewLead(p => ({ ...p, schadens_fall_typ: e.target.value }))} className="bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2">
                <option value="">Schadentyp (optional)</option><option value="sf-01">SF-01 Unfall mit Gegner</option><option value="sf-02">SF-02 Teilschuld</option><option value="sf-03">SF-03 Parkschaden</option><option value="sf-05">SF-05 Personenschaden</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button disabled={newLeadSaving || !newLead.vorname.trim() || !newLead.nachname.trim()}
                onClick={async () => {
                  setNewLeadSaving(true)
                  try { await createLead(newLead); setShowNewLead(false); setNewLead({ vorname: '', nachname: '', telefon: '', email: '', source_channel: 'telefon', schadens_fall_typ: '' }); router.refresh() }
                  catch (e) { setError(e instanceof Error ? e.message : 'Fehler') }
                  setNewLeadSaving(false)
                }}
                className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                {newLeadSaving ? 'Erstellt...' : 'Lead erstellen'}
              </button>
              <button onClick={() => setShowNewLead(false)} className="text-gray-500 hover:text-gray-700 text-sm px-3 py-2">Abbrechen</button>
            </div>
          </div>
        )}

        {/* Heutige Rueckrufe - compact */}
        {heutigeRueckrufe.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 mb-2 mx-2 shrink-0">
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
                  <button key={lead.id} onClick={() => setSelectedLeadId(lead.id)}
                    className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors border border-gray-100 text-left">
                    <span className={`text-xs font-bold tabular-nums shrink-0 w-20 ${isOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                      {isOverdue ? 'UEBERFAELLIG' : time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isOverdue && minutesUntil > 0 && minutesUntil < 120 && (
                      <span className="text-[10px] text-amber-500 shrink-0">In {minutesUntil}min</span>
                    )}
                    <div className="min-w-0 flex-1"><p className="text-gray-800 text-sm truncate">{name}</p></div>
                    {lead.telefon && (
                      <PhoneButton
                        nummer={lead.telefon}
                        variant="card"
                        label="Anrufen"
                        stopPropagation
                        className="!bg-green-50 !text-green-600 hover:!bg-green-100 !px-2 !py-1 !rounded-lg text-xs shrink-0"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Disqualifizierte Leads */}
        {showDisqualifiziert && disqualifiziertLeads.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 mx-4">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Disqualifizierte Leads ({disqualifiziertLeads.length})</h3>
            <div className="space-y-1.5">
              {disqualifiziertLeads.map(lead => (
                <button key={lead.id} onClick={() => setSelectedLeadId(lead.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white hover:bg-gray-50 transition-colors border border-gray-100 w-full text-left">
                  <span className="text-gray-700 text-sm truncate flex-1">{`${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'}</span>
                  <span className="text-red-400 text-xs">{(lead as Record<string, unknown>).disqualifiziert_grund as string ?? ''}</span>
                  <span className="text-gray-400 text-xs">{lead.created_at ? new Date(lead.created_at).toLocaleDateString('de-DE') : ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Split-View: Content + Detail Panel ─────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
          {/* LEFT: Main Content — Kanban / Karten / Tabelle */}
          {viewMode === 'kanban' && (
            <DragDropContext onDragEnd={onDragEnd}>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 4, padding: '0 8px 8px 8px', minHeight: 0 }}>
                {COLUMNS.map(col => {
                  const Icon = col.icon
                  const sorted = sortedByColumn[col.key] ?? []

                  return (
                    <div key={col.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <div className="flex items-center gap-1 px-1 flex-shrink-0" style={{ height: 28 }}>
                        <Icon className={`w-3 h-3 ${col.color}`} />
                        <span className={`text-[11px] font-medium tracking-wider uppercase ${col.color}`}>{col.label}</span>
                        <span className="text-gray-500 text-[10px] font-medium bg-gray-100 px-1 py-0.5 rounded-full ml-auto">{sorted.length}</span>
                      </div>
                      <div className={`h-px ${col.bg} opacity-40 flex-shrink-0`} />

                      <Droppable droppableId={col.key}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            style={{ flex: 1, overflowY: 'auto', padding: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
                            className={`transition-colors ${snapshot.isDraggingOver ? 'bg-[#4573A2]/5 border-2 border-dashed border-[#4573A2]/30 rounded-lg' : ''}`}
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
                                      onClick={() => setSelectedLeadId(lead.id)}
                                    >
                                      <LeadCard lead={lead} columnKey={col.key} isSelected={lead.id === selectedLeadId} />
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
            </DragDropContext>
          )}

          {/* ─── Karten View ─────────────────────────────────────────── */}
          {viewMode === 'karten' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {pipelineLeads.map(lead => {
                  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
                  const age = timeSince(lead.created_at)
                  const SrcIcon = SOURCE_ICON[lead.source_channel ?? ''] ?? GlobeIcon
                  const phase = mapPhaseToColumn(lead.qualifizierungs_phase)
                  const col = COLUMNS.find(c => c.key === phase)
                  const hasCallback = !!lead.rueckruf_datum && !lead.rueckruf_erledigt
                  const callbackInPast = hasCallback && new Date(lead.rueckruf_datum!).getTime() < Date.now()

                  return (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`bg-white rounded-xl border p-3 text-left hover:shadow-md transition-all ${
                        lead.id === selectedLeadId ? 'border-[#4573A2] ring-1 ring-[#4573A2]/30 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Phase Badge */}
                      {col && (
                        <div className="flex items-center gap-1 mb-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${col.bg}`} />
                          <span className={`text-[9px] font-medium uppercase tracking-wider ${col.color}`}>{col.label}</span>
                        </div>
                      )}
                      {/* Callback */}
                      {hasCallback && (
                        <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded mb-2 ${
                          callbackInPast ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {callbackInPast ? 'UEBERFAELLIG' : `RR ${new Date(lead.rueckruf_datum!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                      )}
                      {/* Name + Age */}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 ml-1">{age}</span>
                      </div>
                      {/* Phone */}
                      {lead.telefon && (
                        <p className="text-[11px] text-[#4573A2] mb-2 truncate">{lead.telefon}</p>
                      )}
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-gray-100 text-gray-500 text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <SrcIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel}
                        </span>
                        {lead.schadens_fall_typ && (
                          <span className="bg-[#4573A2]/5 text-[#4573A2] text-[9px] font-medium px-1.5 py-0.5 rounded">
                            {SF_SHORT[lead.schadens_fall_typ] ?? lead.schadens_fall_typ}
                          </span>
                        )}
                        {lead.personenschaden_flag && <span className="bg-red-50 text-red-500 text-[9px] px-1 py-0.5 rounded">Pers.</span>}
                        {lead.mietwagen_flag && <span className="bg-amber-50 text-amber-500 text-[9px] px-1 py-0.5 rounded">MW</span>}
                        {lead.finanzierung_leasing === 'leasing' && <span className="bg-purple-50 text-purple-500 text-[9px] px-1 py-0.5 rounded">Leasing</span>}
                      </div>
                      {/* Signatures */}
                      <div className="flex items-center gap-2 mt-2 text-[9px]">
                        <span className={lead.sa_unterschrieben ? 'text-emerald-600' : 'text-gray-300'}>SA {lead.sa_unterschrieben ? '\u2713' : '\u2717'}</span>
                        <span className={lead.vollmacht_unterschrieben ? 'text-emerald-600' : 'text-gray-300'}>VM {lead.vollmacht_unterschrieben ? '\u2713' : '\u2717'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {pipelineLeads.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">Keine Leads gefunden</div>
              )}
            </div>
          )}

          {/* ─── Tabelle View ────────────────────────────────────────── */}
          {viewMode === 'tabelle' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px 8px' }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-500">
                      <button onClick={() => { setSortField('name'); setSortDir(prev => sortField === 'name' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc') }}
                        className="flex items-center gap-1 hover:text-gray-700">
                        Name <ArrowUpDownIcon className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Telefon</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">
                      <button onClick={() => { setSortField('source'); setSortDir(prev => sortField === 'source' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc') }}
                        className="flex items-center gap-1 hover:text-gray-700">
                        Quelle <ArrowUpDownIcon className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">
                      <button onClick={() => { setSortField('schadentyp'); setSortDir(prev => sortField === 'schadentyp' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc') }}
                        className="flex items-center gap-1 hover:text-gray-700">
                        Typ <ArrowUpDownIcon className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">
                      <button onClick={() => { setSortField('phase'); setSortDir(prev => sortField === 'phase' ? (prev === 'asc' ? 'desc' : 'asc') : 'asc') }}
                        className="flex items-center gap-1 hover:text-gray-700">
                        Phase <ArrowUpDownIcon className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">Flags</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">SA / VM</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-500">
                      <button onClick={() => { setSortField('created_at'); setSortDir(prev => sortField === 'created_at' ? (prev === 'asc' ? 'desc' : 'asc') : 'desc') }}
                        className="flex items-center gap-1 hover:text-gray-700">
                        Erstellt <ArrowUpDownIcon className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...pipelineLeads].sort((a, b) => {
                    const dir = sortDir === 'asc' ? 1 : -1
                    switch (sortField) {
                      case 'name': return dir * (`${a.vorname ?? ''} ${a.nachname ?? ''}`).localeCompare(`${b.vorname ?? ''} ${b.nachname ?? ''}`)
                      case 'source': return dir * (a.source_channel ?? '').localeCompare(b.source_channel ?? '')
                      case 'schadentyp': return dir * (a.schadens_fall_typ ?? '').localeCompare(b.schadens_fall_typ ?? '')
                      case 'phase': return dir * (a.qualifizierungs_phase ?? '').localeCompare(b.qualifizierungs_phase ?? '')
                      case 'created_at': return dir * (new Date(a.created_at ?? '0').getTime() - new Date(b.created_at ?? '0').getTime())
                      default: return 0
                    }
                  }).map(lead => {
                    const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
                    const phase = mapPhaseToColumn(lead.qualifizierungs_phase)
                    const col = COLUMNS.find(c => c.key === phase)

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${
                          lead.id === selectedLeadId ? 'bg-[#4573A2]/5' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="py-2 px-2">
                          <Link href={`/admin/dispatch/lead/${lead.id}`} onClick={e => e.stopPropagation()}
                            className="text-gray-800 font-medium hover:text-[#4573A2] transition-colors">
                            {name}
                          </Link>
                        </td>
                        <td className="py-2 px-2">
                          {lead.telefon && (
                            <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} stopPropagation />
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <span className="text-gray-600">{SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel ?? '—'}</span>
                        </td>
                        <td className="py-2 px-2">
                          {lead.schadens_fall_typ ? (
                            <span className="bg-[#4573A2]/5 text-[#4573A2] text-[10px] font-medium px-1.5 py-0.5 rounded">
                              {SF_SHORT[lead.schadens_fall_typ] ?? lead.schadens_fall_typ}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2 px-2">
                          {col && (
                            <span className={`text-[10px] font-medium ${col.color} flex items-center gap-1`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${col.bg}`} />
                              {col.label}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1">
                            {lead.personenschaden_flag && <span className="bg-red-50 text-red-500 text-[9px] px-1 py-0.5 rounded">Pers.</span>}
                            {lead.mietwagen_flag && <span className="bg-amber-50 text-amber-500 text-[9px] px-1 py-0.5 rounded">MW</span>}
                            {lead.finanzierung_leasing === 'leasing' && <span className="bg-purple-50 text-purple-500 text-[9px] px-1 py-0.5 rounded">Leas.</span>}
                            {!lead.personenschaden_flag && !lead.mietwagen_flag && lead.finanzierung_leasing !== 'leasing' && <span className="text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <span className={lead.sa_unterschrieben ? 'text-emerald-600' : 'text-gray-300'}>SA{lead.sa_unterschrieben ? '\u2713' : '\u2717'}</span>
                          {' '}
                          <span className={lead.vollmacht_unterschrieben ? 'text-emerald-600' : 'text-gray-300'}>VM{lead.vollmacht_unterschrieben ? '\u2713' : '\u2717'}</span>
                        </td>
                        <td className="py-2 px-2 text-gray-400">
                          {lead.created_at ? new Date(lead.created_at).toLocaleDateString('de-DE') : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {pipelineLeads.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">Keine Leads gefunden</div>
              )}
            </div>
          )}

          {/* RIGHT: Split-View Detail Panel */}
          {selectedLead && (
            <div className="w-[340px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">
                  {selectedLead.vorname ?? ''} {selectedLead.nachname ?? ''}
                </h2>
                <div className="flex items-center gap-1">
                  <Link href={`/admin/dispatch/lead/${selectedLead.id}`}
                    className="text-[#4573A2] hover:text-[#1E3A5F] transition-colors p-1 rounded-lg hover:bg-gray-50" title="Vollansicht">
                    <ExternalLinkIcon className="w-4 h-4" />
                  </Link>
                  <button onClick={() => setSelectedLeadId(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-50">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Contact Info */}
                <div className="space-y-2">
                  {selectedLead.telefon && (
                    <PhoneButton nummer={selectedLead.telefon} variant="inline" label={selectedLead.telefon} className="text-sm" />
                  )}
                  {selectedLead.email && (
                    <a href={`mailto:${selectedLead.email}`}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      <MailIcon className="w-3.5 h-3.5" />
                      {selectedLead.email}
                    </a>
                  )}
                  {selectedLead.created_at && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <ClockIcon className="w-3.5 h-3.5" />
                      Erstellt: {new Date(selectedLead.created_at).toLocaleDateString('de-DE')} ({timeSince(selectedLead.created_at)})
                    </div>
                  )}
                </div>

                {/* Phase Progress */}
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-2">Qualifizierung</p>
                  <PhaseProgressMini phase={selectedLead.qualifizierungs_phase ?? 'neu'} />
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedLead.source_channel && (() => {
                    const SrcIcon = SOURCE_ICON[selectedLead.source_channel] ?? GlobeIcon
                    return (
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                        <SrcIcon className="w-3 h-3" /> {SOURCE_LABEL[selectedLead.source_channel] ?? selectedLead.source_channel}
                      </span>
                    )
                  })()}
                  {selectedLead.schadens_fall_typ && (
                    <span className="bg-[#4573A2]/10 text-[#4573A2] text-[10px] font-medium px-2 py-1 rounded-lg">
                      {SF_SHORT[selectedLead.schadens_fall_typ] ?? selectedLead.schadens_fall_typ}
                      {SF_LABELS[selectedLead.schadens_fall_typ] && (
                        <span className="text-[#4573A2]/60 ml-1">{SF_LABELS[selectedLead.schadens_fall_typ]}</span>
                      )}
                    </span>
                  )}
                  {selectedLead.personenschaden_flag && (
                    <span className="bg-red-50 text-red-500 text-[10px] font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                      <AlertTriangleIcon className="w-3 h-3" /> Personenschaden
                    </span>
                  )}
                  {selectedLead.mietwagen_flag && (
                    <span className="bg-amber-50 text-amber-600 text-[10px] font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                      <CarIcon className="w-3 h-3" /> Mietwagen
                    </span>
                  )}
                  {selectedLead.finanzierung_leasing === 'leasing' && (
                    <span className="bg-purple-50 text-purple-500 text-[10px] font-medium px-2 py-1 rounded-lg">Leasing</span>
                  )}
                </div>

                {/* Callback Info */}
                {selectedLead.rueckruf_datum && !selectedLead.rueckruf_erledigt && (
                  <div className={`rounded-xl p-3 ${
                    new Date(selectedLead.rueckruf_datum).getTime() < Date.now()
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-amber-50 border border-amber-200'
                  }`}>
                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">Rueckruf</p>
                    <p className={`text-sm font-semibold ${
                      new Date(selectedLead.rueckruf_datum).getTime() < Date.now() ? 'text-red-600' : 'text-amber-700'
                    }`}>
                      {new Date(selectedLead.rueckruf_datum).toLocaleDateString('de-DE')} um {new Date(selectedLead.rueckruf_datum).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {selectedLead.rueckruf_notiz && (
                      <p className="text-xs text-gray-500 mt-1">{selectedLead.rueckruf_notiz}</p>
                    )}
                  </div>
                )}

                {/* Status Details */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Details</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">Anrufversuche</p>
                      <p className="text-gray-700 font-medium">{selectedLead.anruf_versuche ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Kontaktversuche</p>
                      <p className="text-gray-700 font-medium">{selectedLead.kontaktversuche ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Letzter Anruf</p>
                      <p className="text-gray-700 font-medium">{selectedLead.letzter_anruf_am ? timeSince(selectedLead.letzter_anruf_am) + ' ago' : '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Anruf-Status</p>
                      <p className="text-gray-700 font-medium">{selectedLead.letzter_anruf_status ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Unterschriften</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Schadensanzeige</span>
                      <span className={selectedLead.sa_unterschrieben ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                        {selectedLead.sa_unterschrieben ? 'Unterschrieben' : 'Ausstehend'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Vollmacht</span>
                      <span className={selectedLead.vollmacht_unterschrieben ? 'text-emerald-600 font-medium' : 'text-gray-400'}>
                        {selectedLead.vollmacht_unterschrieben ? 'Unterschrieben' : 'Ausstehend'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Flow Link Status */}
                {(selectedLead.flow_link_geoeffnet || selectedLead.flow_link_abgeschlossen) && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Flow Link</p>
                    <p className={`text-xs font-medium ${
                      selectedLead.flow_link_abgeschlossen ? 'text-emerald-600' : 'text-[#4573A2]'
                    }`}>
                      {selectedLead.flow_link_abgeschlossen ? 'Abgeschlossen' : 'Geoeffnet'}
                    </p>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  {selectedLead.telefon && (
                    <PhoneButton
                      nummer={selectedLead.telefon}
                      variant="card"
                      label="Jetzt anrufen"
                      className="!bg-emerald-500 hover:!bg-emerald-600 !px-4 !py-2.5 !rounded-xl text-xs font-medium"
                    />
                  )}
                  <Link href={`/admin/dispatch/lead/${selectedLead.id}`}
                    className="bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-xs font-medium px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <ExternalLinkIcon className="w-3.5 h-3.5" /> Vollansicht oeffnen
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lead Card (no dropdown, drag-only) ──────────────────────────────────────

function LeadCard({ lead, columnKey, isSelected }: { lead: Lead; columnKey: string; isSelected?: boolean }) {
  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
  const age = timeSince(lead.created_at)
  const SourceIcon = SOURCE_ICON[lead.source_channel ?? ''] ?? GlobeIcon

  const hasCallback = !!lead.rueckruf_datum && !lead.rueckruf_erledigt
  const callbackInPast = hasCallback && new Date(lead.rueckruf_datum!) < new Date()

  return (
    <div className={`bg-white rounded-lg border hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${
      isSelected ? 'border-[#4573A2] ring-1 ring-[#4573A2]/30 shadow-sm' : 'border-gray-200 hover:border-gray-300'
    }`} style={{ padding: '6px 8px' }}>
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
        <span className="text-gray-800 text-sm font-medium leading-snug truncate flex-1 min-w-0">
          {name}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0 ml-1">{age}</span>
      </div>

      {/* Telefon */}
      {lead.telefon && (
        <div className="mb-1.5">
          <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} stopPropagation className="text-[11px]" />
        </div>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        <span className="bg-gray-100 text-gray-500 text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
          <SourceIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel}
        </span>
        {lead.schadens_fall_typ && (
          <span className="bg-[#4573A2]/5 text-[#4573A2] text-[9px] font-medium px-1.5 py-0.5 rounded">
            {SF_SHORT[lead.schadens_fall_typ] ?? lead.schadens_fall_typ}
          </span>
        )}
        {lead.personenschaden_flag && <span className="bg-red-50 text-red-500 text-[9px] px-1 py-0.5 rounded">Pers.</span>}
        {lead.mietwagen_flag && <span className="bg-amber-50 text-amber-500 text-[9px] px-1 py-0.5 rounded">MW</span>}
        {lead.finanzierung_leasing === 'leasing' && <span className="bg-purple-50 text-purple-500 text-[9px] px-1 py-0.5 rounded">Leasing</span>}
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
            : lead.flow_link_geoeffnet ? <span className="text-[#4573A2]">FlowLink geoeffnet</span>
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
