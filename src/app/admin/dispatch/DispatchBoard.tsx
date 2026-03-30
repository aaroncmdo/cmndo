'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateFallStatus, updateLeadStatus } from './actions'
import {
  UserPlusIcon,
  PhoneCallIcon,
  ClipboardListIcon,
  SendIcon,
  FileTextIcon,
  UserCheckIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  ScaleIcon,
  BadgeEuroIcon,
  CheckCircle2Icon,
  DropletIcon,
  FlameIcon,
  ShieldAlertIcon,
  CloudLightningIcon,
  WrenchIcon,
  HelpCircleIcon,
  SearchIcon,
  EyeIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TimerIcon,
  PackageCheckIcon,
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

// ─── Pipeline columns (13 total) ────────────────────────────────────────────

type PipelineColumn = {
  key: string
  label: string
  sub: string
  color: string
  bg: string
  icon: typeof FileTextIcon
  type: 'lead' | 'fall'
}

const COLUMNS: PipelineColumn[] = [
  // Lead columns (1-4)
  { key: 'neu', label: 'NEU', sub: 'Neuer Lead', color: 'text-sky-400', bg: 'bg-sky-500', icon: UserPlusIcon, type: 'lead' },
  { key: 'rueckruf', label: 'RUECKRUF', sub: 'Geplant', color: 'text-amber-400', bg: 'bg-amber-500', icon: PhoneCallIcon, type: 'lead' },
  { key: 'quali-offen', label: 'QUALI', sub: 'In Qualifizierung', color: 'text-orange-400', bg: 'bg-orange-500', icon: ClipboardListIcon, type: 'lead' },
  { key: 'flow-gesendet', label: 'FLOW-GESENDET', sub: 'FlowLink verschickt', color: 'text-violet-400', bg: 'bg-violet-500', icon: SendIcon, type: 'lead' },
  // Fall columns (5-13)
  { key: 'onboarding', label: 'ONBOARDING', sub: 'Kunde durchlaeuft', color: 'text-pink-400', bg: 'bg-pink-500', icon: PackageCheckIcon, type: 'fall' },
  { key: 'ersterfassung', label: 'DISPATCH', sub: 'D-01 SV gesucht', color: 'text-blue-400', bg: 'bg-blue-500', icon: FileTextIcon, type: 'fall' },
  { key: 'sv-termin', label: 'TERMIN', sub: 'D-02 Bestaetigt', color: 'text-yellow-400', bg: 'bg-yellow-500', icon: CalendarIcon, type: 'fall' },
  { key: 'besichtigung', label: 'BESICHTIGUNG', sub: 'D-03 Vor Ort', color: 'text-teal-400', bg: 'bg-teal-500', icon: MapPinIcon, type: 'fall' },
  { key: 'gutachten-eingegangen', label: 'GUTACHTEN', sub: 'D-04 Hochgeladen', color: 'text-orange-400', bg: 'bg-orange-500', icon: ClipboardCheckIcon, type: 'fall' },
  { key: 'filmcheck', label: 'QC-PRUEFUNG', sub: 'E-Akte geprueft', color: 'text-purple-400', bg: 'bg-purple-500', icon: ShieldCheckIcon, type: 'fall' },
  { key: 'kanzlei-uebergeben', label: 'KANZLEI', sub: 'Uebergeben', color: 'text-cyan-400', bg: 'bg-cyan-500', icon: ScaleIcon, type: 'fall' },
  { key: 'regulierung', label: 'VS-REGULIERUNG', sub: 'VS bearbeitet', color: 'text-green-400', bg: 'bg-green-500', icon: TimerIcon, type: 'fall' },
  { key: 'abgeschlossen', label: 'ABGESCHLOSSEN', sub: 'Zahlung da', color: 'text-zinc-400', bg: 'bg-zinc-500', icon: CheckCircle2Icon, type: 'fall' },
]

// Status values that map to each column (for faelle that use old status values)
const STATUS_TO_COLUMN: Record<string, string> = {
  ersterfassung: 'ersterfassung',
  'sv-zugewiesen': 'ersterfassung',
  'sv-termin': 'sv-termin',
  besichtigung: 'besichtigung',
  'gutachten-eingegangen': 'gutachten-eingegangen',
  filmcheck: 'filmcheck',
  'qc-pruefung': 'filmcheck',
  'kanzlei-uebergeben': 'kanzlei-uebergeben',
  anschlussschreiben: 'kanzlei-uebergeben',
  regulierung: 'regulierung',
  'vs-regulierung': 'regulierung',
  abgeschlossen: 'abgeschlossen',
}

const LEAD_COLUMNS = COLUMNS.filter(c => c.type === 'lead')
const FALL_COLUMNS = COLUMNS.filter(c => c.type === 'fall')

const SOURCE_LABEL: Record<string, string> = {
  flow: 'Flow',
  telefon: 'Telefon',
  email: 'E-Mail',
  website: 'Website',
  empfehlung: 'Empfehlung',
}

const URSACHE_ICON: Record<string, typeof DropletIcon> = {
  wasserschaden: DropletIcon,
  brand: FlameIcon,
  einbruch: ShieldAlertIcon,
  sachbeschaedigung: WrenchIcon,
  sturmschaden: CloudLightningIcon,
  vandalismus: ShieldAlertIcon,
  verschleiss: WrenchIcon,
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasser',
  sachbeschaedigung: 'Sachbesch.',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturm',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiss',
  sonstiges: 'Sonstiges',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function getColumnKey(fall: Fall): string {
  // Onboarding column: case exists but onboarding not complete
  if (fall.onboarding_complete === false && !['abgeschlossen', 'storniert'].includes(fall.status)) {
    // Only show in onboarding if the status is still early
    const earlyStatuses = ['ersterfassung', 'sv-zugewiesen']
    if (earlyStatuses.includes(fall.status)) {
      return 'onboarding'
    }
  }
  return STATUS_TO_COLUMN[fall.status] ?? fall.status
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
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
  const [filterMode, setFilterMode] = useState<'alle' | 'meine'>('alle')
  const [error, setError] = useState<string | null>(null)

  // Pipeline leads: only show active lead statuses
  const pipelineLeadStatuses = new Set(LEAD_COLUMNS.map(c => c.key))

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (!pipelineLeadStatuses.has(l.status)) return false
      if (search) {
        const q = search.toLowerCase()
        const name = `${l.vorname ?? ''} ${l.nachname ?? ''}`.toLowerCase()
        const email = (l.email ?? '').toLowerCase()
        if (!name.includes(q) && !email.includes(q)) return false
      }
      return true
    })
  }, [leads, search])

  const filteredFaelle = useMemo(() => {
    return faelle.filter(f => {
      // "Meine Faelle" filter: only cases where I'm Kundenbetreuer
      if (filterMode === 'meine' && f.kundenbetreuer_id !== currentUserId) return false
      // Exclude storniert
      if (f.status === 'storniert') return false
      if (search) {
        const q = search.toLowerCase()
        const name = f.lead_id ? (leadNameMap[f.lead_id] ?? '').toLowerCase() : ''
        const nr = (f.fall_nummer ?? '').toLowerCase()
        if (!name.includes(q) && !nr.includes(q)) return false
      }
      return true
    })
  }, [faelle, search, filterMode, currentUserId, leadNameMap])

  function handleLeadStatusChange(leadId: string, newStatus: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, newStatus)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  function handleFallStatusChange(fallId: string, newStatus: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateFallStatus(fallId, newStatus)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler')
      }
    })
  }

  const totalPipeline = filteredLeads.length + filteredFaelle.length

  return (
    <div className="px-4 py-6">
      <div className="max-w-[2800px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white">Dispatch</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {totalPipeline} in der Pipeline
              <span className="text-zinc-600 mx-1.5">·</span>
              <span className="text-sky-400">{filteredLeads.length} Leads</span>
              <span className="text-zinc-600 mx-1.5">·</span>
              <span className="text-blue-400">{filteredFaelle.length} Faelle</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suche..."
                className="pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600 w-48"
              />
            </div>

            {/* Meine / Alle filter */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setFilterMode('alle')}
                className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filterMode === 'alle'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <EyeIcon className="w-3 h-3" />
                Alle Faelle
              </button>
              <button
                onClick={() => setFilterMode('meine')}
                className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filterMode === 'meine'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <UserCheckIcon className="w-3 h-3" />
                Meine Faelle
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-3 mb-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Pipeline columns - horizontal scroll */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-2.5" style={{ minWidth: `${COLUMNS.length * 185}px` }}>
            {COLUMNS.map(col => {
              const Icon = col.icon
              const isLeadCol = col.type === 'lead'
              const items = isLeadCol
                ? filteredLeads.filter(l => l.status === col.key)
                : filteredFaelle.filter(f => getColumnKey(f) === col.key)

              return (
                <div key={col.key} className="flex-1 min-w-[175px]">
                  {/* Column header */}
                  <div className="mb-3 px-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Icon className={`w-3.5 h-3.5 ${col.color}`} />
                      <span className={`text-[11px] font-bold tracking-wide ${col.color}`}>{col.label}</span>
                      <span className="text-zinc-600 text-[10px] font-medium bg-zinc-800 px-1.5 py-0.5 rounded-full ml-auto">
                        {items.length}
                      </span>
                    </div>
                    <p className="text-zinc-600 text-[10px]">{col.sub}</p>
                  </div>

                  {/* Divider line */}
                  <div className={`h-0.5 ${col.bg} rounded-full mb-3 opacity-40`} />

                  {/* Cards */}
                  <div className="space-y-2 min-h-24">
                    {items.length === 0 && (
                      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
                        <p className="text-zinc-700 text-[10px]">Leer</p>
                      </div>
                    )}
                    {isLeadCol
                      ? (items as Lead[]).map(lead => (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            onStatusChange={handleLeadStatusChange}
                            isPending={isPending}
                          />
                        ))
                      : (items as Fall[]).map(fall => (
                          <FallCard
                            key={fall.id}
                            fall={fall}
                            columnKey={col.key}
                            leadNameMap={leadNameMap}
                            svMap={svMap}
                            betreuerMap={betreuerMap}
                            onStatusChange={handleFallStatusChange}
                            isPending={isPending}
                          />
                        ))
                    }
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

function LeadCard({
  lead,
  onStatusChange,
  isPending,
}: {
  lead: Lead
  onStatusChange: (leadId: string, status: string) => void
  isPending: boolean
}) {
  const days = daysSince(lead.updated_at ?? lead.created_at)
  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || '—'
  const source = lead.source_channel ? (SOURCE_LABEL[lead.source_channel] ?? lead.source_channel) : null

  return (
    <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
      {/* Top row */}
      <div className="flex items-center justify-between mb-1.5">
        <Link
          href={`/admin/dispatch/lead/${lead.id}`}
          className="text-sky-400 hover:text-sky-300 text-[10px] font-semibold uppercase tracking-wide"
        >
          Lead
        </Link>
        <DaysBadge days={days} />
      </div>

      <Link href={`/admin/dispatch/lead/${lead.id}`}>
        <p className="text-zinc-200 text-sm font-medium leading-snug mb-1.5 truncate hover:text-white transition-colors">
          {name}
        </p>
      </Link>

      {source && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <HelpCircleIcon className="w-3 h-3 text-zinc-500" />
          <span className="text-zinc-500 text-[11px]">{source}</span>
        </div>
      )}

      {(lead.kontaktversuche ?? 0) > 0 && (
        <div className="flex items-center gap-1.5 mb-2">
          <PhoneCallIcon className="w-3 h-3 text-zinc-600" />
          <span className="text-zinc-500 text-[11px]">{lead.kontaktversuche} Kontaktversuche</span>
        </div>
      )}

      {/* Status dropdown */}
      <div className="pt-2 border-t border-zinc-800/50">
        <select
          value={lead.status}
          disabled={isPending}
          onChange={e => onStatusChange(lead.id, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
        >
          {LEAD_COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
          <option value="umgewandelt">Umgewandelt</option>
          <option value="disqualifiziert">Disqualifiziert</option>
          <option value="kalt">Kalt</option>
        </select>
      </div>
    </div>
  )
}

// ─── Fall Card ─────────────────────────────────────────────────────────────

function FallCard({
  fall,
  columnKey,
  leadNameMap,
  svMap,
  betreuerMap,
  onStatusChange,
  isPending,
}: {
  fall: Fall
  columnKey: string
  leadNameMap: Record<string, string>
  svMap: Record<string, string>
  betreuerMap: Record<string, string>
  onStatusChange: (fallId: string, status: string) => void
  isPending: boolean
}) {
  const days = daysSince(fall.status_changed_at ?? fall.updated_at ?? fall.created_at)
  const UrsacheIcon = fall.schadens_ursache ? (URSACHE_ICON[fall.schadens_ursache] ?? HelpCircleIcon) : null
  const kundeName = fall.lead_id ? leadNameMap[fall.lead_id] ?? '—' : '—'
  const svName = fall.sv_id ? svMap[fall.sv_id] ?? null : null
  const betreuerName = fall.kundenbetreuer_id ? betreuerMap[fall.kundenbetreuer_id] ?? null : null

  // VS-Timer: show on any column when AS was sent
  const hasAs = !!fall.anschlussschreiben_am
  const vsDays = hasAs ? daysSince(fall.anschlussschreiben_am!) : 0
  const vsStufe = fall.vs_eskalationsstufe ?? 'vs-01'
  const vsOverdue = vsDays > 14

  return (
    <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 hover:border-zinc-700 transition-colors">
      {/* Top row: Fallnummer + days */}
      <div className="flex items-center justify-between mb-1.5">
        <Link
          href={`/admin/faelle/${fall.id}`}
          className="text-blue-400 hover:text-blue-300 text-xs font-mono font-medium"
        >
          {fall.fall_nummer ?? fall.id.slice(0, 8)}
        </Link>
        <DaysBadge days={days} />
      </div>

      {/* Kundenname + Vorschaden Warning */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-zinc-200 text-sm font-medium leading-snug truncate">{kundeName}</p>
        {fall.vorschaden_vorhanden && (
          <span title="Vorschaden bekannt" className="shrink-0">
            <ShieldAlertIcon className="w-3.5 h-3.5 text-amber-400" />
          </span>
        )}
      </div>

      {/* Schadensart */}
      {UrsacheIcon && (
        <div className="flex items-center gap-1.5 mb-1">
          <UrsacheIcon className="w-3 h-3 text-zinc-500" />
          <span className="text-zinc-500 text-[11px]">
            {URSACHE_LABEL[fall.schadens_ursache!] ?? fall.schadens_ursache}
          </span>
        </div>
      )}

      {/* SV */}
      {svName && (
        <div className="flex items-center gap-1.5 mb-1">
          <UserCheckIcon className="w-3 h-3 text-zinc-600" />
          <span className="text-zinc-500 text-[11px] truncate">{svName}</span>
        </div>
      )}

      {/* VS-Eskalation Badge */}
      {hasAs && (
        <div className={`flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-lg text-[11px] font-medium ${
          ['vs-06', 'vs-07'].includes(vsStufe)
            ? 'bg-red-950 text-red-400'
            : ['vs-04', 'vs-05'].includes(vsStufe)
            ? 'bg-orange-950 text-orange-400'
            : ['vs-02', 'vs-03'].includes(vsStufe)
            ? 'bg-amber-950 text-amber-400'
            : 'bg-green-950 text-green-400'
        }`}>
          <TimerIcon className="w-3 h-3" />
          <span>{vsStufe.toUpperCase()} · Tag {vsDays}</span>
          {vsOverdue && <span className="ml-auto text-[10px]">ueberfaellig!</span>}
        </div>
      )}

      {/* Kundenbetreuer */}
      {betreuerName && (
        <div className="flex items-center gap-2 mt-1.5 mb-2">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <span className="text-blue-400 text-[8px] font-bold">{getInitials(betreuerName)}</span>
          </div>
          <span className="text-zinc-500 text-[11px] truncate">{betreuerName}</span>
        </div>
      )}

      {/* Status dropdown */}
      <div className="pt-2 border-t border-zinc-800/50">
        <select
          value={fall.status}
          disabled={isPending}
          onChange={e => onStatusChange(fall.id, e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
        >
          {FALL_COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
          <option value="storniert">Storniert</option>
        </select>
      </div>
    </div>
  )
}

// ─── Shared Components ──────────────────────────────────────────────────────

function DaysBadge({ days }: { days: number }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
      days >= 7 ? 'bg-red-950 text-red-400' : days >= 3 ? 'bg-amber-950 text-amber-400' : 'bg-zinc-800 text-zinc-500'
    }`}>
      {days}d
    </span>
  )
}
