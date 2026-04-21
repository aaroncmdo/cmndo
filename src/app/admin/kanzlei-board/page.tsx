// AAR-64 (refokussiert): Admin-internes Kanzlei-Kommunikationsboard.
// Zeigt: Zugewiesene Kanzleien pro Fall, LexDrive-Webhook-History, eingehende LexDrive-Tasks.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ScaleIcon, MailIcon, AlertCircleIcon, ClockIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function KanzleiBoard() {
  const db = await createClient()

  // 1. Zugewiesene Kanzleien (parteien.rolle = kanzlei)
  const { data: kanzleiParteien } = await db
    .from('parteien')
    .select('id, fall_id, name, email, telefon, created_at, faelle(fall_nummer, status, kennzeichen)')
    .eq('rolle', 'kanzlei')
    .order('created_at', { ascending: false })
    .limit(50)

  // 2. LexDrive Webhook-History (source = lexdrive)
  const { data: webhookEvents } = await db
    .from('webhook_events')
    .select('id, event_id, event_type, fall_id, fall_nr, status, error_message, created_at, processed_at')
    .eq('source', 'lexdrive')
    .order('created_at', { ascending: false })
    .limit(30)

  // 3. Eingehende LexDrive-Tasks
  const { data: lexdriveTasks } = await db
    .from('tasks')
    .select('id, titel, fall_id, status, prioritaet, created_at')
    .like('typ', 'lexdrive%')
    .neq('status', 'erledigt')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Kanzlei-Board</h1>
        <p className="text-sm text-gray-500 mt-1">
          Admin-Sicht auf zugewiesene Kanzleien und LexDrive-Kommunikation. LexDrive nutzt Salesforce intern — kein eigenes Login-Portal.
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiBox icon={ScaleIcon} label="Aktive Kanzlei-Parteien" value={kanzleiParteien?.length ?? 0} color="violet" />
        <KpiBox icon={MailIcon} label="LexDrive-Events" value={webhookEvents?.length ?? 0} color="blue" />
        <KpiBox icon={AlertCircleIcon} label="Offene LexDrive-Tasks" value={lexdriveTasks?.length ?? 0} color="amber" />
      </div>

      {/* Kanzlei-Parteien */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Zugewiesene Kanzleien</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Fall</th>
              <th className="text-left px-4 py-2">Kanzlei</th>
              <th className="text-left px-4 py-2">Kontakt</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Zugewiesen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(kanzleiParteien ?? []).map(p => {
              const fallJoin = p.faelle as unknown as { fall_nummer: string | null; status: string | null; kennzeichen: string | null } | { fall_nummer: string | null; status: string | null; kennzeichen: string | null }[] | null
              const fall = Array.isArray(fallJoin) ? fallJoin[0] : fallJoin
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link href={`/faelle/${p.fall_id}`} className="text-[#4573A2] hover:underline font-medium">
                      {fall?.fall_nummer ?? (p.fall_id as string).slice(0, 8)}
                    </Link>
                    {fall?.kennzeichen && <p className="text-xs text-gray-400">{fall.kennzeichen}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{p.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {p.email ?? '—'}<br />
                    {p.telefon ?? ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{fall?.status ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('de-DE') : '—'}
                  </td>
                </tr>
              )
            })}
            {(!kanzleiParteien || kanzleiParteien.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Keine Kanzleien zugewiesen</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* LexDrive-Webhook-History */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">LexDrive Status-History</h2>
        </div>
        <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
          {(webhookEvents ?? []).map(e => (
            <div key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{e.event_type}</p>
                <p className="text-xs text-gray-500">
                  Fall {e.fall_nr ?? (e.fall_id as string | null)?.slice(0, 8) ?? '—'}
                  {e.error_message && <span className="text-red-500 ml-2">{e.error_message}</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  e.status === 'processed' ? 'bg-emerald-100 text-emerald-700' :
                  e.status === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{e.status}</span>
                <span className="text-xs text-gray-400">
                  {new Date(e.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {(!webhookEvents || webhookEvents.length === 0) && (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">Keine LexDrive-Events</p>
          )}
        </div>
      </section>

      {/* LexDrive-Tasks */}
      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Offene LexDrive-Tasks</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {(lexdriveTasks ?? []).map(t => (
            <Link key={t.id} href={`/faelle/${t.fall_id}`} className="block px-4 py-3 hover:bg-gray-50 transition-colors text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{t.titel}</p>
                  <p className="text-xs text-gray-500">Status: {t.status}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.prioritaet === 'kritisch' ? 'bg-red-100 text-red-700' :
                  t.prioritaet === 'dringend' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{t.prioritaet}</span>
              </div>
            </Link>
          ))}
          {(!lexdriveTasks || lexdriveTasks.length === 0) && (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">Keine offenen LexDrive-Tasks</p>
          )}
        </div>
      </section>
    </div>
  )
}

function KpiBox({
  icon: Icon, label, value, color,
}: {
  icon: typeof ScaleIcon; label: string; value: number; color: 'violet' | 'blue' | 'amber'
}) {
  const cls = {
    violet: 'bg-violet-50 border-violet-200 text-violet-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }[color]
  return (
    <div className={`border rounded-xl p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-5 h-5" />
        <span className="text-xs font-semibold uppercase">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}
