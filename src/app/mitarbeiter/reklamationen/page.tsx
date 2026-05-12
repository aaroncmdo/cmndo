// AAR-68: Mitarbeiter Reklamationen — gefiltert auf KB-Faelle
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterReklamationen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // Faelle des KB ermitteln
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, kennzeichen')
    .eq('kundenbetreuer_id', user.id)

  const fallIds = (faelle ?? []).map(f => f.id)
  const fallMap = new Map((faelle ?? []).map(f => [f.id, f]))

  const { data: reklamationen } = fallIds.length > 0 ? await supabase
    .from('reklamationen')
    .select('id, fall_id, grund, begruendung, status, eingereicht_am, frist_bis, bearbeitet_am')
    .in('fall_id', fallIds)
    .order('eingereicht_am', { ascending: false })
  : { data: [] }

  return (
    <div className="space-y-4">
      <PageHeader title="Reklamationen" description="Reklamationen zu Ihren Fällen." size="lg" />

      <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
        <Table>
          <Thead className="!tracking-normal">
            <Tr>
              <Th className="!py-2">Fall</Th>
              <Th className="!py-2">Grund</Th>
              <Th className="!py-2">Status</Th>
              <Th className="!py-2">Eingereicht</Th>
              <Th className="!py-2">Frist</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(reklamationen ?? []).map(r => {
              const fall = fallMap.get(r.fall_id as string)
              return (
                <Tr key={r.id} className="hover:bg-claimondo-bg">
                  <Td>
                    <Link href={`/faelle/${r.fall_id}`} className="text-claimondo-ondo hover:underline font-medium">
                      {fall?.fall_nummer ?? (r.fall_id as string).slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>{r.grund ?? '—'}</Td>
                  <Td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.status === 'offen' ? 'bg-amber-100 text-amber-700' :
                      r.status === 'erledigt' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-claimondo-bg text-claimondo-ondo'
                    }`}>{r.status ?? '—'}</span>
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {r.eingereicht_am ? new Date(r.eingereicht_am).toLocaleDateString('de-DE') : '—'}
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {r.frist_bis ? new Date(r.frist_bis).toLocaleDateString('de-DE') : '—'}
                  </Td>
                </Tr>
              )
            })}
            {(!reklamationen || reklamationen.length === 0) && (
              <Tr><Td colSpan={5} className="!py-12 text-center !text-claimondo-ondo/70 text-sm">Keine Reklamationen</Td></Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
