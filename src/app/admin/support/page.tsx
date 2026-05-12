import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

const STATUS_COLOR: Record<string, string> = {
  neu: 'bg-claimondo-ondo/5 text-claimondo-ondo',
  'in-bearbeitung': 'bg-amber-50 text-amber-600',
  geloest: 'bg-green-50 text-green-600',
  geschlossen: 'bg-claimondo-bg text-claimondo-ondo',
}

const KAT_LABEL: Record<string, string> = {
  'seite-laedt-nicht': 'Seite lädt nicht',
  'upload-fehler': 'Upload-Fehler',
  'anzeige-fehler': 'Anzeige-Fehler',
  'login-problem': 'Login-Problem',
  sonstiges: 'Sonstiges',
}

export default async function SupportPage() {
  const supabase = await createClient()

  const { data: probleme } = await supabase
    .from('technische_probleme')
    .select('id, user_id, kategorie, beschreibung, browser, aktuelle_url, status, antwort, erstellt_am, profiles(vorname, nachname, email)')
    .order('erstellt_am', { ascending: false })

  return (
    <div className="py-6 overflow-y-auto" style={{ height: '100%' }}>
      <div>
        <div className="mb-4">
          <PageHeader title="Support-Tickets" description={`${(probleme ?? []).length} gemeldete Probleme`} />
        </div>

        {(probleme ?? []).length === 0 ? (
          <div className="bg-white rounded-ios-lg shadow-ios-md p-8 text-center">
            <p className="text-claimondo-ondo/70 text-sm">Keine Probleme gemeldet</p>
          </div>
        ) : (
          <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
            <Table>
              <Thead className="normal-case! tracking-normal! border-b border-claimondo-border">
                <Tr>
                  <Th className="text-left py-2!">Datum</Th>
                  <Th className="text-left py-2!">Kunde</Th>
                  <Th className="text-left py-2!">Kategorie</Th>
                  <Th className="text-left py-2!">Beschreibung</Th>
                  <Th className="text-left py-2!">Status</Th>
                  <Th className="text-left py-2!">Browser</Th>
                </Tr>
              </Thead>
              <Tbody className="divide-y-0!">
                {(probleme ?? []).map(p => {
                  const profileRaw = p.profiles as unknown
                  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { vorname: string | null; nachname: string | null; email: string | null } | null
                  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') || profile.email : '—'
                  return (
                    <Tr key={p.id} className="border-b border-claimondo-border hover:bg-claimondo-bg">
                      <Td className="text-claimondo-ondo! text-xs whitespace-nowrap">
                        {new Date(p.erstellt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </Td>
                      <Td className="text-xs">{name}</Td>
                      <Td>
                        <span className="text-[10px] bg-claimondo-bg text-claimondo-ondo px-1.5 py-0.5 rounded">{KAT_LABEL[p.kategorie] ?? p.kategorie}</span>
                      </Td>
                      <Td className="text-xs max-w-xs truncate">{p.beschreibung}</Td>
                      <Td>
                        <StatusBadge colorCls={STATUS_COLOR[p.status] ?? 'bg-claimondo-bg text-claimondo-ondo'}>{p.status}</StatusBadge>
                      </Td>
                      <Td className="text-claimondo-ondo/70! text-[10px] max-w-32 truncate">{p.browser?.split(' ').pop() ?? '—'}</Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </div>
    </div>
  )
}
