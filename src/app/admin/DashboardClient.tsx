'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PhoneIcon, CalendarIcon, CheckIcon, ClipboardListIcon, FolderOpenIcon,
  AlertTriangleIcon, MessageCircleIcon, BanknoteIcon, ClockIcon,
  ChevronLeftIcon, ChevronRightIcon, UserIcon, WrenchIcon, PhoneCallIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/* ── Types ─────────────────────────────────────────────────────────────── */
type CalBlock = {
  id: string
  typ: 'gutachter' | 'rueckruf' | 'kunde'
  startMin: number // minutes since midnight
  dauer: number    // duration in minutes
  label: string
  sublabel: string
  link: string
}

type Task = { id: string; titel: string; fallNr: string; fallId: string | null; deadline: string | null; prioritaet: string | null; typ: string | null }
type Fall = { id: string; fallNr: string; kunde: string; schadentyp: string | null; datum: string }

const HOUR_START = 8
const HOUR_END = 18
const TOTAL_MINUTES = (HOUR_END - HOUR_START) * 60 // 600
const HOUR_PX = 64 // px per hour
const TOTAL_PX = (HOUR_END - HOUR_START) * HOUR_PX

const BLOCK_COLORS = {
  gutachter: { bg: 'bg-[#4573A2]/10', border: 'border-l-[#4573A2]', text: 'text-[#4573A2]', dot: 'bg-[#4573A2]', label: 'Gutachter' },
  rueckruf:  { bg: 'bg-amber-50',     border: 'border-l-amber-500',  text: 'text-amber-700',  dot: 'bg-amber-500',  label: 'Rückruf' },
  kunde:     { bg: 'bg-green-50',     border: 'border-l-green-500',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Kunde' },
}

const BLOCK_ICONS = {
  gutachter: WrenchIcon,
  rueckruf: PhoneCallIcon,
  kunde: UserIcon,
}

function minuteToY(min: number): number {
  const offset = min - HOUR_START * 60
  return Math.max(0, Math.min(TOTAL_PX, (offset / TOTAL_MINUTES) * TOTAL_PX))
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

/* ── Component ─────────────────────────────────────────────────────────── */
export default function DashboardClient({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const calRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [mobileTab, setMobileTab] = useState<'kalender' | 'tasks'>('kalender')
  const [nowMinute, setNowMinute] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })

  // Calendar blocks
  const [blocks, setBlocks] = useState<CalBlock[]>([])

  // Right column
  const [tasks, setTasks] = useState<Task[]>([])
  const [neueFaelle, setNeueFaelle] = useState<Fall[]>([])
  const [stats, setStats] = useState({ leads: 0, faelle: 0, konvertiert: 0, ueberfaellig: 0 })

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const datumLabel = selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  // Update clock every minute
  useEffect(() => {
    const iv = setInterval(() => {
      const n = new Date()
      setNowMinute(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(iv)
  }, [])

  // Scroll to current time on load
  useEffect(() => {
    if (isToday && calRef.current && !loading) {
      const y = minuteToY(nowMinute) - 100
      calRef.current.scrollTop = Math.max(0, y)
    }
  }, [loading, isToday, nowMinute])

  const load = useCallback(async () => {
    setLoading(true)
    const ds = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString()
    const de = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1).toISOString()
    const now = new Date()
    const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // ── Parallel queries ──
    const [gtR, rueckR, termineR, tasksR, neueR, leadsC, faelleC, konvR] = await Promise.all([
      // Gutachter-Termine
      supabase.from('faelle')
        .select('id, fall_nummer, sv_termin, sv_id, schadens_adresse, schadens_plz, schadens_ort, lead_id, kennzeichen, status')
        .not('sv_termin', 'is', null)
        .gte('sv_termin', ds).lt('sv_termin', de)
        .not('status', 'in', '("abgeschlossen","storniert")')
        .order('sv_termin', { ascending: true }),
      // Rückrufe
      supabase.from('leads')
        .select('id, vorname, nachname, telefon, rueckruf_datum, rueckruf_notiz')
        .not('rueckruf_datum', 'is', null)
        .or('rueckruf_erledigt.is.null,rueckruf_erledigt.eq.false')
        .gte('rueckruf_datum', ds).lte('rueckruf_datum', de)
        .order('rueckruf_datum', { ascending: true }),
      // Kunden-Termine
      supabase.from('termine')
        .select('id, fall_id, betreff, datum, dauer_minuten, typ, status')
        .gte('datum', ds).lt('datum', de)
        .not('status', 'eq', 'abgesagt')
        .order('datum', { ascending: true }),
      // Tasks
      supabase.from('tasks').select('id, titel, typ, fall_id, faellig_am, prioritaet, faelle(fall_nummer)').in('status', ['offen', 'in-bearbeitung']).order('faellig_am', { ascending: true }).limit(25),
      // Neue unzugewiesene Fälle
      supabase.from('faelle').select('id, fall_nummer, lead_id, schadenfall_typ, created_at').is('sv_id', null).not('status', 'in', '("abgeschlossen","storniert")').order('created_at', { ascending: false }).limit(10),
      // Stats
      supabase.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '("disqualifiziert","kalt")'),
      supabase.from('faelle').select('id', { count: 'exact', head: true }).not('status', 'in', '("abgeschlossen","storniert")'),
      supabase.from('leads').select('id').eq('status', 'umgewandelt').gte('updated_at', monatStart),
    ])

    // Resolve SV + Lead names
    const svIds = [...new Set((gtR.data ?? []).map(f => f.sv_id).filter(Boolean) as string[])]
    const leadIds = [...new Set([...(gtR.data ?? []).map(f => f.lead_id), ...(neueR.data ?? []).map(f => f.lead_id)].filter(Boolean) as string[])]
    const svMap: Record<string, string> = {}
    const leadMap: Record<string, string> = {}
    const nameBatch: Promise<void>[] = []
    if (svIds.length > 0) {
      nameBatch.push(supabase.from('profiles').select('id, vorname, nachname').in('id', svIds).then(({ data }) => {
        for (const p of data ?? []) svMap[p.id] = [p.vorname, p.nachname].filter(Boolean).join(' ') || '—'
      }))
    }
    if (leadIds.length > 0) {
      nameBatch.push(supabase.from('leads').select('id, vorname, nachname').in('id', leadIds).then(({ data }) => {
        for (const l of data ?? []) leadMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
      }))
    }
    await Promise.all(nameBatch)

    // Build calendar blocks
    const calBlocks: CalBlock[] = []

    // Gutachter-Termine → blue
    for (const f of gtR.data ?? []) {
      const d = new Date(f.sv_termin!)
      const startMin = d.getHours() * 60 + d.getMinutes()
      calBlocks.push({
        id: `gt-${f.id}`,
        typ: 'gutachter',
        startMin,
        dauer: 60, // default 1h
        label: leadMap[f.lead_id ?? ''] ?? '—',
        sublabel: `SV: ${svMap[f.sv_id ?? ''] ?? '—'}${f.kennzeichen ? ` · ${f.kennzeichen}` : ''}`,
        link: `/admin/faelle/${f.id}`,
      })
    }

    // Rückrufe → amber
    for (const r of rueckR.data ?? []) {
      const d = new Date(r.rueckruf_datum!)
      const startMin = d.getHours() * 60 + d.getMinutes()
      const name = [r.vorname, r.nachname].filter(Boolean).join(' ') || '—'
      calBlocks.push({
        id: `rr-${r.id}`,
        typ: 'rueckruf',
        startMin,
        dauer: 15,
        label: name,
        sublabel: r.telefon ?? '',
        link: `/admin/dispatch/lead/${r.id}`,
      })
    }

    // Kunden-Termine → green
    for (const t of termineR.data ?? []) {
      const d = new Date(t.datum!)
      const startMin = d.getHours() * 60 + d.getMinutes()
      calBlocks.push({
        id: `kt-${t.id}`,
        typ: 'kunde',
        startMin,
        dauer: t.dauer_minuten ?? 30,
        label: t.betreff ?? 'Kundentermin',
        sublabel: t.typ ?? '',
        link: t.fall_id ? `/admin/faelle/${t.fall_id}` : '#',
      })
    }

    setBlocks(calBlocks)

    // Tasks
    setTasks((tasksR.data ?? []).map(t => {
      const fr = t.faelle as Record<string, unknown> | null
      return { id: t.id, titel: t.titel, fallNr: (fr?.fall_nummer as string) ?? '—', fallId: t.fall_id, deadline: t.faellig_am, prioritaet: t.prioritaet, typ: t.typ ?? null }
    }))

    // Neue Fälle
    setNeueFaelle((neueR.data ?? []).map(f => ({
      id: f.id, fallNr: f.fall_nummer ?? f.id.slice(0, 8), kunde: leadMap[f.lead_id ?? ''] ?? '—',
      schadentyp: f.schadenfall_typ ?? null, datum: f.created_at ? new Date(f.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '',
    })))

    const ueberfaellig = (tasksR.data ?? []).filter(t => t.faellig_am && new Date(t.faellig_am) < now).length
    setStats({ leads: leadsC.count ?? 0, faelle: faelleC.count ?? 0, konvertiert: (konvR.data ?? []).length, ueberfaellig })
    setLoading(false)
  }, [supabase, selectedDate, userId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" /></div>

  // Count by type for header
  const gutachterCount = blocks.filter(b => b.typ === 'gutachter').length
  const rueckrufCount = blocks.filter(b => b.typ === 'rueckruf').length
  const kundeCount = blocks.filter(b => b.typ === 'kunde').length

  /* ── Tageskalender (08-18 Uhr Stundenraster) ─────────────────────── */
  const kalender = (
    <div ref={calRef} className="flex-1 overflow-y-auto">
      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 flex-shrink-0">
        {Object.entries(BLOCK_COLORS).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-[10px] text-gray-500 font-medium">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="relative" style={{ height: TOTAL_PX, minHeight: TOTAL_PX }}>
        {/* Hour lines */}
        {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
          const hour = HOUR_START + i
          const y = i * HOUR_PX
          return (
            <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: y }}>
              <span className="text-[10px] text-gray-400 font-medium tabular-nums w-12 text-right pr-2 -mt-1.5 shrink-0 select-none">
                {String(hour).padStart(2, '0')}:00
              </span>
              <div className="flex-1 border-t border-gray-100" />
            </div>
          )
        })}

        {/* Half-hour dashed lines */}
        {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
          const y = i * HOUR_PX + HOUR_PX / 2
          return (
            <div key={`half-${i}`} className="absolute right-0" style={{ top: y, left: 48 }}>
              <div className="border-t border-dashed border-gray-50 w-full" />
            </div>
          )
        })}

        {/* RED time arrow (only today) */}
        {isToday && nowMinute >= HOUR_START * 60 && nowMinute <= HOUR_END * 60 && (
          <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: minuteToY(nowMinute) }}>
            <div className="w-12 text-right pr-1">
              <span className="text-[9px] font-bold text-red-500 tabular-nums">
                {String(Math.floor(nowMinute / 60)).padStart(2, '0')}:{String(nowMinute % 60).padStart(2, '0')}
              </span>
            </div>
            <div className="relative flex items-center flex-1">
              {/* Arrow tip */}
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[7px] border-l-red-500 -ml-0.5" />
              <div className="flex-1 h-0.5 bg-red-500" />
            </div>
          </div>
        )}

        {/* Appointment blocks */}
        {blocks.map(block => {
          const cfg = BLOCK_COLORS[block.typ]
          const Icon = BLOCK_ICONS[block.typ]
          const top = minuteToY(block.startMin)
          const height = Math.max(20, (block.dauer / TOTAL_MINUTES) * TOTAL_PX)
          const startH = Math.floor(block.startMin / 60)
          const startM = block.startMin % 60

          return (
            <Link
              key={block.id}
              href={block.link}
              className={`absolute z-10 left-14 right-2 rounded-lg border-l-[3px] ${cfg.border} ${cfg.bg} hover:shadow-md transition-all cursor-pointer overflow-hidden group`}
              style={{ top, height: Math.max(height, 28) }}
            >
              <div className="px-2.5 py-1 h-full flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${cfg.text} shrink-0`} />
                  <span className={`text-[11px] font-semibold ${cfg.text} tabular-nums shrink-0`}>
                    {String(startH).padStart(2, '0')}:{String(startM).padStart(2, '0')}
                  </span>
                  <span className="text-xs font-medium text-gray-800 truncate">{block.label}</span>
                </div>
                {height >= 36 && block.sublabel && (
                  <p className="text-[10px] text-gray-500 truncate mt-0.5 pl-[18px]">{block.sublabel}</p>
                )}
              </div>
            </Link>
          )
        })}

        {/* Empty state */}
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <CalendarIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Keine Termine an diesem Tag</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  /* ── Right column: KPIs + Tasks + Neue Fälle ──────────────────────── */
  const rightColumn = (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/admin/dispatch" className="bg-white border border-gray-200 rounded-xl p-3 hover:border-[#4573A2]/30 transition-colors">
          <p className="text-lg font-bold text-[#0D1B3E]">{stats.leads}</p>
          <p className="text-[10px] text-gray-500">Offene Leads</p>
        </Link>
        <Link href="/admin/faelle" className="bg-white border border-gray-200 rounded-xl p-3 hover:border-[#4573A2]/30 transition-colors">
          <p className="text-lg font-bold text-[#0D1B3E]">{stats.faelle}</p>
          <p className="text-[10px] text-gray-500">Aktive Fälle</p>
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-lg font-bold text-green-600">{stats.konvertiert}</p>
          <p className="text-[10px] text-gray-500">Diesen Monat konvertiert</p>
        </div>
        <div className={`bg-white border rounded-xl p-3 ${stats.ueberfaellig > 0 ? 'border-red-200' : 'border-gray-200'}`}>
          <p className={`text-lg font-bold ${stats.ueberfaellig > 0 ? 'text-red-600' : 'text-[#0D1B3E]'}`}>{stats.ueberfaellig}</p>
          <p className="text-[10px] text-gray-500">Überfällige Tasks</p>
        </div>
      </div>

      {/* Offene Tasks */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#0D1B3E] flex items-center gap-1.5">
            <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" /> Offene Tasks ({tasks.length})
          </span>
          <Link href="/admin/tasks" className="text-[10px] text-[#4573A2] hover:underline">Alle →</Link>
        </div>
        <div className="max-h-60 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-gray-400 text-xs">Keine offenen Tasks</p>
          ) : tasks.map(t => {
            const overdue = t.deadline && new Date(t.deadline) < new Date()
            return (
              <Link key={t.id} href={t.fallId ? `/admin/faelle/${t.fallId}${t.typ ? `?highlight=${t.typ}` : ''}` : '#'}
                className={`block px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                <p className="text-xs text-[#0D1B3E] font-medium truncate">{t.titel}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                  <span className="text-gray-400 font-mono">{t.fallNr}</span>
                  {t.deadline && <span className={overdue ? 'text-red-500 font-semibold' : 'text-gray-400'}>{new Date(t.deadline).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>}
                  {t.prioritaet === 'kritisch' && <span className="bg-red-50 text-red-500 px-1 rounded font-semibold">!</span>}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Neue Fälle (unzugewiesen) */}
      {neueFaelle.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#0D1B3E] flex items-center gap-1.5">
              <FolderOpenIcon className="w-3.5 h-3.5 text-[#4573A2]" /> Neue Fälle ({neueFaelle.length})
            </span>
            <Link href="/admin/faelle" className="text-[10px] text-[#4573A2] hover:underline">Alle →</Link>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {neueFaelle.map(f => (
              <Link key={f.id} href={`/admin/faelle/${f.id}`}
                className="block px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#0D1B3E] font-medium truncate">{f.kunde}</p>
                  <span className="text-[9px] text-gray-400 shrink-0 ml-2">{f.datum}</span>
                </div>
                <div className="flex gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-400 font-mono">{f.fallNr}</span>
                  {f.schadentyp && <span className="text-[9px] bg-[#4573A2]/5 text-[#4573A2] px-1 rounded">{f.schadentyp}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* ── Sticky Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 bg-white border-b border-gray-200 flex-shrink-0" style={{ height: 44 }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#0D1B3E]">Dashboard</span>
          <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-1 py-0.5">
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))} aria-label="Vorheriger Tag"
              className="text-gray-500 hover:text-[#4573A2] hover:bg-white p-1 rounded transition-colors">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button onClick={() => setSelectedDate(new Date())} aria-label="Zurück zu heute"
              className={`text-xs font-medium px-2 py-0.5 rounded transition-colors ${isToday ? 'text-[#4573A2] bg-[#4573A2]/10' : 'text-gray-700 hover:bg-white'}`}>
              {isToday && <span className="font-bold mr-1">HEUTE</span>}
              {datumLabel}
            </button>
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} aria-label="Nächster Tag"
              className="text-gray-500 hover:text-[#4573A2] hover:bg-white p-1 rounded transition-colors">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          {gutachterCount > 0 && (
            <span className="flex items-center gap-1 bg-[#4573A2]/5 text-[#4573A2] px-2 py-0.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-[#4573A2]" /> {gutachterCount} SV
            </span>
          )}
          {rueckrufCount > 0 && (
            <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {rueckrufCount} RR
            </span>
          )}
          {kundeCount > 0 && (
            <span className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> {kundeCount} Kunde
            </span>
          )}
          {stats.ueberfaellig > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">{stats.ueberfaellig} überfällig</span>}
        </div>
      </div>

      {/* ── Mobile tabs ──────────────────────────────────────────────── */}
      <div className="flex lg:hidden border-b border-gray-200 flex-shrink-0">
        {(['kalender', 'tasks'] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${mobileTab === t ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400'}`}>
            {t === 'kalender' ? 'Kalender' : 'Tasks & KPIs'}
          </button>
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_340px]">
        {/* Left: Tageskalender */}
        <div className={`flex flex-col overflow-hidden border-r border-gray-200 ${mobileTab !== 'kalender' ? 'hidden lg:flex' : 'flex'}`}>
          {kalender}
        </div>

        {/* Right: Tasks + KPIs */}
        <div className={`overflow-y-auto p-3 ${mobileTab !== 'tasks' ? 'hidden lg:block' : ''}`}>
          {rightColumn}
        </div>
      </div>
    </div>
  )
}
