'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PhoneIcon, CalendarIcon, CheckIcon, ClipboardListIcon, FolderOpenIcon,
  AlertTriangleIcon, MessageCircleIcon, InfoIcon, BanknoteIcon, ClockIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/* ── Types ─────────────────────────────────────────────────────────────── */
type Termin = { id: string; fallId: string; zeit: string; uhrzeit: string; svName: string; kunde: string; kennzeichen: string | null; adresse: string; status: string }
type Rueckruf = { id: string; name: string; telefon: string | null; datum: string; notiz: string | null }
type TLEvent = { zeit: string; uhrzeit: string; typ: 'termin' | 'task-done' | 'task-offen' | 'nachricht' | 'system' | 'zahlung' | 'fall-neu'; titel: string; detail: string; fallId?: string; link?: string }
type Task = { id: string; titel: string; fallNr: string; fallId: string | null; deadline: string | null; prioritaet: string | null; typ: string | null }
type Fall = { id: string; fallNr: string; kunde: string; schadentyp: string | null; datum: string }

const TL_CFG: Record<string, { dot: string; fg: string }> = {
  termin:       { dot: 'bg-[#4573A2]', fg: 'text-[#4573A2]' },
  'fall-neu':   { dot: 'bg-[#4573A2]', fg: 'text-[#4573A2]' },
  'task-done':  { dot: 'bg-green-500', fg: 'text-green-500' },
  'task-offen': { dot: 'bg-orange-500', fg: 'text-orange-500' },
  nachricht:    { dot: 'bg-purple-500', fg: 'text-purple-500' },
  system:       { dot: 'bg-gray-400',  fg: 'text-gray-400' },
  zahlung:      { dot: 'bg-emerald-500', fg: 'text-emerald-500' },
}

const TL_ICON: Record<string, typeof CalendarIcon> = {
  termin: CalendarIcon, 'fall-neu': FolderOpenIcon, 'task-done': CheckIcon,
  'task-offen': ClockIcon, nachricht: MessageCircleIcon, system: InfoIcon, zahlung: BanknoteIcon,
}

const fmt = (d: string | null) => d ? new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'

/* ── Component ─────────────────────────────────────────────────────────── */
export default function DashboardClient({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [mobileTab, setMobileTab] = useState<'heute' | 'tasks' | 'kpis'>('heute')

  // Day-dependent (left)
  const [termine, setTermine] = useState<Termin[]>([])
  const [rueckrufe, setRueckrufe] = useState<Rueckruf[]>([])
  const [tlEvents, setTlEvents] = useState<TLEvent[]>([])

  // Always current (right)
  const [tasks, setTasks] = useState<Task[]>([])
  const [neueFaelle, setNeueFaelle] = useState<Fall[]>([])
  const [stats, setStats] = useState({ leads: 0, faelle: 0, konvertiert: 0, ueberfaellig: 0 })

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const datumLabel = isToday
    ? `HEUTE ${selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}`
    : selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })

  const load = useCallback(async () => {
    const ds = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).toISOString()
    const de = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1).toISOString()
    const now = new Date()
    const monatStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // ── Day-dependent queries ──
    const [gtR, rueckR] = await Promise.all([
      // Gutachter-Termine am ausgewählten Tag
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
    ])

    // Resolve SV names + Lead names for termine
    const svIds = [...new Set((gtR.data ?? []).map(f => f.sv_id).filter(Boolean) as string[])]
    const leadIds = [...new Set((gtR.data ?? []).map(f => f.lead_id).filter(Boolean) as string[])]
    let svMap: Record<string, string> = {}
    let leadMap: Record<string, string> = {}
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

    const termineData: Termin[] = (gtR.data ?? []).map(f => ({
      id: f.id, fallId: f.id, zeit: f.sv_termin!, uhrzeit: fmt(f.sv_termin),
      svName: svMap[f.sv_id ?? ''] ?? '—', kunde: leadMap[f.lead_id ?? ''] ?? '—',
      kennzeichen: f.kennzeichen ?? null,
      adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '),
      status: f.status as string,
    }))
    setTermine(termineData)
    setRueckrufe((rueckR.data ?? []).map(r => ({
      id: r.id, name: [r.vorname, r.nachname].filter(Boolean).join(' ') || '—',
      telefon: r.telefon ?? null, datum: r.rueckruf_datum!, notiz: r.rueckruf_notiz ?? null,
    })))

    // ── Timeline events ──
    const tl: TLEvent[] = []
    for (const t of termineData) {
      tl.push({ zeit: t.zeit, uhrzeit: t.uhrzeit, typ: 'termin', titel: `Termin: ${t.kunde}`, detail: `SV: ${t.svName}${t.kennzeichen ? ` · ${t.kennzeichen}` : ''}`, fallId: t.fallId })
    }

    // Timeline + Nachrichten for active faelle
    const activeFallIds = (gtR.data ?? []).map(f => f.id)
    if (activeFallIds.length > 0) {
      const [tlR, msgR] = await Promise.all([
        supabase.from('timeline').select('id, fall_id, titel, beschreibung, created_at').in('fall_id', activeFallIds).gte('created_at', ds).lt('created_at', de).limit(20),
        supabase.from('nachrichten').select('id, fall_id, nachricht, sender_rolle, created_at').in('fall_id', activeFallIds).gte('created_at', ds).lt('created_at', de).limit(15),
      ])
      for (const e of tlR.data ?? []) tl.push({ zeit: e.created_at ?? ds, uhrzeit: fmt(e.created_at), typ: 'system', titel: e.titel ?? 'System', detail: (e.beschreibung ?? '').slice(0, 80), fallId: e.fall_id ?? undefined })
      for (const m of msgR.data ?? []) tl.push({ zeit: m.created_at ?? ds, uhrzeit: fmt(m.created_at), typ: 'nachricht', titel: `Nachricht (${m.sender_rolle ?? 'System'})`, detail: (m.nachricht ?? '').slice(0, 80), fallId: m.fall_id ?? undefined })
    }

    tl.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime())
    setTlEvents(tl.slice(0, 50))

    // ── Always-current queries (right column) ──
    const [tasksR, neueR, leadsC, faelleC, konvR] = await Promise.all([
      supabase.from('tasks').select('id, titel, typ, fall_id, faellig_am, prioritaet, faelle(fall_nummer)').in('status', ['offen', 'in-bearbeitung']).order('faellig_am', { ascending: true }).limit(25),
      supabase.from('faelle').select('id, fall_nummer, lead_id, schadenfall_typ, created_at').is('sv_id', null).not('status', 'in', '("abgeschlossen","storniert")').order('created_at', { ascending: false }).limit(10),
      supabase.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '("disqualifiziert","kalt")'),
      supabase.from('faelle').select('id', { count: 'exact', head: true }).not('status', 'in', '("abgeschlossen","storniert")'),
      supabase.from('leads').select('id').eq('status', 'umgewandelt').gte('updated_at', monatStart),
    ])

    // Resolve lead names for neue Fälle
    const neueLeadIds = (neueR.data ?? []).map(f => f.lead_id).filter(Boolean) as string[]
    let neuLeadMap: Record<string, string> = {}
    if (neueLeadIds.length > 0) {
      const { data: nls } = await supabase.from('leads').select('id, vorname, nachname').in('id', neueLeadIds)
      for (const l of nls ?? []) neuLeadMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
    }

    setTasks((tasksR.data ?? []).map(t => {
      const fr = t.faelle as Record<string, unknown> | null
      return { id: t.id, titel: t.titel, fallNr: (fr?.fall_nummer as string) ?? '—', fallId: t.fall_id, deadline: t.faellig_am, prioritaet: t.prioritaet, typ: t.typ ?? null }
    }))
    setNeueFaelle((neueR.data ?? []).map(f => ({
      id: f.id, fallNr: f.fall_nummer ?? f.id.slice(0, 8), kunde: neuLeadMap[f.lead_id ?? ''] ?? '—',
      schadentyp: f.schadenfall_typ ?? null, datum: f.created_at ? new Date(f.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '',
    })))

    const ueberfaellig = (tasksR.data ?? []).filter(t => t.faellig_am && new Date(t.faellig_am) < now).length
    setStats({ leads: leadsC.count ?? 0, faelle: faelleC.count ?? 0, konvertiert: (konvR.data ?? []).length, ueberfaellig })
    setLoading(false)
  }, [supabase, selectedDate, userId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" /></div>

  const nowMs = Date.now()

  // JETZT position for timeline
  let jetztIdx = -1
  if (isToday && tlEvents.length > 0) {
    jetztIdx = tlEvents.findIndex(e => new Date(e.zeit).getTime() > nowMs)
    if (jetztIdx === -1) jetztIdx = tlEvents.length
  }

  /* ── Left column content ──────────────────────────────────────────── */
  const leftColumn = (
    <div className="space-y-4">
      {/* Termine */}
      <div>
        <h3 className="text-sm font-semibold text-[#0D1B3E] mb-2 flex items-center gap-1.5">
          <CalendarIcon className="w-4 h-4 text-[#4573A2]" /> Gutachter-Termine ({termine.length})
        </h3>
        {termine.length === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-4 text-center">Keine Termine</p>
        ) : termine.map(t => (
          <Link key={t.id} href={`/admin/faelle/${t.fallId}`}
            className="block bg-white border border-gray-200 rounded-lg p-3 mb-2 hover:shadow-sm hover:border-[#4573A2]/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-[#4573A2] tabular-nums w-14 shrink-0">{t.uhrzeit}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#0D1B3E] truncate">{t.kunde}</p>
                <p className="text-xs text-gray-500 truncate">SV: {t.svName}{t.kennzeichen ? ` · ${t.kennzeichen}` : ''}</p>
                <p className="text-[10px] text-gray-400 truncate">{t.adresse}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Rückrufe */}
      {rueckrufe.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#0D1B3E] mb-2 flex items-center gap-1.5">
            <PhoneIcon className="w-4 h-4 text-amber-500" /> Rückrufe ({rueckrufe.length})
          </h3>
          {rueckrufe.map(r => {
            const overdue = new Date(r.datum).getTime() < nowMs
            return (
              <div key={r.id} className={`flex items-center gap-2 bg-white border rounded-lg p-2.5 mb-1.5 ${overdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                <span className="text-xs font-bold tabular-nums text-gray-700 w-12 shrink-0">{fmt(r.datum)}</span>
                <span className="text-xs text-[#0D1B3E] font-medium truncate flex-1">{r.name}</span>
                {r.telefon && <a href={`tel:${r.telefon}`} className="text-green-600 hover:text-green-500 shrink-0 p-1" aria-label="Anrufen"><PhoneIcon className="w-3.5 h-3.5" /></a>}
                <Link href={`/admin/dispatch/lead/${r.id}`} className="text-[10px] text-[#4573A2] hover:underline shrink-0">Details</Link>
              </div>
            )
          })}
        </div>
      )}

      {/* Tages-Timeline */}
      <div>
        <h3 className="text-sm font-semibold text-[#0D1B3E] mb-3 flex items-center gap-1.5">
          <ClockIcon className="w-4 h-4 text-[#4573A2]" /> Tagesverlauf
        </h3>
        {tlEvents.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <CalendarIcon className="w-7 h-7 text-gray-300 mx-auto mb-1" />
            <p className="text-xs text-gray-400">Keine Aktivitäten</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[23px] top-2 bottom-2 w-0.5 bg-gray-200" />
            {tlEvents.map((ev, idx) => {
              const cfg = TL_CFG[ev.typ] ?? TL_CFG.system
              const Icon = TL_ICON[ev.typ] ?? InfoIcon
              const past = isToday ? new Date(ev.zeit).getTime() < nowMs : selectedDate < new Date(new Date().toDateString())
              return (
                <div key={`${ev.typ}-${idx}`}>
                  {isToday && idx === jetztIdx && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="w-12 shrink-0" />
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100 shrink-0 z-10" />
                      <div className="flex-1 h-px bg-red-300" />
                      <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">JETZT</span>
                    </div>
                  )}
                  <div className={`flex items-start gap-2 py-1.5 group ${past ? 'opacity-50' : ''} ${ev.fallId ? 'cursor-pointer' : ''}`}
                    onClick={() => ev.fallId && router.push(`/admin/faelle/${ev.fallId}`)}>
                    <span className="text-xs text-gray-400 tabular-nums w-12 shrink-0 text-right pt-0.5">{ev.uhrzeit}</span>
                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ring-2 ring-white mt-1 shrink-0 z-10`} />
                    <div className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-white px-3 py-2 group-hover:shadow-sm transition-all">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${past ? 'text-gray-400' : cfg.fg}`} />
                        <span className="text-xs font-semibold text-[#0D1B3E] truncate">{ev.titel}</span>
                      </div>
                      {ev.detail && <p className="text-[11px] text-gray-500 truncate mt-0.5 pl-5">{ev.detail}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
            {isToday && jetztIdx === tlEvents.length && (
              <div className="flex items-center gap-2 my-2">
                <div className="w-12 shrink-0" />
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-100 shrink-0 z-10" />
                <div className="flex-1 h-px bg-red-300" />
                <span className="text-[9px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">JETZT</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  /* ── Right column content ─────────────────────────────────────────── */
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
      {/* Header bar */}
      <div className="h-10 flex items-center justify-between px-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#0D1B3E]">Dashboard</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() - 86400000))} aria-label="Vorheriger Tag" className="text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">◀</button>
            <button onClick={() => setSelectedDate(new Date())} aria-label="Zurück zu heute" className="text-xs text-gray-600 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100">{datumLabel}</button>
            <button onClick={() => setSelectedDate(d => new Date(d.getTime() + 86400000))} aria-label="Nächster Tag" className="text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 text-xs">▶</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-medium">
          <span className="bg-[#4573A2]/5 text-[#4573A2] px-2 py-0.5 rounded-full">{termine.length} Termine</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full hidden sm:inline">{tasks.length} Tasks</span>
          {stats.ueberfaellig > 0 && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">{stats.ueberfaellig} überfällig</span>}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex lg:hidden border-b border-gray-200 flex-shrink-0">
        {(['heute', 'tasks', 'kpis'] as const).map(t => (
          <button key={t} onClick={() => setMobileTab(t)}
            className={`flex-1 py-2 text-xs font-medium border-b-2 ${mobileTab === t ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400'}`}>
            {t === 'heute' ? 'Heute' : t === 'tasks' ? 'Tasks' : 'KPIs'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Tagesansicht (day-dependent) */}
        <div className={`overflow-y-auto p-4 border-r border-gray-200 ${mobileTab !== 'heute' ? 'hidden lg:block' : ''}`}>
          {leftColumn}
        </div>

        {/* Right: Tasks + KPIs (always current) */}
        <div className={`overflow-y-auto p-4 ${mobileTab === 'heute' ? 'hidden lg:block' : mobileTab === 'tasks' ? '' : ''}`}>
          {mobileTab === 'kpis' ? (
            <div className="lg:hidden">{rightColumn}</div>
          ) : mobileTab === 'tasks' ? (
            <div className="lg:hidden">{rightColumn}</div>
          ) : null}
          <div className="hidden lg:block">{rightColumn}</div>
        </div>
      </div>
    </div>
  )
}
