'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateFallStatus } from './actions'
import {
  FileTextIcon,
  UserCheckIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  FilmIcon,
  ScaleIcon,
  MailIcon,
  BadgeEuroIcon,
  CheckCircle2Icon,
  DropletIcon,
  FlameIcon,
  ShieldAlertIcon,
  CloudLightningIcon,
  WrenchIcon,
  HelpCircleIcon,
  SearchIcon,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  sv_id: string | null
  lead_id: string | null
  updated_at: string | null
  created_at: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'ersterfassung', label: 'Ersterfassung', color: 'text-blue-400', bg: 'bg-blue-500' },
  { key: 'sv-zugewiesen', label: 'SV zugewiesen', color: 'text-yellow-400', bg: 'bg-yellow-500' },
  { key: 'sv-termin', label: 'SV Termin', color: 'text-yellow-300', bg: 'bg-yellow-400' },
  { key: 'gutachten-eingegangen', label: 'Gutachten', color: 'text-orange-400', bg: 'bg-orange-500' },
  { key: 'filmcheck', label: 'Filmcheck', color: 'text-purple-400', bg: 'bg-purple-500' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei', color: 'text-cyan-400', bg: 'bg-cyan-500' },
  { key: 'anschlussschreiben', label: 'Anschluss', color: 'text-cyan-300', bg: 'bg-cyan-400' },
  { key: 'regulierung', label: 'Regulierung', color: 'text-green-400', bg: 'bg-green-500' },
  { key: 'abgeschlossen', label: 'Abgeschlossen', color: 'text-zinc-400', bg: 'bg-zinc-500' },
] as const

const COLUMN_BADGE_COLOR: Record<string, string> = {
  ersterfassung: 'bg-blue-950 text-blue-300 border-blue-800/50',
  'sv-zugewiesen': 'bg-yellow-950 text-yellow-300 border-yellow-800/50',
  'sv-termin': 'bg-yellow-950 text-yellow-200 border-yellow-800/50',
  'gutachten-eingegangen': 'bg-orange-950 text-orange-300 border-orange-800/50',
  filmcheck: 'bg-purple-950 text-purple-300 border-purple-800/50',
  'kanzlei-uebergeben': 'bg-cyan-950 text-cyan-300 border-cyan-800/50',
  anschlussschreiben: 'bg-cyan-950 text-cyan-200 border-cyan-800/50',
  regulierung: 'bg-green-950 text-green-300 border-green-800/50',
  abgeschlossen: 'bg-zinc-800 text-zinc-300 border-zinc-700/50',
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
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const STATUS_ICON: Record<string, typeof FileTextIcon> = {
  ersterfassung: FileTextIcon,
  'sv-zugewiesen': UserCheckIcon,
  'sv-termin': CalendarIcon,
  'gutachten-eingegangen': ClipboardCheckIcon,
  filmcheck: FilmIcon,
  'kanzlei-uebergeben': ScaleIcon,
  anschlussschreiben: MailIcon,
  regulierung: BadgeEuroIcon,
  abgeschlossen: CheckCircle2Icon,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function DispatchBoard({
  faelle,
  leadMap,
  svMap,
}: {
  faelle: Fall[]
  leadMap: Record<string, string>
  svMap: Record<string, string>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [filterUrsache, setFilterUrsache] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(fallId: string, newStatus: string) {
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

  // Filter
  const filtered = faelle.filter(f => {
    if (filterUrsache && f.schadens_ursache !== filterUrsache) return false
    if (search) {
      const q = search.toLowerCase()
      const name = f.lead_id ? (leadMap[f.lead_id] ?? '').toLowerCase() : ''
      const nr = (f.fall_nummer ?? '').toLowerCase()
      if (!name.includes(q) && !nr.includes(q)) return false
    }
    return true
  })

  // Unique schadensursachen for filter
  const ursachen = [...new Set(faelle.map(f => f.schadens_ursache).filter(Boolean))] as string[]

  return (
    <div className="px-4 py-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-semibold text-white">Dispatch</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{faelle.length} Fälle in der Pipeline</p>
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

            {/* Schadensart Filter */}
            <select
              value={filterUrsache}
              onChange={e => setFilterUrsache(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Alle Schadensarten</option>
              {ursachen.map(u => (
                <option key={u} value={u}>{URSACHE_LABEL[u] ?? u}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-3 mb-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Pipeline columns - horizontal scroll */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${COLUMNS.length * 200}px` }}>
            {COLUMNS.map(col => {
              const colFaelle = filtered.filter(f => f.status === col.key)
              const Icon = STATUS_ICON[col.key] ?? FileTextIcon

              return (
                <div key={col.key} className="flex-1 min-w-[190px]">
                  {/* Column header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Icon className={`w-3.5 h-3.5 ${col.color}`} />
                    <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                    <span className="text-zinc-600 text-[10px] font-medium bg-zinc-800 px-1.5 py-0.5 rounded-full">
                      {colFaelle.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-24">
                    {colFaelle.length === 0 && (
                      <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center">
                        <p className="text-zinc-700 text-[10px]">Keine Fälle</p>
                      </div>
                    )}
                    {colFaelle.map(fall => (
                      <FallCard
                        key={fall.id}
                        fall={fall}
                        leadMap={leadMap}
                        svMap={svMap}
                        onStatusChange={handleStatusChange}
                        isPending={isPending}
                      />
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

// ─── Fall Card ──────────────────────────────────────────────────────────────

function FallCard({
  fall,
  leadMap,
  svMap,
  onStatusChange,
  isPending,
}: {
  fall: Fall
  leadMap: Record<string, string>
  svMap: Record<string, string>
  onStatusChange: (fallId: string, status: string) => void
  isPending: boolean
}) {
  const days = daysSince(fall.updated_at ?? fall.created_at)
  const UrsacheIcon = fall.schadens_ursache ? (URSACHE_ICON[fall.schadens_ursache] ?? HelpCircleIcon) : null
  const kundeName = fall.lead_id ? leadMap[fall.lead_id] ?? '—' : '—'
  const svName = fall.sv_id ? svMap[fall.sv_id] ?? null : null

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
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
          days > 7 ? 'bg-red-950 text-red-400' : days > 3 ? 'bg-amber-950 text-amber-400' : 'bg-zinc-800 text-zinc-500'
        }`}>
          {days}d
        </span>
      </div>

      {/* Kundenname */}
      <p className="text-zinc-200 text-sm font-medium leading-snug mb-1.5 truncate">{kundeName}</p>

      {/* Schadensart */}
      {UrsacheIcon && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <UrsacheIcon className="w-3 h-3 text-zinc-500" />
          <span className="text-zinc-500 text-[11px]">
            {URSACHE_LABEL[fall.schadens_ursache!] ?? fall.schadens_ursache}
          </span>
        </div>
      )}

      {/* SV */}
      {svName && (
        <div className="flex items-center gap-1.5 mb-2">
          <UserCheckIcon className="w-3 h-3 text-zinc-600" />
          <span className="text-zinc-500 text-[11px] truncate">{svName}</span>
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
          {COLUMNS.map(col => (
            <option key={col.key} value={col.key}>{col.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
