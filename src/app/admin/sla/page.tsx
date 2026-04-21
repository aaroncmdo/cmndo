// AAR-85: SLA-Monitoring Admin-Widget — zeigt pending + breached SLAs
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangleIcon, ClockIcon, CheckCircleIcon } from 'lucide-react'
import { SLA_LABEL, type SlaTyp } from '@/lib/sla/tracker'

export const dynamic = 'force-dynamic'

export default async function SlaMonitoringPage() {
  const db = await createClient()

  const { data: slas } = await db
    .from('sla_tracking')
    .select('id, fall_id, sla_typ, started_at, breach_at, completed_at, status, eskalation_task_id, faelle(fall_nummer)')
    .in('status', ['pending', 'breached'])
    .order('breach_at', { ascending: true })
    .limit(100)

  const now = Date.now()
  const breached = (slas ?? []).filter(s => s.status === 'breached')
  const atRisk = (slas ?? []).filter(s => {
    if (s.status !== 'pending') return false
    const breach = new Date(s.breach_at as string).getTime()
    return breach - now < 30 * 60_000 // weniger als 30 Min bis Breach
  })
  const pending = (slas ?? []).filter(s => s.status === 'pending' && !atRisk.includes(s))

  return (
    <div className="py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">SLA-Monitoring</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung.
        </p>
      </div>

      {/* KPI-Boxen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangleIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Verletzt</span>
          </div>
          <p className="text-3xl font-bold text-red-900 mt-2">{breached.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <ClockIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Risiko (&lt; 30 Min)</span>
          </div>
          <p className="text-3xl font-bold text-amber-900 mt-2">{atRisk.length}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-700">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Offen</span>
          </div>
          <p className="text-3xl font-bold text-blue-900 mt-2">{pending.length}</p>
        </div>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs uppercase text-gray-500">
              <th className="text-left px-4 py-3">Fall</th>
              <th className="text-left px-4 py-3">SLA-Typ</th>
              <th className="text-left px-4 py-3">Frist</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(slas ?? []).map((sla) => {
              const fallJoin = sla.faelle as unknown as { fall_nummer: string | null } | { fall_nummer: string | null }[] | null
              const fallRow = Array.isArray(fallJoin) ? fallJoin[0] : fallJoin
              const fallNr = fallRow?.fall_nummer ?? (sla.fall_id as string).slice(0, 8)
              const breach = new Date(sla.breach_at as string)
              const restMs = breach.getTime() - now
              const restMin = Math.round(restMs / 60_000)
              const isBreached = sla.status === 'breached'
              return (
                <tr key={sla.id as string} className={isBreached ? 'bg-red-50/40' : ''}>
                  <td className="px-4 py-3">
                    <Link href={`/faelle/${sla.fall_id}`} className="font-medium text-[#4573A2] hover:underline">
                      {fallNr}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{SLA_LABEL[sla.sla_typ as SlaTyp]}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {breach.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {!isBreached && (
                      <span className={`ml-2 text-xs ${restMin < 30 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                        {restMin > 0 ? `noch ${restMin} Min` : 'ueberfaellig'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isBreached ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Verletzt</span>
                    ) : restMin < 30 ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Risiko</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Offen</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {sla.eskalation_task_id ? (
                      <Link href={`/admin/aufgaben/alle?id=${sla.eskalation_task_id}`} className="text-xs text-[#4573A2] hover:underline">
                        Task ansehen
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {(!slas || slas.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                  Aktuell keine offenen oder verletzten SLAs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
