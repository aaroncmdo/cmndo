// AAR-68: Mitarbeiter Faelle-Liste — alle dem KB zugewiesenen Faelle
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterFaelle() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // CMM-47 B-Rest: faelle → v_claim_full (fall_id statt id, fall_status statt status, fall_created_at statt created_at).
  const { data: faelle } = await supabase
    .from('v_claim_full')
    .select('fall_id, fall_nummer, fall_status, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, fall_created_at, sa_unterschrieben')
    .eq('kundenbetreuer_id', user.id)
    .order('fall_created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <PageHeader title="Meine Fälle" description="Alle Ihnen zugewiesenen Fälle, sortiert nach Erstellung." size="lg" />

      <DataTableContainer variant="plain" className="bg-white rounded-ios-xl border border-claimondo-border overflow-hidden">
        <Table>
          <Thead className="!tracking-normal">
            <Tr>
              <Th className="!py-2">Fall</Th>
              <Th className="!py-2">Fahrzeug</Th>
              <Th className="!py-2">Status</Th>
              <Th className="!py-2">Erstellt</Th>
            </Tr>
          </Thead>
          <Tbody>
            {(faelle ?? []).map(f => (
              <Tr key={f.fall_id as string} className="hover:bg-claimondo-bg">
                <Td>
                  <Link href={`/faelle/${f.fall_id}`} className="text-claimondo-ondo hover:underline font-medium">
                    {f.fall_nummer ?? (f.fall_id as string).slice(0, 8)}
                  </Link>
                  {f.kennzeichen && <p className="text-xs text-claimondo-ondo/70">{f.kennzeichen}</p>}
                </Td>
                <Td>
                  {[f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || '—'}
                </Td>
                <Td>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo">{f.fall_status}</span>
                </Td>
                <Td className="!text-claimondo-ondo/70 text-xs">
                  {f.fall_created_at ? new Date(f.fall_created_at).toLocaleDateString('de-DE') : '—'}
                </Td>
              </Tr>
            ))}
            {(!faelle || faelle.length === 0) && (
              <Tr><Td colSpan={4} className="!py-12 text-center !text-claimondo-ondo/70 text-sm">Keine Fälle zugewiesen</Td></Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
