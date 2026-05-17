// AAR-928: Offene Berechnungen — Faelle mit sv_id und Status >= 'gutachten-eingegangen',
// aber lead_preis_netto noch NULL. Heisst processCaseBilling() ist nicht
// gelaufen (State-Trigger verpasst oder Bug). Backstop ist der Batch-Cron
// case-billing-batch (AAR-924).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

const BILLABLE_STATUSES = [
  'gutachten-eingegangen',
  'filmcheck',
  'qc-pruefung',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'regulierung-laeuft',
  'vs-kuerzt',
  'nachbesichtigung-laeuft',
  'vs-abgelehnt',
  'klage',
  'zahlung-eingegangen',
  'abgeschlossen',
]

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function OffeneFaellePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/')

  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, claims:claim_id(claim_nummer), status, sv_id, kennzeichen, schadens_hoehe_netto, gutachten_betrag, created_at, status_changed_at')
    .not('sv_id', 'is', null)
    .is('lead_preis_netto', null)
    .in('status', BILLABLE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(200)

  const rows = faelle ?? []

  // SV-Namen aufloesen
  const svIds = Array.from(new Set(rows.map(f => f.sv_id).filter(Boolean) as string[]))
  const { data: svs } = svIds.length > 0
    ? await supabase
        .from('sachverstaendige')
        .select('id, profile_id')
        .in('id', svIds)
    : { data: [] }
  const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean) as string[]
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname').in('id', profileIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const svNameMap = Object.fromEntries((svs ?? []).map(s => {
    const p = s.profile_id ? profileMap[s.profile_id] : null
    return [s.id, p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() : s.id.slice(0, 8)]
  }))

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Offene Berechnungen"
        description={`${rows.length} Fall/Fälle ohne Lead-Preis-Berechnung (lead_preis_netto IS NULL bei billable Status)`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Alle Fälle berechnet"
          description="processCaseBilling() lief für alle Fälle in billable Status. Backstop-Cron case-billing-batch fängt Drift täglich."
        />
      ) : (
        <DataTableContainer className="mt-4">
          <Table>
            <Thead>
              <Tr>
                <Th className="text-left px-4">Fall-Nr</Th>
                <Th className="text-left px-4">Kennzeichen</Th>
                <Th className="text-left px-4">SV</Th>
                <Th className="text-left px-4">Status</Th>
                <Th className="text-right px-4">Schaden (netto)</Th>
                <Th className="text-center px-4">Erstellt</Th>
                <Th className="text-right px-4">Aktion</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((f) => {
                const claim = Array.isArray(f.claims) ? f.claims[0] : f.claims
                return (
                <Tr key={f.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40">
                  <Td className="px-4 font-mono text-xs">{claim?.claim_nummer ?? f.id.slice(0, 8)}</Td>
                  <Td className="px-4">{f.kennzeichen ?? '–'}</Td>
                  <Td className="px-4">{f.sv_id ? svNameMap[f.sv_id] ?? '–' : '–'}</Td>
                  <Td className="px-4 text-xs">{f.status}</Td>
                  <Td className="px-4 text-right tabular-nums">
                    {f.schadens_hoehe_netto != null
                      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(f.schadens_hoehe_netto))
                      : f.gutachten_betrag != null
                      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(f.gutachten_betrag))
                      : '–'}
                  </Td>
                  <Td className="px-4 text-center">{formatDate(f.created_at as string | null)}</Td>
                  <Td className="px-4 text-right">
                    <Link
                      href={`/admin/faelle/${f.id}`}
                      className="text-claimondo-ondo hover:text-claimondo-navy underline text-sm"
                    >
                      Öffnen
                    </Link>
                  </Td>
                </Tr>
                )
              })}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}

      <p className="mt-4 text-xs text-claimondo-ondo">
        Backstop-Cron <code>cron/case-billing-batch</code> (AAR-924) ruft <code>processCaseBilling()</code> für diese Fälle täglich. Manueller curl-Trigger möglich.
      </p>
    </div>
  )
}
