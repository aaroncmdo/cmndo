'use client'

import { useEffect, useId, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, MessageSquareIcon, ActivityIcon, CheckSquareIcon } from 'lucide-react'

type Notification = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  link: string | null
  gelesen: boolean
  erstellt_am: string
}

// AAR-225: Tasks-Tab — eigene Tabelle (tasks) statt benachrichtigungen.
type TaskItem = {
  id: string
  titel: string
  beschreibung: string | null
  status: string | null
  prioritaet: number | null
  deadline: string | null
  fall_id: string | null
  lead_id: string | null
  created_at: string
}

type Tab = 'updates' | 'tasks' | 'nachrichten'

const TYP_ICONS: Record<string, string> = {
  'neuer-lead': '📋', 'neuer-fall': '📁', 'gutachten-upload': '📄', 'qc-bestanden': '✅',
  'qc-fehlgeschlagen': '❌', 'kanzlei-uebergabe': '⚖️', 'zahlung': '💶', 'task-zugewiesen': '📌',
  'task-ueberfaellig': '⚠️', 'termin-bestaetigt': '📅', 'dokument-upload': '📎',
  'chat': '💬', 'system': '🔔',
}

// AAR-212: variant-Prop für dunkle Header (Gutachter-Portal = Navy). Default
// 'light' = grau-outline (Admin/weisse Header); 'dark' = weiß-gefüllt für Navy.
export default function NotificationBell({ variant = 'light' }: { variant?: 'light' | 'dark' } = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  // AAR-701: Channel-Name muss pro Mount eindeutig sein. Bell wird in 4
  // Portal-Shells gerendert, plus React-Strict-Mode-Doppelmount → ohne
  // useId() kollidiert der fixe Channel-Name und Supabase wirft
  // „cannot add postgres_changes callbacks for ... after subscribe()".
  const channelId = useId()

  // AAR-225 Audit: Bell wird in 4 Shells montiert (admin/gutachter/kunde/dispatch).
  // Tasks-Click muss role-aware routen, sonst landen Sub-Rollen auf 403-
  // Routen ihrer Schwesterportale.
  const portalPrefix =
    pathname?.startsWith('/gutachter') ? 'gutachter' :
    pathname?.startsWith('/kunde') ? 'kunde' :
    pathname?.startsWith('/dispatch') ? 'dispatch' :
    'admin'
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('updates')
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  // AAR-225: Tasks-State (offene Tasks für aktuellen User).
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser())?.data?.user
    const userId = user?.id
    const [{ data: notifData }, { count }, { data: taskData }] = await Promise.all([
      supabase
        .from('benachrichtigungen')
        .select('id, typ, titel, beschreibung, link, gelesen, erstellt_am')
        .order('erstellt_am', { ascending: false })
        .limit(20),
      supabase
        .from('benachrichtigungen')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false),
      // AAR-225: Tasks für aktuellen User (zugewiesen_an ODER empfaenger_user_id),
      // nur offene (status != 'erledigt'). Limit 20 für Performance.
      userId
        ? supabase
            .from('tasks')
            .select('id, titel, beschreibung, status, prioritaet, deadline, fall_id, lead_id, created_at')
            .or(`zugewiesen_an.eq.${userId},empfaenger_user_id.eq.${userId}`)
            .neq('status', 'erledigt')
            .order('deadline', { ascending: true, nullsFirst: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ])
    setItems(notifData ?? [])
    setUnread(count ?? 0)
    setTasks((taskData ?? []) as TaskItem[])
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Realtime — auf benachrichtigungen UND tasks
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-and-tasks-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'benachrichtigungen' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load, channelId])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleClick(item: Notification) {
    if (!item.gelesen) {
      await supabase.from('benachrichtigungen').update({ gelesen: true }).eq('id', item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, gelesen: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    if (item.link) router.push(item.link)
  }

  // KFZ-130: Klick auf gebuendelte Nachricht — alle im Bundle als gelesen markieren
  async function handleBundleClick(bundle: { latest: Notification; count: number; ids: string[] }) {
    const unreadIds = bundle.ids.filter(id => {
      const item = items.find(i => i.id === id)
      return item && !item.gelesen
    })
    if (unreadIds.length > 0) {
      await supabase.from('benachrichtigungen').update({ gelesen: true }).in('id', unreadIds)
      setItems(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, gelesen: true } : n))
      setUnread(prev => Math.max(0, prev - unreadIds.length))
    }
    setOpen(false)
    if (bundle.latest.link) router.push(bundle.latest.link)
  }

  async function markAllRead() {
    const ids = items.filter(n => !n.gelesen).map(n => n.id)
    if (!ids.length) return
    await supabase.from('benachrichtigungen').update({ gelesen: true }).in('id', ids)
    setItems(prev => prev.map(n => ({ ...n, gelesen: true })))
    setUnread(0)
  }

  // Split into tabs
  const chatTypes = new Set(['chat', 'nachricht'])
  const rawNachrichten = items.filter(i => chatTypes.has(i.typ))
  const updates = items.filter(i => !chatTypes.has(i.typ))

  // KFZ-130: Nachrichten buendeln nach link (= Fall-URL) + titel (= Absender)
  const bundled = useMemo(() => {
    const groups = new Map<string, { latest: Notification; count: number; ids: string[] }>()
    for (const n of rawNachrichten) {
      const key = `${n.link ?? ''}||${n.titel ?? ''}`
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, { latest: n, count: 1, ids: [n.id] })
      } else {
        existing.count++
        existing.ids.push(n.id)
        if (new Date(n.erstellt_am) > new Date(existing.latest.erstellt_am)) {
          existing.latest = n
        }
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.latest.erstellt_am).getTime() - new Date(a.latest.erstellt_am).getTime()
    )
  }, [rawNachrichten])

  // Gebuendelter unread count fuer Badge (Anzahl Gruppen, nicht einzelne Nachrichten)
  const bundledUnreadCount = bundled.filter(b => !b.latest.gelesen || b.ids.some(id => {
    const item = items.find(i => i.id === id)
    return item && !item.gelesen
  })).length

  // AAR-225: Task-Click → routet zum relevanten Fall/Lead-Kontext, role-aware.
  // - admin/dispatch → /admin/faelle/[id] bzw /dispatch/leads/[id]
  // - gutachter      → /gutachter/fall/[id] (kein Lead-Kontext für SV)
  // - kunde          → /kunde/fall/[id]
  function taskLink(task: TaskItem): string | null {
    if (task.fall_id) {
      if (portalPrefix === 'gutachter') return `/gutachter/fall/${task.fall_id}`
      if (portalPrefix === 'kunde') return `/kunde/fall/${task.fall_id}`
      return `/faelle/${task.fall_id}#tasks`
    }
    if (task.lead_id) {
      // SVs haben keinen Lead-Zugriff — fallback Dashboard.
      if (portalPrefix === 'gutachter') return '/gutachter'
      if (portalPrefix === 'kunde') return '/kunde'
      return `/dispatch/leads/${task.lead_id}`
    }
    return null
  }
  async function handleTaskClick(task: TaskItem) {
    setOpen(false)
    const link = taskLink(task)
    if (link) router.push(link)
  }
  // Überfällige Tasks für Badge-Counter.
  const now = new Date()
  const tasksOverdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < now).length

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${
          variant === 'dark'
            ? 'text-white hover:bg-white/10'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
        }`}
        aria-label="Benachrichtigungen">
        <BellIcon
          className="w-4.5 h-4.5"
          fill={variant === 'dark' ? 'currentColor' : 'none'}
        />
        {/* AAR-225 Audit: Bell-Badge = Summe ALLER Tabs (unread + überfällige
            Tasks + ungelesene Nachrichten-Bundles) — vorher zählte sie nur
            unread benachrichtigungen, überfällige Tasks blieben unsichtbar
            wenn das Updates-Tab leer war. */}
        {(unread + tasksOverdueCount + bundledUnreadCount) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
            {(() => {
              const total = unread + tasksOverdueCount + bundledUnreadCount
              return total > 99 ? '99+' : total
            })()}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[350px] max-h-[500px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* Header + Tabs */}
          <div className="px-4 pt-3 pb-0 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Benachrichtigungen</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-[#4573A2] hover:text-[#4573A2] transition-colors">
                  Alle gelesen
                </button>
              )}
            </div>
            {/* AAR-225: 3 Tabs (Updates / Tasks / Nachrichten) mit Tab-spezifischen
                Badge-Countern. Tasks zeigt rote Badge nur für überfällige. */}
            <div className="flex gap-4">
              <TabButton
                active={tab === 'updates'}
                onClick={() => setTab('updates')}
                icon={<ActivityIcon className="w-3.5 h-3.5" />}
                label="Updates"
                badge={updates.filter(u => !u.gelesen).length}
              />
              <TabButton
                active={tab === 'tasks'}
                onClick={() => setTab('tasks')}
                icon={<CheckSquareIcon className="w-3.5 h-3.5" />}
                label="Tasks"
                badge={tasks.length}
                badgeColor={tasksOverdueCount > 0 ? 'red' : 'blue'}
              />
              <TabButton
                active={tab === 'nachrichten'}
                onClick={() => setTab('nachrichten')}
                icon={<MessageSquareIcon className="w-3.5 h-3.5" />}
                label="Nachrichten"
                badge={bundledUnreadCount}
              />
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'updates' ? (
              /* Updates Tab — einzelne Benachrichtigungen */
              updates.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-gray-400 text-sm">Keine Updates</p>
                </div>
              ) : (
                updates.map(item => (
                  <button key={item.id} onClick={() => handleClick(item)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!item.gelesen ? 'bg-[#4573A2]/10' : ''}`}>
                    <div className="flex items-start gap-3">
                      {!item.gelesen && <div className="w-2 h-2 rounded-full bg-[#4573A2] mt-1.5 shrink-0" />}
                      {item.gelesen && <div className="w-2 shrink-0" />}
                      <div className="w-6 h-6 flex items-center justify-center text-sm shrink-0">
                        {TYP_ICONS[item.typ] ?? '🔔'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-snug ${item.gelesen ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                          {item.titel}
                        </p>
                        {item.beschreibung && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.beschreibung}</p>}
                        <p className="text-[11px] text-gray-300 mt-1">{timeAgo(item.erstellt_am)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )
            ) : tab === 'tasks' ? (
              /* AAR-225: Tasks Tab — offene Tasks für aktuellen User */
              tasks.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-gray-400 text-sm">Keine offenen Tasks</p>
                </div>
              ) : (
                tasks.map(t => {
                  const overdue = t.deadline && new Date(t.deadline) < now
                  return (
                    <button key={t.id} onClick={() => handleTaskClick(t)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${overdue ? 'bg-red-50/50' : ''}`}>
                      <div className="flex items-start gap-3">
                        {overdue ? (
                          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                        ) : (
                          <div className="w-2 shrink-0" />
                        )}
                        <div className="w-6 h-6 flex items-center justify-center text-sm shrink-0">
                          {overdue ? '⚠️' : '📌'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-gray-900 font-medium">{t.titel}</p>
                          {t.beschreibung && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{t.beschreibung}</p>}
                          <p className={`text-[11px] mt-1 ${overdue ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                            {t.deadline
                              ? overdue
                                ? `Überfällig seit ${timeAgo(t.deadline)}`
                                : `Fällig ${new Date(t.deadline).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
                              : 'Ohne Frist'}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })
              )
            ) : (
              /* KFZ-130: Nachrichten Tab — gebuendelt */
              bundled.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-gray-400 text-sm">Keine Nachrichten</p>
                </div>
              ) : (
                bundled.map(bundle => {
                  const item = bundle.latest
                  const hasUnread = bundle.ids.some(id => {
                    const n = items.find(i => i.id === id)
                    return n && !n.gelesen
                  })
                  return (
                    <button key={`bundle-${item.id}`} onClick={() => handleBundleClick(bundle)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${hasUnread ? 'bg-[#4573A2]/10' : ''}`}>
                      <div className="flex items-start gap-3">
                        {hasUnread && <div className="w-2 h-2 rounded-full bg-[#4573A2] mt-1.5 shrink-0" />}
                        {!hasUnread && <div className="w-2 shrink-0" />}
                        <div className="w-6 h-6 flex items-center justify-center text-sm shrink-0">💬</div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm leading-snug ${hasUnread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            {item.titel}
                          </p>
                          {item.beschreibung && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.beschreibung}</p>}
                          <p className="text-[11px] text-gray-300 mt-1">{timeAgo(item.erstellt_am)}</p>
                        </div>
                        {/* KFZ-130: Badge mit Anzahl rechts */}
                        {bundle.count > 1 && (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#4573A2] text-[10px] font-bold text-white leading-none shrink-0 self-center">
                            {bundle.count}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// AAR-225: TabButton mit optionalem Badge-Counter (Anzahl unread/Tasks).
function TabButton({
  active, onClick, icon, label, badge, badgeColor = 'blue',
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge: number
  badgeColor?: 'red' | 'blue'
}) {
  const badgeClass = badgeColor === 'red' ? 'bg-red-500' : 'bg-[#4573A2]'
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
        active ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}
      {label}
      {badge > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full ${badgeClass} text-[9px] font-bold text-white leading-none`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'Gerade eben'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  if (days < 7) return `vor ${days} Tag${days > 1 ? 'en' : ''}`
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
