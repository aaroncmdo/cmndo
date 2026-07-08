// AAR-85: SLA-Monitoring Admin-Widget — zeigt pending + breached SLAs
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangleIcon, ClockIcon, CheckCircleIcon } from 'lucide-react'
import { SLA_LABEL, type SlaTyp } from '@/lib/sla/tracker'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { StatCard } from '@/components/shared/StatCard'

export const dynamic = 'force-dynamic'

export default async function SlaMonitoringPage() {
  const db = await createClient()

  const { data: slas } = await db
    .from('sla_tracking')
    .select('id, fall_id, sla_typ, started_at, breach_at, completed_at, status, eskalation_task_id, claims:claim_id(claim_nummer)')
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">SLA-Monitoring</h1>
          <p className="mt-0.5 text-body-sm text-claimondo-ondo">Pipeline-Fristen ab SA-Unterschrift. Cron alle 15 Min, automatische Eskalations-Tasks bei Verletzung.</p>
        </div>
      </div>

      {/* KPI-Boxen — shared StatCard (filled = getoente Alert-Kachel) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard filled tone="danger" icon={AlertTriangleIcon} label="Verletzt" value={breached.length} />
        <StatCard filled tone="warning" icon={ClockIcon} label="Risiko (< 30 Min)" value={atRisk.length} />
        <StatCard filled tone="neutral" icon={CheckCircleIcon} label="Offen" value={pending.length} />
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
              type ClaimJoin = { claim_nummer: string | null } | { claim_nummer: string | null }[] | null
              const claimRaw = sla.claims as unknown as ClaimJoin
              const claimRow = Array.isArray(claimRaw) ? claimRaw[0] : claimRaw
              const fallNr = claimRow?.claim_nummer ?? (sla.fall_id as string).slice(0, 8)
              const breach = new Date(sla.breach_at as string)
              const restMs = breach.getTime() - now
              const restMin = Math.round(restMs / 60_000)
              const isBreached = sla.status === 'breached'
              return (
                <Tr key={sla.id as string} className={isBreached ? 'bg-danger-soft/40' : ''}>
                  <Td>
                    <Link href={`/faelle/${sla.fall_id}`} className="font-medium text-claimondo-ondo hover:underline">
                      {fallNr}
                    </Link>
                  </Td>
                  <Td>{SLA_LABEL[sla.sla_typ as SlaTyp]}</Td>
                  <Td className="text-claimondo-ondo!">
                    {breach.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {!isBreached && (
                      <span className={`ml-2 text-body-xs ${restMin < 30 ? 'text-warning font-medium' : 'text-claimondo-ondo/70'}`}>
                        {restMin > 0 ? `noch ${restMin} Min` : 'überfällig'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {isBreached ? (
                      <span className="text-body-xs font-medium px-2 py-0.5 rounded-full bg-danger-soft text-danger-strong">Verletzt</span>
                    ) : restMin < 30 ? (
                      <span className="text-body-xs font-medium px-2 py-0.5 rounded-full bg-warning-soft text-warning-strong">Risiko</span>
                    ) : (
                      <span className="text-body-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo">Offen</span>
                    )}
                  </Td>
                  <Td>
                    {sla.eskalation_task_id ? (
                      <Link href={`/admin/aufgaben/alle?id=${sla.eskalation_task_id}`} className="text-body-xs text-claimondo-ondo hover:underline">
                        Task ansehen
                      </Link>
                    ) : (
                      <span className="text-body-xs text-claimondo-ondo/50">—</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
            {(!slas || slas.length === 0) && (
              <Tr>
                <Td colSpan={5} className="py-12! text-center text-claimondo-ondo/70! text-body-sm">
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
