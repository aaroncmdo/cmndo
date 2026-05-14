// AAR-85: SLA-Monitoring Admin-Widget — zeigt pending + breached SLAs
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangleIcon, ClockIcon, CheckCircleIcon } from 'lucide-react'
import { SLA_LABEL, type SlaTyp } from '@/lib/sla/tracker'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

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
      <PageHeader
        title="SLA-Monitoring"
        description="Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung."
      />

      {/* KPI-Boxen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-ios-xl p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangleIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Verletzt</span>
          </div>
          <p className="text-3xl font-bold text-red-900 mt-2">{breached.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-ios-xl p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <ClockIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Risiko (&lt; 30 Min)</span>
          </div>
          <p className="text-3xl font-bold text-amber-900 mt-2">{atRisk.length}</p>
        </div>
        <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-4">
          <div className="flex items-center gap-2 text-claimondo-ondo">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase">Offen</span>
          </div>
          <p className="text-3xl font-bold text-claimondo-navy mt-2">{pending.length}</p>
        </div>
      </div>

      {/* Tabelle */}
      <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
        <Table>
          <Thead>
            <Tr>
              <Th className="text-left">Fall</Th>
              <Th className="text-left">SLA-Typ</Th>
              <Th className="text-left">Frist</Th>
              <Th className="text-left">Status</Th>
              <Th className="text-left">Aktion</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(slas ?? []).map((sla) => {
              const fallJoin = sla.faelle as unknown as { fall_nummer: string | null } | { fall_nummer: string | null }[] | null
              const fallRow = Array.isArray(fallJoin) ? fallJoin[0] : fallJoin
              const fallNr = fallRow?.fall_nummer ?? (sla.fall_id as string).slice(0, 8)
              const breach = new Date(sla.breach_at as string)
              const restMs = breach.getTime() - now
              const restMin = Math.round(restMs / 60_000)
              const isBreached = sla.status === 'breached'
              return (
                <Tr key={sla.id as string} className={isBreached ? 'bg-red-50/40' : ''}>
                  <Td>
                    <Link href={`/faelle/${sla.fall_id}`} className="font-medium text-claimondo-ondo hover:underline">
                      {fallNr}
                    </Link>
                  </Td>
                  <Td>{SLA_LABEL[sla.sla_typ as SlaTyp]}</Td>
                  <Td className="text-claimondo-ondo!">
                    {breach.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {!isBreached && (
                      <span className={`ml-2 text-xs ${restMin < 30 ? 'text-amber-600 font-medium' : 'text-claimondo-ondo/70'}`}>
                        {restMin > 0 ? `noch ${restMin} Min` : 'überfällig'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {isBreached ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Verletzt</span>
                    ) : restMin < 30 ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Risiko</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo">Offen</span>
                    )}
                  </Td>
                  <Td>
                    {sla.eskalation_task_id ? (
                      <Link href={`/admin/aufgaben/alle?id=${sla.eskalation_task_id}`} className="text-xs text-claimondo-ondo hover:underline">
                        Task ansehen
                      </Link>
                    ) : (
                      <span className="text-xs text-claimondo-ondo/50">—</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
            {(!slas || slas.length === 0) && (
              <Tr>
                <Td colSpan={5} className="py-12! text-center text-claimondo-ondo/70! text-sm">
                  Aktuell keine offenen oder verletzten SLAs
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
