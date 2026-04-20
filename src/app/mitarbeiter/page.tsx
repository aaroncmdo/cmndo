// AAR-61: Mitarbeiter-Portal Dashboard
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FolderOpenIcon, CheckSquareIcon, MessageCircleIcon, AlertCircleIcon, CalendarIcon, PhoneCallIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterDashboard() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Zugewiesene Faelle (kundenbetreuer_id = user.id, nicht abgeschlossen/storniert)
  const { data: faelle, count: faelleCount } = await supabase
    .from('faelle')
    .select('id, fall_nummer, status, kennzeichen, created_at, lead_id', { count: 'exact' })
    .eq('kundenbetreuer_id', user.id)
    .not('status', 'in', '("abgeschlossen","storniert")')
    .order('created_at', { ascending: false })
    .limit(8)

  // Offene Tasks
  const { data: tasks, count: tasksCount } = await supabase
    .from('tasks')
    .select('id, titel, fall_id, prioritaet, faellig_am, created_at', { count: 'exact' })
    .eq('zugewiesen_an', user.id)
    .eq('status', 'offen')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .limit(8)

  // Unread Nachrichten count
  const { count: unreadCount } = await supabase
    .from('nachrichten')
    .select('id', { count: 'exact', head: true })
    .eq('gelesen', false)
    .neq('sender_id', user.id)

  // Reklamationen (offen) — versuche Tabelle, wenn nicht vorhanden ueberspringen
  let reklamationenCount = 0
  try {
    const { count } = await supabase
      .from('reklamationen')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'offen')
    reklamationenCount = count ?? 0
  } catch { /* Tabelle evtl. nicht vorhanden */ }

  // AAR-637: Meine offenen Rückrufe + meine kommenden Termine (admin_termine)
  const nowIso = new Date().toISOString()
  const [rueckrufR, termineR] = await Promise.all([
    supabase
      .from('admin_termine')
      .select(
        'id, start_zeit, titel, notizen, lead_id, fall_id, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon), fall:faelle!admin_termine_fall_id_fkey(id, fall_nummer)',
      )
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .eq('zugewiesen_an', user.id)
      .order('start_zeit', { ascending: true })
      .limit(5),
    supabase
      .from('admin_termine')
      .select('id, typ, start_zeit, titel, fall_id, lead_id, fall:faelle!admin_termine_fall_id_fkey(id, fall_nummer)')
      .in('typ', ['kunde', 'intern'])
      .eq('status', 'offen')
      .eq('zugewiesen_an', user.id)
      .gte('start_zeit', nowIso)
      .order('start_zeit', { ascending: true })
      .limit(5),
  ])
  const meineRueckrufe = rueckrufR.data ?? []
  const meineTermine = termineR.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Mitarbeiter-Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Übersicht über Ihre Fälle, Tasks und Nachrichten.</p>
      </div>

      {/* KPI-Boxen */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiBox icon={FolderOpenIcon} label="Aktive Fälle" value={faelleCount ?? 0} href="/mitarbeiter/faelle" color="blue" />
        <KpiBox icon={CheckSquareIcon} label="Offene Tasks" value={tasksCount ?? 0} href="/mitarbeiter/tasks" color="violet" />
        <KpiBox icon={PhoneCallIcon} label="Rückrufe" value={meineRueckrufe.length} href="/mitarbeiter/termine" color="amber" />
        <KpiBox icon={CalendarIcon} label="Termine" value={meineTermine.length} href="/mitarbeiter/termine" color="blue" />
        <KpiBox icon={MessageCircleIcon} label="Ungelesen" value={unreadCount ?? 0} href="/mitarbeiter/nachrichten" color="emerald" />
        <KpiBox icon={AlertCircleIcon} label="Reklamationen" value={reklamationenCount} href="/mitarbeiter/reklamationen" color="amber" />
      </div>

      {/* Rückrufe + kommende Termine */}
      {(meineRueckrufe.length > 0 || meineTermine.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <PhoneCallIcon className="w-4 h-4 text-amber-500" />
                Offene Rückrufe
              </h2>
              <Link href="/mitarbeiter/termine" className="text-xs text-[#4573A2] hover:underline">Alle</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {meineRueckrufe.map((r) => {
                const leadRaw = r.lead as unknown
                const lead = Array.isArray(leadRaw) ? leadRaw[0] ?? null : (leadRaw as { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | null)
                const fallRaw = r.fall as unknown
                const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; fall_nummer: string | null } | null)
                const name = lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') : fall?.fall_nummer ?? r.titel
                const href = lead ? `/dispatch/leads/${lead.id}` : fall ? `/faelle/${fall.id}` : '#'
                const overdue = new Date(r.start_zeit) < new Date()
                return (
                  <Link key={r.id} href={href} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                        <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {new Date(r.start_zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {overdue && ' (überfällig)'}
                        </p>
                      </div>
                      {lead?.telefon && (
                        <span className="text-xs text-gray-400 ml-2">{lead.telefon}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
              {meineRueckrufe.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">Keine offenen Rückrufe</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-500" />
                Kommende Termine
              </h2>
              <Link href="/mitarbeiter/termine" className="text-xs text-[#4573A2] hover:underline">Alle</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {meineTermine.map((t) => {
                const fallRaw = t.fall as unknown
                const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; fall_nummer: string | null } | null)
                const href = fall ? `/faelle/${fall.id}` : '#'
                return (
                  <Link key={t.id} href={href} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.titel}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(t.start_zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {fall?.fall_nummer ? ` · ${fall.fall_nummer}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{t.typ}</span>
                    </div>
                  </Link>
                )
              })}
              {meineTermine.length === 0 && (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">Keine kommenden Termine</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Faelle-Liste */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Meine aktiven Fälle</h2>
          <Link href="/mitarbeiter/faelle" className="text-xs text-[#4573A2] hover:underline">Alle anzeigen</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {(faelle ?? []).map(f => (
            <Link key={f.id} href={`/faelle/${f.id}`} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{f.fall_nummer ?? f.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{f.kennzeichen ?? '—'}</p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{f.status}</span>
              </div>
            </Link>
          ))}
          {(!faelle || faelle.length === 0) && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Keine aktiven Fälle</p>
          )}
        </div>
      </section>

      {/* Tasks-Liste */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Meine offenen Tasks</h2>
          <Link href="/mitarbeiter/tasks" className="text-xs text-[#4573A2] hover:underline">Alle anzeigen</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {(tasks ?? []).map(t => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.prioritaet === 'kritisch' ? 'bg-red-100 text-red-700' :
                  t.prioritaet === 'dringend' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{t.prioritaet}</span>
                <span className="truncate text-gray-700">{t.titel}</span>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                {t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
              </span>
            </div>
          ))}
          {(!tasks || tasks.length === 0) && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">Keine offenen Tasks</p>
          )}
        </div>
      </section>
    </div>
  )
}

function KpiBox({
  icon: Icon, label, value, href, color,
}: {
  icon: typeof FolderOpenIcon
  label: string
  value: number
  href: string
  color: 'blue' | 'violet' | 'emerald' | 'amber'
}) {
  const colorCls = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }[color]
  return (
    <Link href={href} className={`block border rounded-xl p-3 ${colorCls} hover:shadow-sm transition-shadow`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </Link>
  )
}
