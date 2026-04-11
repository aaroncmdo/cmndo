'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, subMonths, isSameMonth, isSameDay, isToday, isBefore,
  startOfDay,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ClipboardListIcon, PhoneIcon, UsersIcon, CoffeeIcon, XIcon, CheckIcon, SearchIcon } from 'lucide-react'
import { getKalenderTermine } from '@/lib/actions/admin-kalender'
import { createAdminTermin, updateAdminTermin, deleteAdminTermin } from '@/lib/actions/admin-termine-actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type FallTermin = { id: string; fall_nummer: string | null; sv_termin: string; sv_id: string | null; status: string }
type TaskTermin = { id: string; fall_id: string | null; titel: string; faellig_am: string; status: string }
type Gutachter = { id: string; name: string; typ: string; avatar_url?: string }

type TypFilter = { gutachter: boolean; rueckruf: boolean; kunde: boolean; intern: boolean; kb_beratung: boolean }

type KalenderTermin = {
  id: string; typ: 'gutachter' | 'rueckruf' | 'kunde' | 'intern' | 'task' | 'kb_beratung'
  titel: string; start: string; end?: string; farbe: string
  gutachterName?: string; gutachterId?: string; fallId?: string; fallNummer?: string; link?: string; status?: string; overdue?: boolean
}

const FARBEN: Record<string, string> = { gutachter: '#4573A2', rueckruf: '#E89B3C', kunde: '#5DAA80', intern: '#7B7B8A', task: '#f97316', kb_beratung: '#C9A84C' }
const TYP_LABELS: Record<string, string> = { gutachter: 'Gutachter', rueckruf: 'Rueckruf', kunde: 'Kunde', intern: 'Intern', kb_beratung: 'KB-Beratung' }
const TYP_ICONS: Record<string, typeof CalendarIcon> = { gutachter: CalendarIcon, rueckruf: PhoneIcon, kunde: UsersIcon, intern: CoffeeIcon, kb_beratung: PhoneIcon }
const SV_TYP_BADGE: Record<string, { label: string; color: string }> = {
  'kfz-gutachter': { label: 'KFZ', color: 'bg-blue-100 text-blue-700' },
  'dat-gutachter': { label: 'DAT', color: 'bg-orange-100 text-orange-700' },
  'akademie': { label: 'Akademie', color: 'bg-green-100 text-green-700' },
  'gutachterbuero': { label: 'Buero', color: 'bg-purple-100 text-purple-700' },
}

const STORAGE_KEY = 'claimondo_admin_kalender_filter'

function loadFilter(): { typFilter: TypFilter; gutachterIds: string[] } {
  if (typeof window === 'undefined') return { typFilter: { gutachter: true, rueckruf: true, kunde: true, intern: true, kb_beratung: true }, gutachterIds: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Ensure kb_beratung key exists (backward-compat)
      if (parsed.typFilter && parsed.typFilter.kb_beratung === undefined) {
        parsed.typFilter.kb_beratung = true
      }
      return parsed
    }
  } catch { /* */ }
  return { typFilter: { gutachter: true, rueckruf: true, kunde: true, intern: true, kb_beratung: true }, gutachterIds: [] }
}

function saveFilter(typFilter: TypFilter, gutachterIds: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ typFilter, gutachterIds })) } catch { /* */ }
}

// ─── Main ───────────────────────────────────────────────────────────────────

type ManuellerTermin = { id: string; fall_id: string | null; typ: string; datum: string; dauer_minuten: number; betreff: string | null; status: string }

export default function KalenderClient({
  faelle, tasks, termine: manuelleTermine, svMap, fallMap, gutachterList,
}: {
  faelle: FallTermin[]; tasks: TaskTermin[]; termine?: ManuellerTermin[]; svMap: Record<string, string>; fallMap: Record<string, string>; gutachterList: Gutachter[]
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [typFilter, setTypFilter] = useState<TypFilter>({ gutachter: true, rueckruf: true, kunde: true, intern: true, kb_beratung: true })
  const [gutachterIds, setGutachterIds] = useState<string[]>([])
  const [gutachterOpen, setGutachterOpen] = useState(false)
  const [gutachterSearch, setGutachterSearch] = useState('')
  const [serverTermine, setServerTermine] = useState<KalenderTermin[]>([])
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; date?: Date; termin?: KalenderTermin } | null>(null)

  // Load filter from localStorage
  useEffect(() => {
    const saved = loadFilter()
    setTypFilter(saved.typFilter)
    setGutachterIds(saved.gutachterIds)
  }, [])

  // Save filter changes
  useEffect(() => { saveFilter(typFilter, gutachterIds) }, [typFilter, gutachterIds])

  // Load admin_termine from server
  const loadServerTermine = useCallback(async () => {
    const calDays = viewMode === 'week'
      ? { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }
      : { start: startOfMonth(currentDate), end: endOfMonth(currentDate) }
    const termine = await getKalenderTermine(
      calDays.start.toISOString(), calDays.end.toISOString(), typFilter, gutachterIds,
    )
    setServerTermine(termine)
  }, [currentDate, viewMode, typFilter, gutachterIds])

  useEffect(() => { loadServerTermine() }, [loadServerTermine])

  // Build entries (combine SSR faelle/tasks + server admin_termine)
  const entries = useMemo<KalenderTermin[]>(() => {
    const items: KalenderTermin[] = []
    const now = startOfDay(new Date())

    // Gutachter-Termine from SSR (filtered client-side)
    if (typFilter.gutachter) {
      for (const f of faelle) {
        if (gutachterIds.length > 0 && f.sv_id && !gutachterIds.includes(f.sv_id)) continue
        items.push({
          id: `sv-${f.id}`, typ: 'gutachter',
          titel: f.fall_nummer ?? f.id.slice(0, 8),
          start: f.sv_termin, farbe: FARBEN.gutachter,
          gutachterId: f.sv_id ?? undefined, gutachterName: f.sv_id ? svMap[f.sv_id] : undefined,
          fallId: f.id, fallNummer: f.fall_nummer ?? undefined,
          link: `/admin/faelle/${f.id}`, status: f.status,
          overdue: isBefore(new Date(f.sv_termin), now) && f.status !== 'abgeschlossen',
        })
      }
    }

    // Tasks (always shown)
    for (const t of tasks) {
      items.push({
        id: `task-${t.id}`, typ: 'task',
        titel: t.titel, start: t.faellig_am, farbe: FARBEN.task,
        fallId: t.fall_id ?? undefined, fallNummer: t.fall_id ? fallMap[t.fall_id] : undefined,
        link: t.fall_id ? `/admin/faelle/${t.fall_id}` : '/admin/tasks',
        overdue: isBefore(new Date(t.faellig_am), now) && t.status !== 'erledigt',
      })
    }

    // BUG-08: Manuelle Termine aus termine-Tabelle
    for (const mt of manuelleTermine ?? []) {
      const terminTyp = mt.typ === 'video-call' ? 'kunde' : mt.typ === 'telefonat' ? 'rueckruf' : 'intern'
      if (terminTyp === 'kunde' && !typFilter.kunde) continue
      if (terminTyp === 'rueckruf' && !typFilter.rueckruf) continue
      if (terminTyp === 'intern' && !typFilter.intern) continue
      items.push({
        id: `termin-${mt.id}`, typ: terminTyp,
        titel: mt.betreff ?? `${mt.typ} (${mt.dauer_minuten} Min)`,
        start: mt.datum, farbe: FARBEN[terminTyp],
        fallId: mt.fall_id ?? undefined, fallNummer: mt.fall_id ? fallMap[mt.fall_id] : undefined,
        link: mt.fall_id ? `/admin/faelle/${mt.fall_id}` : undefined,
      })
    }

    // Server admin_termine
    for (const st of serverTermine) {
      items.push(st)
    }

    return items
  }, [faelle, tasks, manuelleTermine, svMap, fallMap, typFilter, gutachterIds, serverTermine])

  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      return eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) })
    }
    const ms = startOfMonth(currentDate)
    return eachDayOfInterval({ start: startOfWeek(ms, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }) })
  }, [currentDate, viewMode])

  function getEntriesForDay(day: Date) {
    return entries.filter(e => isSameDay(new Date(e.start), day))
  }

  function navigate(dir: 'prev' | 'next') {
    if (viewMode === 'month') {
      setCurrentDate(dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    } else {
      setCurrentDate(new Date(currentDate.getTime() + (dir === 'next' ? 7 : -7) * 86400000))
    }
  }

  function toggleTyp(key: keyof TypFilter) {
    setTypFilter(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const allGutachterSelected = gutachterIds.length === 0
  const filteredGutachter = gutachterList.filter(g =>
    gutachterSearch === '' || g.name.toLowerCase().includes(gutachterSearch.toLowerCase())
  )

  function toggleGutachter(id: string) {
    setGutachterIds(prev => {
      if (prev.length === 0) {
        // Currently "all" — switch to "all except this one"
        return gutachterList.filter(g => g.id !== id).map(g => g.id)
      }
      return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    })
  }

  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div className="h-full overflow-y-auto py-6">
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Kalender</h1>
            <p className="text-gray-500 text-sm mt-0.5">Termine & Aufgaben</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'month' ? 'bg-[#1E3A5F] text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                Monat
              </button>
              <button onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-[#1E3A5F] text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                Woche
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate('prev')} className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">Heute</button>
              <button onClick={() => navigate('next')} className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="text-gray-900 text-sm font-medium ml-2">
              {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : "'KW' w, MMMM yyyy", { locale: de })}
            </span>
          </div>
        </div>

        {/* KFZ-138: Filter-Bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Typ-Toggles */}
          {(Object.keys(TYP_LABELS) as (keyof TypFilter)[]).map(key => {
            const active = typFilter[key]
            const Icon = TYP_ICONS[key]
            return (
              <button key={key} onClick={() => toggleTyp(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? `text-white border-transparent`
                    : `bg-white border-gray-200 text-gray-500 hover:border-gray-300`
                }`}
                style={active ? { backgroundColor: FARBEN[key] } : {}}>
                <Icon className="w-3.5 h-3.5" />
                {TYP_LABELS[key]}
              </button>
            )
          })}

          {/* Gutachter-Multiselect */}
          <div className="relative">
            <button
              onClick={() => typFilter.gutachter && setGutachterOpen(!gutachterOpen)}
              disabled={!typFilter.gutachter}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                typFilter.gutachter
                  ? 'bg-white border-gray-200 text-gray-700 hover:border-[#4573A2]'
                  : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
              }`}
              title={!typFilter.gutachter ? 'Gutachter-Termine sind ausgeblendet' : undefined}>
              <UsersIcon className="w-3.5 h-3.5" />
              {allGutachterSelected ? 'Alle Gutachter' : gutachterIds.length === 0 ? 'Keine' : `Gutachter (${gutachterIds.length} von ${gutachterList.length})`}
            </button>

            {gutachterOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input value={gutachterSearch} onChange={e => setGutachterSearch(e.target.value)}
                      placeholder="Suchen..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#4573A2]" />
                  </div>
                </div>
                <div className="px-2 py-1.5 border-b border-gray-100">
                  <button onClick={() => setGutachterIds(allGutachterSelected ? [] : [])}
                    className="text-xs text-[#4573A2] font-medium hover:underline">
                    {allGutachterSelected ? 'Alle abwaehlen' : 'Alle auswaehlen'}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {filteredGutachter.map(g => {
                    const selected = allGutachterSelected || gutachterIds.includes(g.id)
                    const badge = SV_TYP_BADGE[g.typ]
                    return (
                      <button key={g.id} onClick={() => toggleGutachter(g.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 transition-colors">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          selected ? 'bg-[#4573A2] border-[#4573A2]' : 'border-gray-300'
                        }`}>
                          {selected && <CheckIcon className="w-3 h-3 text-white" />}
                        </div>
                        <div className="w-6 h-6 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                          {g.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="text-xs text-gray-800 flex-1 truncate">{g.name}</span>
                        {badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button onClick={() => setGutachterOpen(false)}
                    className="w-full py-1.5 text-xs font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors">
                    Fertig
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calendar grid */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-2 py-2.5 text-center text-gray-500 text-xs font-medium">{d}</div>
            ))}
          </div>

          <div className={`grid grid-cols-7 ${viewMode === 'week' ? '' : 'auto-rows-fr'}`}>
            {calendarDays.map((day, i) => {
              const dayEntries = getEntriesForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const todayFlag = isToday(day)

              return (
                <div key={i} onClick={() => setModal({ mode: 'create', date: day })}
                  className={`border-b border-r border-gray-200/50 p-1.5 cursor-pointer hover:bg-gray-50/50 ${
                    viewMode === 'week' ? 'min-h-48' : 'min-h-24'
                  } ${!isCurrentMonth && viewMode === 'month' ? 'bg-[#f8f9fb]/50' : ''}`}>
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    todayFlag ? 'bg-[#1E3A5F] text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    {format(day, 'd')}
                  </div>

                  <div className="space-y-0.5" onClick={e => e.stopPropagation()}>
                    {dayEntries.slice(0, viewMode === 'week' ? 10 : 3).map(entry => {
                      const isAdminTermin = ['rueckruf', 'kunde', 'intern'].includes(entry.typ)
                      return isAdminTermin ? (
                        <button key={entry.id} onClick={() => setModal({ mode: 'edit', termin: entry })}
                          className="block w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight truncate transition-colors"
                          style={{ backgroundColor: entry.farbe + '15', color: entry.farbe, borderLeft: `3px solid ${entry.farbe}` }}>
                          <span className="truncate block">{entry.titel}</span>
                        </button>
                      ) : (
                        <Link key={entry.id} href={entry.link ?? '#'}
                          className={`block px-1.5 py-0.5 rounded text-[10px] leading-tight truncate transition-colors ${
                            entry.overdue ? 'bg-red-50/80 text-red-400' : ''
                          }`}
                          style={!entry.overdue ? { backgroundColor: entry.farbe + '15', color: entry.farbe, borderLeft: `3px solid ${entry.farbe}` } : { borderLeft: '3px solid #ef4444' }}>
                          <span className="truncate block">{entry.titel}</span>
                          {entry.gutachterName && viewMode === 'week' && (
                            <span className="text-[9px] opacity-70 truncate block">{entry.gutachterName}</span>
                          )}
                        </Link>
                      )
                    })}
                    {dayEntries.length > (viewMode === 'week' ? 10 : 3) && (
                      <span className="text-gray-400 text-[10px] px-1.5">+{dayEntries.length - (viewMode === 'week' ? 10 : 3)} mehr</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* CRUD Modal */}
      {modal && (
        <TerminModal
          mode={modal.mode}
          date={modal.date}
          termin={modal.termin}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadServerTermine() }}
        />
      )}
    </div>
  )
}

// ─── CRUD Modal ─────────────────────────────────────────────────────────────

function TerminModal({ mode, date, termin, onClose, onSaved }: {
  mode: 'create' | 'edit'; date?: Date; termin?: KalenderTermin; onClose: () => void; onSaved: () => void
}) {
  const [typ, setTyp] = useState<'rueckruf' | 'kunde' | 'intern'>(
    (termin?.typ as 'rueckruf' | 'kunde' | 'intern') || 'rueckruf'
  )
  const [titel, setTitel] = useState(termin?.titel ?? '')
  const [startZeit, setStartZeit] = useState(() => {
    if (termin?.start) return termin.start.slice(0, 16)
    if (date) { const d = new Date(date); d.setHours(9, 0, 0, 0); return d.toISOString().slice(0, 16) }
    return new Date().toISOString().slice(0, 16)
  })
  const [dauer, setDauer] = useState(30)
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Don't allow editing gutachter-termine or tasks through this modal
  if (mode === 'edit' && termin && !['rueckruf', 'kunde', 'intern'].includes(termin.typ)) {
    return null
  }

  async function handleSave() {
    if (!titel.trim()) return
    setLoading(true)
    const start = new Date(startZeit)
    const end = new Date(start.getTime() + dauer * 60 * 1000)

    try {
      if (mode === 'create') {
        await createAdminTermin({
          typ, titel: titel.trim(),
          start_zeit: start.toISOString(), end_zeit: end.toISOString(),
        })
      } else if (termin) {
        await updateAdminTermin(termin.id, {
          typ, titel: titel.trim(),
          start_zeit: start.toISOString(), end_zeit: end.toISOString(),
        })
      }
      onSaved()
    } catch { /* */ }
    setLoading(false)
  }

  async function handleDelete() {
    if (!termin) return
    setLoading(true)
    try { await deleteAdminTermin(termin.id); onSaved() } catch { /* */ }
    setLoading(false)
  }

  async function handleStatusChange(status: 'offen' | 'erledigt' | 'abgesagt') {
    if (!termin) return
    setLoading(true)
    try {
      const { setAdminTerminStatus } = await import('@/lib/actions/admin-termine-actions')
      await setAdminTerminStatus(termin.id, status)
      onSaved()
    } catch { /* */ }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Neuer Termin' : 'Termin bearbeiten'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
        </div>

        {/* Typ-Pills */}
        <div className="flex gap-2 mb-4">
          {(['rueckruf', 'kunde', 'intern'] as const).map(t => (
            <button key={t} onClick={() => setTyp(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                typ === t ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
              }`}
              style={typ === t ? { backgroundColor: FARBEN[t] } : {}}>
              {TYP_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Titel *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
          <input type="datetime-local" value={startZeit} onChange={e => setStartZeit(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />
          <select value={dauer} onChange={e => setDauer(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]">
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 Stunde</option>
            <option value={90}>1,5 Stunden</option>
            <option value={120}>2 Stunden</option>
          </select>
        </div>

        {/* Status-Buttons (nur Edit) */}
        {mode === 'edit' && termin && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => handleStatusChange('erledigt')} disabled={loading}
              className="flex-1 py-2 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50">
              Erledigt
            </button>
            <button onClick={() => handleStatusChange('abgesagt')} disabled={loading}
              className="flex-1 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
              Absagen
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {mode === 'edit' && (
            confirmDelete ? (
              <button onClick={handleDelete} disabled={loading}
                className="px-3 py-2.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50">
                Wirklich löschen?
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="px-3 py-2.5 text-sm font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                Löschen
              </button>
            )
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={loading || !titel.trim()}
            className="px-4 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors disabled:opacity-50">
            {loading ? '...' : mode === 'create' ? 'Erstellen' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
