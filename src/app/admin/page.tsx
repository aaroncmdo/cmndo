import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import StatusChart from './StatusChart'
import MeineAufgabenServer from '@/components/MeineAufgabenServer'

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten eingeg.',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

const STATUS_CHART_COLOR: Record<string, string> = {
  ersterfassung: '#71717a',
  'sv-zugewiesen': '#3b82f6',
  'sv-termin': '#60a5fa',
  'gutachten-eingegangen': '#8b5cf6',
  filmcheck: '#eab308',
  'kanzlei-uebergeben': '#22c55e',
  anschlussschreiben: '#4ade80',
  regulierung: '#10b981',
  abgeschlossen: '#34d399',
  storniert: '#ef4444',
}

const TASK_STATUS_COLOR: Record<string, string> = {
  offen: 'bg-blue-50 text-blue-300',
  'in-bearbeitung': 'bg-amber-50 text-amber-300',
  erledigt: 'bg-green-50 text-green-300',
  blockiert: 'bg-red-50 text-red-300',
}

const TASK_TYP_LABEL: Record<string, string> = {
  filmcheck: 'Filmcheck',
  'kanzlei-anschlussschreiben': 'Anschlussschreiben',
  'kanzlei-nachfrage': 'Kanzlei Nachfrage',
  'versicherung-kontakt': 'Versicherung',
  'kunde-rueckfrage': 'Kunde Rückfrage',
  'sv-termin': 'SV Termin',
  'zahlung-pruefen': 'Zahlung prüfen',
}

export default async function AdminPage() {
  const supabase = await createClient()

  const [
    { count: faelleCount },
    { count: leadsCount },
    { data: allFaelle },
    { data: tasks },
    { data: svFaelle },
    { data: convertedLeads },
    { data: abgeschlossen },
  ] = await Promise.all([
    supabase.from('faelle').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    // All faelle with status for donut chart
    supabase.from('faelle').select('status'),
    // Latest 5 tasks
    supabase
      .from('tasks')
      .select('id, titel, typ, status, fall_id, faellig_am, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    // SV workload: faelle per sv_id (only active, not storniert/abgeschlossen)
    supabase
      .from('faelle')
      .select('sv_id')
      .not('sv_id', 'is', null)
      .not('status', 'in', '("abgeschlossen","storniert")'),
    // Leads that have been converted to faelle
    supabase
      .from('faelle')
      .select('lead_id')
      .not('lead_id', 'is', null),
    // Completed cases for average processing time
    supabase
      .from('faelle')
      .select('created_at, regulierung_am')
      .eq('status', 'abgeschlossen'),
  ])

  // ── Donut chart data ──────────────────────────────────────────────────────
  const statusCounts: Record<string, number> = {}
  for (const f of allFaelle ?? []) {
    statusCounts[f.status] = (statusCounts[f.status] ?? 0) + 1
  }
  const chartData = Object.entries(statusCounts)
    .map(([status, count]) => ({
      name: STATUS_LABEL[status] ?? status,
      value: count,
      color: STATUS_CHART_COLOR[status] ?? '#71717a',
    }))
    .sort((a, b) => b.value - a.value)

  // ── SV workload top 3 ────────────────────────────────────────────────────
  const svCounts: Record<string, number> = {}
  for (const f of svFaelle ?? []) {
    if (f.sv_id) svCounts[f.sv_id] = (svCounts[f.sv_id] ?? 0) + 1
  }
  const topSvIds = Object.entries(svCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  // Fetch SV names for top 3
  let svProfiles: Record<string, string> = {}
  if (topSvIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', topSvIds.map(([id]) => id))
    svProfiles = Object.fromEntries(
      (profiles ?? []).map(p => [
        p.id,
        `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || p.id.slice(0, 8),
      ])
    )
  }

  // ── Conversion rate ───────────────────────────────────────────────────────
  const uniqueLeadIds = new Set((convertedLeads ?? []).map(f => f.lead_id))
  const totalLeads = leadsCount ?? 0
  const convertedCount = uniqueLeadIds.size
  const conversionRate = totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 100) : 0

  // ── Average processing time ───────────────────────────────────────────────
  let avgDays = 0
  const completed = (abgeschlossen ?? []).filter(f => f.regulierung_am)
  if (completed.length > 0) {
    const totalDays = completed.reduce((sum, f) => {
      const start = new Date(f.created_at).getTime()
      const end = new Date(f.regulierung_am!).getTime()
      return sum + (end - start) / (1000 * 60 * 60 * 24)
    }, 0)
    avgDays = Math.round(totalDays / completed.length)
  }

  // ── Fall lookup for tasks ─────────────────────────────────────────────────
  const taskFallIds = (tasks ?? []).map(t => t.fall_id).filter(Boolean)
  let fallMap: Record<string, string> = {}
  if (taskFallIds.length > 0) {
    const { data: taskFaelle } = await supabase
      .from('faelle')
      .select('id, fall_nummer')
      .in('id', taskFallIds)
    fallMap = Object.fromEntries(
      (taskFaelle ?? []).map(f => [f.id, f.fall_nummer ?? f.id.slice(0, 8)])
    )
  }

  // ── Heutige Rückrufe ────────────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const { data: rueckrufe } = await supabase
    .from('leads')
    .select('id, vorname, nachname, telefon, schadenfall_typ, rueckruf_datum, rueckruf_notiz, rueckruf_erledigt')
    .not('rueckruf_datum', 'is', null)
    .or(`rueckruf_erledigt.is.null,rueckruf_erledigt.eq.false`)
    .lte('rueckruf_datum', todayEnd.toISOString())
    .order('rueckruf_datum', { ascending: true })

  const heutigeRueckrufe = (rueckrufe ?? []).filter(r => r.rueckruf_datum)
  const nowMs = Date.now()

  return (
    <div className="px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Dashboard</h1>
        </div>

        {/* ── Heutige Rückrufe (KFZ-51) ──────────────────────────────────── */}
        {heutigeRueckrufe.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-600 text-lg">📞</span>
              <h2 className="text-sm font-semibold text-amber-700">Heutige Rückrufe ({heutigeRueckrufe.length})</h2>
            </div>
            <div className="space-y-2">
              {heutigeRueckrufe.map(r => {
                const name = [r.vorname, r.nachname].filter(Boolean).join(' ') || '—'
                const time = new Date(r.rueckruf_datum!)
                const isOverdue = time.getTime() < nowMs
                return (
                  <Link key={r.id} href={`/admin/dispatch/lead/${r.id}`}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      isOverdue ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-100'
                    } hover:shadow-sm`}>
                    <span className={`text-sm font-bold tabular-nums shrink-0 w-20 ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                      {isOverdue ? 'ÜBERFÄLLIG' : time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-sm font-medium truncate">{name}</p>
                      {r.rueckruf_notiz && <p className="text-gray-400 text-xs truncate">{r.rueckruf_notiz}</p>}
                    </div>
                    {r.schadenfall_typ && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">{r.schadenfall_typ.toUpperCase()}</span>}
                    {r.telefon && (
                      <a href={`tel:${r.telefon}`} onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-600 text-xs font-medium hover:bg-green-100 shrink-0">
                        📞 Anrufen
                      </a>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Meine Aufgaben (Admin sieht alle) ───────────────────────────── */}
        {/* @ts-expect-error Async Server Component */}
        <MeineAufgabenServer mode="admin" title="Alle offenen Aufgaben" />
        <div className="mb-4" />

        {/* ── Row 1: Quick stats ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Link
            href="/admin/faelle"
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors group"
          >
            <div className="text-3xl font-bold text-gray-900 mb-1 group-hover:text-blue-400 transition-colors">
              {faelleCount ?? 0}
            </div>
            <div className="text-gray-500 text-sm font-medium">Fälle</div>
          </Link>
          <Link
            href="/admin/dispatch"
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors group"
          >
            <div className="text-3xl font-bold text-gray-900 mb-1 group-hover:text-blue-400 transition-colors">
              {leadsCount ?? 0}
            </div>
            <div className="text-gray-500 text-sm font-medium">Leads</div>
          </Link>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className={`text-3xl font-bold mb-1 ${conversionRate >= 50 ? 'text-green-400' : conversionRate >= 25 ? 'text-amber-400' : 'text-gray-900'}`}>
              {conversionRate}%
            </div>
            <div className="text-gray-500 text-sm font-medium">Conversion</div>
            <div className="text-gray-400 text-xs mt-0.5">{convertedCount} von {totalLeads} Leads</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {completed.length > 0 ? avgDays : '—'}
            </div>
            <div className="text-gray-500 text-sm font-medium">Ø Tage</div>
            <div className="text-gray-400 text-xs mt-0.5">
              {completed.length > 0 ? `${completed.length} abgeschlossen` : 'Keine Daten'}
            </div>
          </div>
        </div>

        {/* ── Row 2: Chart + SVs + Tasks ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Donut chart */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">
              Fälle nach Status
            </h3>
            {chartData.length > 0 ? (
              <StatusChart data={chartData} total={faelleCount ?? 0} />
            ) : (
              <p className="text-gray-400 text-sm">Keine Fälle vorhanden.</p>
            )}
          </div>

          {/* SV Auslastung */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">
              SV Auslastung (Top 3)
            </h3>
            {topSvIds.length > 0 ? (
              <div className="space-y-3">
                {topSvIds.map(([svId, count], i) => {
                  const maxCount = topSvIds[0][1]
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={svId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-800 text-sm font-medium truncate">
                          {svProfiles[svId] ?? svId.slice(0, 8)}
                        </span>
                        <span className="text-gray-500 text-sm font-semibold tabular-nums ml-2">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            i === 0 ? 'bg-blue-500' : i === 1 ? 'bg-blue-500/70' : 'bg-blue-500/40'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Keine SVs zugewiesen.</p>
            )}
          </div>

          {/* Letzte 5 Tasks */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                Letzte Tasks
              </h3>
              <Link href="/admin/tasks" className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                Alle →
              </Link>
            </div>
            {tasks?.length ? (
              <div className="space-y-2.5">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 py-2 border-b border-gray-200/50 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-800 text-sm leading-snug truncate">{task.titel}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-gray-400 text-xs font-mono">
                          {fallMap[task.fall_id] ?? '—'}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-500 text-xs">
                          {TASK_TYP_LABEL[task.typ] ?? task.typ}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shrink-0 ${
                      TASK_STATUS_COLOR[task.status] ?? 'bg-gray-100 text-gray-700'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Keine Tasks vorhanden.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
