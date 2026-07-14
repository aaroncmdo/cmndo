import { redirect } from 'next/navigation'
import { UsersIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { getPersonDupeCandidates, type PersonDupeSignal } from '@/lib/personen/dupe-candidates'

// Call-2 (Architektur-Entscheid 03.06.): read-only Person-Dublettenliste.
// Sichtbarkeit ueber Dubletten-Kandidaten — KEIN Merge (Hard-Merge bleibt YAGNI).
export const dynamic = 'force-dynamic'

const SIGNAL_LABEL: Record<PersonDupeSignal, string> = {
  email: 'E-Mail',
  name_gebdat: 'Name + Geburtsdatum',
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default async function PersonenDublettenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/admin')

  const candidates = await getPersonDupeCandidates()

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      <PageHeader
        title="Personen-Dubletten"
        description="Mögliche Dubletten-Kandidaten aus dem Personen-Register — nur zur Ansicht (kein Zusammenführen)."
        size="lg"
      />

      {candidates.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Keine Dubletten-Kandidaten"
          description="Aktuell keine Personen-Paare mit übereinstimmenden Identitätssignalen (E-Mail, Name + Geburtsdatum)."
        />
      ) : (
        <>
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>Signal</Th>
                  <Th>Übereinstimmung</Th>
                  <Th>Person A</Th>
                  <Th>Person B</Th>
                </Tr>
              </Thead>
              <Tbody>
                {candidates.map((c) => (
                  <Tr key={`${c.person_a_id}-${c.person_b_id}-${c.signal}`}>
                    <Td>{SIGNAL_LABEL[c.signal] ?? c.signal}</Td>
                    <Td className="font-mono text-body-xs">{c.match_value ?? '—'}</Td>
                    <Td>
                      <div className="text-claimondo-navy">{c.person_a_name ?? '— ohne Name —'}</div>
                      <div className="text-body-xs text-claimondo-ondo">
                        {c.person_a_has_account ? 'mit Account · ' : ''}seit {fmtDate(c.person_a_created)}
                      </div>
                    </Td>
                    <Td>
                      <div className="text-claimondo-navy">{c.person_b_name ?? '— ohne Name —'}</div>
                      <div className="text-body-xs text-claimondo-ondo">
                        {c.person_b_has_account ? 'mit Account · ' : ''}seit {fmtDate(c.person_b_created)}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
          <p className="text-body-xs text-claimondo-ondo">
            {candidates.length} Kandidaten-Paar(e). Zusammenführen (Hard-Merge) ist bewusst noch nicht aktiv — diese Liste dient der Sichtbarkeit.
          </p>
        </>
      )}
    </div>
  )
}
