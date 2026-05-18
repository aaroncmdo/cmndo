// AAR-64 (refokussiert): Admin-internes Kanzlei-Kommunikationsboard.
// Zeigt: Zugewiesene Kanzleien pro Fall, LexDrive-Webhook-History, eingehende LexDrive-Tasks.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ScaleIcon, MailIcon, AlertCircleIcon, ClockIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

export default async function KanzleiBoard() {
  const db = await createClient()

  // 1. Zugewiesene Kanzleien (parteien.rolle = kanzlei)
  const { data: kanzleiParteien } = await db
    .from('parteien')
    .select('id, fall_id, name, email, telefon, created_at, faelle(claims:claim_id(claim_nummer), status, kennzeichen)')
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
      <PageHeader
        title="Kanzlei-Board"
        description="Admin-Sicht auf zugewiesene Kanzleien und LexDrive-Kommunikation. LexDrive nutzt Salesforce intern — kein eigenes Login-Portal."
        icon={ScaleIcon}
      />

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard size="sm" icon={ScaleIcon} tone="ondo" label="Aktive Kanzlei-Parteien" value={kanzleiParteien?.length ?? 0} />
        <StatCard size="sm" icon={MailIcon} tone="ondo" label="LexDrive-Events" value={webhookEvents?.length ?? 0} />
        <StatCard size="sm" icon={AlertCircleIcon} tone="warning" label="Offene LexDrive-Tasks" value={lexdriveTasks?.length ?? 0} />
      </div>

      {/* Kanzlei-Parteien */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border">
          <h2 className="text-sm font-semibold text-claimondo-navy">Zugewiesene Kanzleien</h2>
        </div>
        <DataTableContainer variant="plain">
          <Table>
            <Thead>
              <Tr>
                <Th className="text-left font-bold !py-2">Fall</Th>
                <Th className="text-left font-bold !py-2">Kanzlei</Th>
                <Th className="text-left font-bold !py-2">Kontakt</Th>
                <Th className="text-left font-bold !py-2">Status</Th>
                <Th className="text-left font-bold !py-2">Zugewiesen</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(kanzleiParteien ?? []).map(p => {
                type ClaimJoin = { claim_nummer: string | null } | { claim_nummer: string | null }[] | null
                const fallJoin = p.faelle as unknown as { claims: ClaimJoin; status: string | null; kennzeichen: string | null } | { claims: ClaimJoin; status: string | null; kennzeichen: string | null }[] | null
                const fall = Array.isArray(fallJoin) ? fallJoin[0] : fallJoin
                const claim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
                return (
                  <Tr key={p.id}>
                    <Td>
                      <Link href={`/faelle/${p.fall_id}`} className="text-claimondo-ondo hover:underline font-medium">
                        {claim?.claim_nummer ?? (p.fall_id as string).slice(0, 8)}
                      </Link>
                      {fall?.kennzeichen && <p className="text-xs text-claimondo-ondo/70">{fall.kennzeichen}</p>}
                    </Td>
                    <Td>{p.name ?? '—'}</Td>
                    <Td className="!text-claimondo-ondo text-xs">
                      {p.email ?? '—'}<br />
                      {p.telefon ?? ''}
                    </Td>
                    <Td>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-navy">{fall?.status ?? '—'}</span>
                    </Td>
                    <Td className="text-xs !text-claimondo-ondo/70">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('de-DE') : '—'}
                    </Td>
                  </Tr>
                )
              })}
              {(!kanzleiParteien || kanzleiParteien.length === 0) && (
                <Tr><Td colSpan={5} className="py-8 text-center !text-claimondo-ondo/70 text-sm">Keine Kanzleien zugewiesen</Td></Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </section>

      {/* LexDrive-Webhook-History */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-claimondo-ondo/70" />
          <h2 className="text-sm font-semibold text-claimondo-navy">LexDrive Status-History</h2>
        </div>
        <div className="divide-y divide-claimondo-border max-h-[400px] overflow-y-auto">
          {(webhookEvents ?? []).map(e => (
            <div key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-claimondo-navy truncate">{e.event_type}</p>
                <p className="text-xs text-claimondo-ondo">
                  Fall {e.fall_nr ?? (e.fall_id as string | null)?.slice(0, 8) ?? '—'}
                  {e.error_message && <span className="text-red-500 ml-2">{e.error_message}</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  e.status === 'processed' ? 'bg-emerald-100 text-emerald-700' :
                  e.status === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>{e.status}</span>
                <span className="text-xs text-claimondo-ondo/70">
                  {new Date(e.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {(!webhookEvents || webhookEvents.length === 0) && (
            <p className="px-4 py-8 text-center text-claimondo-ondo/70 text-sm">Keine LexDrive-Events</p>
          )}
        </div>
      </section>

      {/* LexDrive-Tasks */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border">
          <h2 className="text-sm font-semibold text-claimondo-navy">Offene LexDrive-Tasks</h2>
        </div>
        <div className="divide-y divide-claimondo-border">
          {(lexdriveTasks ?? []).map(t => (
            <Link key={t.id} href={`/faelle/${t.fall_id}`} className="block px-4 py-3 hover:bg-claimondo-bg transition-colors text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-claimondo-navy">{t.titel}</p>
                  <p className="text-xs text-claimondo-ondo">Status: {t.status}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.prioritaet === 'kritisch' ? 'bg-red-100 text-red-700' :
                  t.prioritaet === 'dringend' ? 'bg-amber-100 text-amber-700' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>{t.prioritaet}</span>
              </div>
            </Link>
          ))}
          {(!lexdriveTasks || lexdriveTasks.length === 0) && (
            <p className="px-4 py-8 text-center text-claimondo-ondo/70 text-sm">Keine offenen LexDrive-Tasks</p>
          )}
        </div>
      </section>
    </div>
  )
}

