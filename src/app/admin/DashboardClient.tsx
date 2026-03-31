'use client'

import Link from 'next/link'
import { PhoneIcon, ClockIcon, AlertTriangleIcon, FolderOpenIcon, CheckCircleIcon } from 'lucide-react'

type Rueckruf = { id: string; name: string; telefon: string | null; schadentyp: string | null; datum: string; notiz: string | null }
type TimelineItem = { zeit: string; typ: string; label: string; detail: string; link?: string }
type Task = { id: string; titel: string; fallNr: string; fallId: string | null; deadline: string | null; prioritaet: string | null }
type Fall = { id: string; fallNr: string; kundeName: string | null; status: string; phase: string }

const PHASE_COLOR: Record<string, string> = {
  ersterfassung: 'bg-gray-100 text-gray-600',
  'sv-zugewiesen': 'bg-blue-50 text-blue-600',
  'sv-termin': 'bg-blue-50 text-blue-500',
  besichtigung: 'bg-indigo-50 text-indigo-600',
  'gutachten-eingegangen': 'bg-violet-50 text-violet-600',
  filmcheck: 'bg-amber-50 text-amber-600',
  'kanzlei-uebergeben': 'bg-green-50 text-green-600',
  anschlussschreiben: 'bg-green-50 text-green-500',
  regulierung: 'bg-emerald-50 text-emerald-600',
  abgeschlossen: 'bg-emerald-100 text-emerald-700',
}

const TYP_STYLE: Record<string, { bg: string; text: string }> = {
  telefonat: { bg: 'bg-blue-100', text: 'text-blue-700' },
  'video-call': { bg: 'bg-purple-100', text: 'text-purple-700' },
  gutachter: { bg: 'bg-orange-100', text: 'text-orange-700' },
  rueckruf: { bg: 'bg-amber-100', text: 'text-amber-700' },
  task: { bg: 'bg-red-100', text: 'text-red-700' },
}

// Time slots 08:00 - 18:00
const SLOTS = Array.from({ length: 11 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`)

export default function DashboardClient({
  rueckrufe, timeline, tasks, faelle, stats, datumLabel,
}: {
  rueckrufe: Rueckruf[]
  timeline: TimelineItem[]
  tasks: Task[]
  faelle: Fall[]
  stats: { leads: number; faelleCount: number; konvertiert: number; ueberfaellig: number }
  datumLabel: string
}) {
  const nowMs = Date.now()

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header: 40px */}
      <div className="flex items-center justify-between px-4 py-2 h-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-900">Dashboard</h1>
          <span className="text-gray-400 text-xs">{datumLabel}</span>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-blue-600 font-medium">{stats.faelleCount} Fälle</span>
          <span className="text-green-600 font-medium">{stats.leads} Leads</span>
          {stats.ueberfaellig > 0 && <span className="text-red-600 font-semibold">{stats.ueberfaellig} überfällig</span>}
        </div>
      </div>

      {/* Rückrufe (amber) */}
      {rueckrufe.length > 0 && (
        <div className="mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <PhoneIcon className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Rückrufe heute ({rueckrufe.length})</span>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {rueckrufe.map(r => {
              const t = new Date(r.datum)
              const overdue = t.getTime() < nowMs
              return (
                <Link key={r.id} href={`/admin/dispatch/lead/${r.id}`}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors ${
                    overdue ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-700 border border-gray-100'
                  } hover:shadow-sm`}>
                  <span className="font-bold tabular-nums">{overdue ? '⚠️' : t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="truncate max-w-24">{r.name}</span>
                  {r.telefon && <a href={`tel:${r.telefon}`} onClick={e => e.stopPropagation()} className="text-green-600 hover:text-green-500">📞</a>}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Main: 2-column */}
      <div className="flex-1 min-h-0 flex gap-3 px-4 pb-3">
        {/* LEFT: Tages-Timeline (scrollable) */}
        <div className="flex-[3] min-w-0 bg-white border border-gray-200 rounded-xl overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-2">
              <ClockIcon className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-semibold text-gray-900">Tages-Timeline</span>
              <span className="text-[10px] text-gray-400 ml-auto">{timeline.length} Einträge</span>
            </div>
          </div>
          <div className="relative px-3 py-2">
            {SLOTS.map(slot => {
              const slotItems = timeline.filter(t => {
                const h = new Date(t.zeit).getHours()
                return `${String(h).padStart(2, '0')}:00` === slot
              })
              return (
                <div key={slot} className="flex gap-3 min-h-[36px] border-b border-gray-50 py-1">
                  <span className="text-[10px] text-gray-300 font-mono w-10 shrink-0 pt-0.5">{slot}</span>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {slotItems.map((item, i) => {
                      const s = TYP_STYLE[item.typ] ?? TYP_STYLE.task
                      const content = (
                        <div key={i} className={`${s.bg} ${s.text} text-[11px] font-medium px-2 py-1 rounded-md truncate max-w-full`}>
                          {item.label} <span className="font-normal opacity-70">{item.detail}</span>
                        </div>
                      )
                      return item.link ? <Link key={i} href={item.link} className="block max-w-full">{content}</Link> : content
                    })}
                  </div>
                </div>
              )
            })}
            {timeline.length === 0 && (
              <div className="py-8 text-center text-gray-400 text-xs">Keine Termine oder Tasks für heute</div>
            )}
          </div>
        </div>

        {/* RIGHT: Tasks + Fälle + Stats (scrollable) */}
        <div className="flex-[2] min-w-0 flex flex-col gap-3 overflow-y-auto">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <Link href="/admin/dispatch" className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
              <p className="text-lg font-bold text-gray-900">{stats.leads}</p>
              <p className="text-[10px] text-gray-500">Offene Leads</p>
            </Link>
            <Link href="/admin/faelle" className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
              <p className="text-lg font-bold text-gray-900">{stats.faelleCount}</p>
              <p className="text-[10px] text-gray-500">Aktive Fälle</p>
            </Link>
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-lg font-bold text-green-600">{stats.konvertiert}</p>
              <p className="text-[10px] text-gray-500">Heute konvertiert</p>
            </div>
            <div className={`bg-white border rounded-xl p-3 ${stats.ueberfaellig > 0 ? 'border-red-200' : 'border-gray-200'}`}>
              <p className={`text-lg font-bold ${stats.ueberfaellig > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.ueberfaellig}</p>
              <p className="text-[10px] text-gray-500">Überfällige Tasks</p>
            </div>
          </div>

          {/* Meine Tasks */}
          <div className="bg-white border border-gray-200 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" /> Offene Tasks ({tasks.length})
              </span>
              <Link href="/admin/tasks" className="text-[10px] text-blue-600 hover:text-blue-500">Alle →</Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-xs">Keine offenen Tasks</div>
              ) : tasks.map(t => {
                const overdue = t.deadline && new Date(t.deadline) < new Date()
                return (
                  <Link key={t.id} href={t.fallId ? `/admin/faelle/${t.fallId}` : '#'}
                    className={`block px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/30' : ''}`}>
                    <p className="text-xs text-gray-800 font-medium truncate">{t.titel}</p>
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

          {/* Meine Fälle */}
          <div className="bg-white border border-gray-200 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                <FolderOpenIcon className="w-3.5 h-3.5 text-blue-500" /> Meine Fälle ({faelle.length})
              </span>
              <Link href="/admin/faelle" className="text-[10px] text-blue-600 hover:text-blue-500">Alle →</Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              {faelle.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-xs">Keine aktiven Fälle</div>
              ) : faelle.map(f => (
                <Link key={f.id} href={`/admin/faelle/${f.id}`}
                  className="block px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-800 font-medium truncate">{f.kundeName ?? f.fallNr}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-2 ${PHASE_COLOR[f.status] ?? 'bg-gray-100 text-gray-600'}`}>{f.phase}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">{f.fallNr}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
