'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateFallStatus, updateLeadStatus, createLead } from './actions'
import { VS_STUFEN_SHORT } from '@/lib/statusLabels'
import {
  UserPlusIcon,
  PhoneCallIcon,
  PhoneOffIcon,
  ClipboardListIcon,
  SendIcon,
  FileTextIcon,
  CheckCircle2Icon,
  SearchIcon,
  EyeIcon,
  UserCheckIcon,
  TimerIcon,
  ClockIcon,
  PhoneIcon,
  GlobeIcon,
  MessageCircleIcon,
  UsersIcon,
  AlertTriangleIcon,
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
  { key: 'neu',               label: 'NEU',              sub: 'Noch nicht angerufen',     color: 'text-sky-400',     bg: 'bg-sky-500',     icon: UserPlusIcon },
  { key: 'nicht-erreicht',    label: 'NICHT ERREICHT',   sub: 'Angerufen, kein Kontakt',  color: 'text-red-400',     bg: 'bg-red-500',     icon: PhoneOffIcon },
  { key: 'rueckruf',          label: 'RUECKRUF',         sub: 'Termin vereinbart',        color: 'text-amber-400',   bg: 'bg-amber-500',   icon: PhoneCallIcon },
  { key: 'in-qualifizierung', label: 'IN QUALIFIZIERUNG',sub: 'Im Gespraech',             color: 'text-blue-400',    bg: 'bg-blue-500',    icon: ClipboardListIcon },
  { key: 'flow-versendet',    label: 'FLOW VERSENDET',   sub: 'Wartet auf Kunde',         color: 'text-violet-400',  bg: 'bg-violet-500',  icon: SendIcon },
  { key: 'sa-ausstehend',     label: 'SA AUSSTEHEND',    sub: 'Unterschriften fehlen',    color: 'text-orange-400',  bg: 'bg-orange-500',  icon: FileTextIcon },
  { key: 'konvertiert',       label: 'KONVERTIERT',      sub: 'Lead -> Fallakte',         color: 'text-emerald-400', bg: 'bg-emerald-500', icon: CheckCircle2Icon },
]

// Map old phases to new columns
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
  const [showNewLead, setShowNewLead] = useState(false)
  const [newLead, setNewLead] = useState({ vorname: '', nachname: '', telefon: '+491633628571', email: '', source_channel: 'telefon', schadenfall_typ: '' })
  const [newLeadSaving, setNewLeadSaving] = useState(false)

  // Filter leads: exclude terminal statuses
  const pipelineLeads = useMemo(() => {
    return leads.filter(l => {
      if (l.status === 'disqualifiziert' || l.status === 'kalt') return false
      if (search) {
        const q = search.toLowerCase()
        const name = `${l.vorname ?? ''} ${l.nachname ?? ''}`.toLowerCase()
        if (!name.includes(q) && !(l.email ?? '').toLowerCase().includes(q) && !(l.telefon ?? '').includes(q)) return false
      }
      return true
    })
  }, [leads, search])

  // Heutige Rueckrufe (ueber dem Board)
  const now = Date.now()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)

  const heutigeRueckrufe = useMemo(() => {
    return leads
      .filter(l => {
        if (!l.rueckruf_datum || l.rueckruf_erledigt) return false
        const t = new Date(l.rueckruf_datum).getTime()
        // Today or overdue (past days)
        return t <= todayEnd.getTime()
      })
      .sort((a, b) => new Date(a.rueckruf_datum!).getTime() - new Date(b.rueckruf_datum!).getTime())
  }, [leads, todayEnd])

  function handlePhaseChange(leadId: string, newPhase: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, newPhase)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  return (
    <div className="px-4 py-6 overflow-hidden">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white">Dispatch</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {pipelineLeads.length} Leads in der Pipeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNewLead(!showNewLead)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5">
              <UserPlusIcon className="w-3.5 h-3.5" /> Neuer Lead
            </button>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
                className="pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 w-48" />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-3 mb-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Neuer Lead Formular */}
        {showNewLead && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-white mb-3">Neuer Lead</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <input placeholder="Vorname *" value={newLead.vorname} onChange={e => setNewLead(p => ({ ...p, vorname: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="Nachname *" value={newLead.nachname} onChange={e => setNewLead(p => ({ ...p, nachname: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="Telefon *" value={newLead.telefon} onChange={e => setNewLead(p => ({ ...p, telefon: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input placeholder="E-Mail" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select value={newLead.source_channel} onChange={e => setNewLead(p => ({ ...p, source_channel: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2">
                <option value="telefon">Telefon</option>
                <option value="website">Website</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="empfehlung">Empfehlung</option>
                <option value="google-ads">Google Ads</option>
              </select>
              <select value={newLead.schadenfall_typ} onChange={e => setNewLead(p => ({ ...p, schadenfall_typ: e.target.value }))} className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2">
                <option value="">Schadentyp (optional)</option>
                <option value="sf-01">SF-01 Unfall mit Gegner</option>
                <option value="sf-02">SF-02 Teilschuld</option>
                <option value="sf-03">SF-03 Parkschaden</option>
                <option value="sf-04">SF-04 Kasko</option>
                <option value="sf-05">SF-05 Personenschaden</option>
                <option value="sf-06">SF-06 Nutzungsausfall</option>
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
              <button onClick={() => setShowNewLead(false)} className="text-zinc-500 hover:text-zinc-300 text-sm px-3 py-2">Abbrechen</button>
            </div>
          </div>
        )}

        {/* Heutige Rueckrufe */}
        {heutigeRueckrufe.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-800/40 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <PhoneCallIcon className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-300">Heutige Rueckrufe ({heutigeRueckrufe.length})</h3>
            </div>
            <div className="space-y-2">
              {heutigeRueckrufe.map(lead => {
                const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
                const time = new Date(lead.rueckruf_datum!)
                const isOverdue = time.getTime() < now
                const isToday = time >= todayStart && time <= todayEnd
                const minutesUntil = Math.round((time.getTime() - now) / 60000)

                return (
                  <Link key={lead.id} href={`/admin/dispatch/lead/${lead.id}`}
                    className="flex items-center gap-3 bg-zinc-900/60 rounded-xl px-3 py-2.5 hover:bg-zinc-800/60 transition-colors">
                    <span className={`text-xs font-bold tabular-nums shrink-0 w-20 ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
                      {isOverdue ? 'UEBERFAELLIG' : `${time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                    {!isOverdue && minutesUntil > 0 && minutesUntil < 120 && (
                      <span className="text-[10px] text-amber-500 shrink-0">In {minutesUntil}min</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 text-sm truncate">{name}</p>
                    </div>
                    {lead.telefon && (
                      <a href={`tel:${lead.telefon}`} onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600/20 text-green-400 text-xs font-medium hover:bg-green-600/30 shrink-0">
                        <PhoneIcon className="w-3 h-3" /> Anrufen
                      </a>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Kanban-Board */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-2.5" style={{ minWidth: `${COLUMNS.length * 210}px` }}>
            {COLUMNS.map(col => {
              const Icon = col.icon
              const items = pipelineLeads.filter(l => mapPhaseToColumn(l.qualifizierungs_phase) === col.key)

              // Sort: konvertiert by newest, rueckruf by time, rest by oldest
              const sorted = [...items].sort((a, b) => {
                if (col.key === 'rueckruf') {
                  return new Date(a.rueckruf_datum ?? '9999').getTime() - new Date(b.rueckruf_datum ?? '9999').getTime()
                }
                if (col.key === 'konvertiert') {
                  return new Date(b.updated_at ?? '0').getTime() - new Date(a.updated_at ?? '0').getTime()
                }
                return new Date(a.created_at ?? '0').getTime() - new Date(b.created_at ?? '0').getTime()
              })

              return (
                <div key={col.key} className="min-w-[210px] w-[210px] flex-shrink-0">
                  <div className="mb-3 px-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className={`w-3.5 h-3.5 ${col.color}`} />
                      <span className={`text-[11px] font-bold tracking-wide ${col.color}`}>{col.label}</span>
                      <span className="text-zinc-600 text-[10px] font-medium bg-zinc-800 px-1.5 py-0.5 rounded-full ml-auto">{sorted.length}</span>
                    </div>
                    <p className="text-zinc-600 text-[10px]">{col.sub}</p>
                  </div>
                  <div className={`h-0.5 ${col.bg} rounded-full mb-3 opacity-40`} />
                  <div className="space-y-2 min-h-24">
                    {sorted.length === 0 && (
                      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
                        <p className="text-zinc-700 text-[10px]">Leer</p>
                      </div>
                    )}
                    {sorted.map(lead => (
                      <LeadCard key={lead.id} lead={lead} columnKey={col.key} onPhaseChange={handlePhaseChange} isPending={isPending} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Lead Card ─────────────────────────────────────────────────────────────

function LeadCard({ lead, columnKey, onPhaseChange, isPending }: {
  lead: Lead; columnKey: string; onPhaseChange: (id: string, phase: string) => void; isPending: boolean
}) {
  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '\u2014'
  const age = timeSince(lead.created_at)
  const SourceIcon = SOURCE_ICON[lead.source_channel ?? ''] ?? GlobeIcon

  // Rueckruf badges
  const hasCallback = !!lead.rueckruf_datum && !lead.rueckruf_erledigt
  const callbackInPast = hasCallback && new Date(lead.rueckruf_datum!) < new Date()

  return (
    <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
      {/* Rueckruf Badge */}
      {hasCallback && (
        <div className={`text-[10px] font-semibold px-2 py-1 rounded-lg mb-2 ${
          callbackInPast ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400'
        }`}>
          {callbackInPast ? 'UEBERFAELLIG' : `Rueckruf ${new Date(lead.rueckruf_datum!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      {/* Name + Age */}
      <div className="flex items-center justify-between mb-1">
        <Link href={`/admin/dispatch/lead/${lead.id}`} className="text-zinc-200 text-sm font-medium leading-snug truncate hover:text-white transition-colors flex-1 min-w-0">
          {name}
        </Link>
        <span className="text-[10px] text-zinc-600 shrink-0 ml-1">{age}</span>
      </div>

      {/* Telefon */}
      {lead.telefon && (
        <a href={`tel:${lead.telefon}`} className="text-blue-400 hover:text-blue-300 text-[11px] mb-1.5 block truncate transition-colors">
          {lead.telefon}
        </a>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {/* Quelle */}
        <span className="bg-zinc-800 text-zinc-500 text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1">
          <SourceIcon className="w-2.5 h-2.5" /> {SOURCE_LABEL[lead.source_channel ?? ''] ?? lead.source_channel}
        </span>
        {/* Schadentyp */}
        {lead.schadenfall_typ && (
          <span className="bg-blue-950 text-blue-300 text-[9px] font-medium px-1.5 py-0.5 rounded">
            {SF_SHORT[lead.schadenfall_typ] ?? lead.schadenfall_typ}
          </span>
        )}
        {/* Flags */}
        {lead.personenschaden_flag && <span className="bg-red-950 text-red-400 text-[9px] px-1 py-0.5 rounded">Pers.</span>}
        {lead.mietwagen_flag && <span className="bg-amber-950 text-amber-400 text-[9px] px-1 py-0.5 rounded">MW</span>}
        {lead.leasing_flag && <span className="bg-purple-950 text-purple-400 text-[9px] px-1 py-0.5 rounded">Leasing</span>}
      </div>

      {/* Column-specific info */}
      {columnKey === 'nicht-erreicht' && (
        <div className="text-[10px] text-red-400 mb-1.5">
          {lead.anruf_versuche ?? 0}x nicht erreicht
          {lead.letzter_anruf_am && <span className="text-zinc-600"> &middot; {timeSince(lead.letzter_anruf_am)}</span>}
        </div>
      )}
      {columnKey === 'rueckruf' && lead.rueckruf_notiz && (
        <p className="text-[10px] text-zinc-500 truncate mb-1.5">{lead.rueckruf_notiz}</p>
      )}
      {columnKey === 'flow-versendet' && (
        <div className="text-[10px] text-zinc-500 mb-1.5">
          {lead.flow_link_abgeschlossen ? <span className="text-emerald-400">FlowLink abgeschlossen</span>
            : lead.flow_link_geoeffnet ? <span className="text-blue-400">FlowLink geoeffnet</span>
            : <span>Wartet seit {timeSince(lead.updated_at)}</span>}
        </div>
      )}
      {columnKey === 'sa-ausstehend' && (
        <div className="text-[10px] text-orange-400 mb-1.5">
          {!lead.sa_unterschrieben && !lead.vollmacht_unterschrieben ? 'SA + Vollmacht fehlen'
            : !lead.sa_unterschrieben ? 'SA fehlt'
            : 'Vollmacht fehlt'}
        </div>
      )}
      {columnKey === 'konvertiert' && lead.status === 'umgewandelt' && (
        <div className="text-[10px] text-emerald-400 mb-1.5">Fallakte erstellt</div>
      )}

      {/* Phase dropdown */}
      <div className="pt-2 border-t border-zinc-800/50">
        <select
          value={mapPhaseToColumn(lead.qualifizierungs_phase)}
          disabled={isPending}
          onChange={e => onPhaseChange(lead.id, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
        >
          {COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
          <option value="disqualifiziert">Disqualifiziert</option>
          <option value="kalt">Kalt</option>
        </select>
      </div>
    </div>
  )
}
