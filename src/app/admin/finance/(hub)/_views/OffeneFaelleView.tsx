// AAR-928: Offene Berechnungen — Faelle mit sv_id und Status >= 'gutachten-eingegangen',
// aber lead_preis_netto noch NULL. Heisst processCaseBilling() ist nicht
// gelaufen (State-Trigger verpasst oder Bug). Backstop ist der Batch-Cron
// case-billing-batch (AAR-924).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
// B4-slice-1b: war eine wortgleiche Kopie der Liste aus dem case-billing-batch-Cron. Zwei Kopien
// derselben Abrechnungs-Menge driften garantiert auseinander → jetzt EINE SSoT.
import { BILLABLE_OPERATIVE_STATUS_VALUES as BILLABLE_STATUSES } from '@/lib/claims/terminal-status'


function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function OffeneFaelleView() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/')

  // CMM-74 b″: status-Filter auf claims.operative_status repointet (SSoT-Cutover).
  // operative_status spiegelt faelle.status 1:1, jeder faelle hat claim_id NOT NULL →
  // claim-ID-Set-Filterung reproduziert exakt dieselben Zeilen (verhaltensneutral).
  const { data: billableClaimIds } = await supabase
    .from('claims')
    .select('id')
    .in('operative_status', BILLABLE_STATUSES)

  // CMM-49 (faelle-Drop-Runway): Anker auf faelle_claim_bridge statt .from('faelle').
  // status/sv_id/kennzeichen ziehen in den claims-Embed (SSoT, live verifiziert):
  //   status->operative_status (Display nun konsistent mit dem bereits operative_status-
  //   basierten billable-Filter oben; ≤2 stale Legacy-faelle.status-Rows zeigen jetzt SSoT),
  //   sv_id 0-diff, kennzeichen->vehicles.kennzeichen_aktuell 0-diff.
  // CMM-44 SP-B/G + CMM-65 (historisch): claim_nummer/status_changed_at/schadens_hoehe_netto/
  //   created_at/gutachten leben auf claims (SSoT). Sort+Limit clientseitig (s.u.).
  const { data: faelle } = await supabase
    .from('faelle_claim_bridge')
    // FK-Hint Pflicht: `claim_id` ist als Embed-Ziel mehrdeutig (partner_provisionen zeigt seit
    // Mig 20260708071538 ebenfalls auf faelle_claim_bridge(claim_id)) -> sonst PGRST201/HTTP 300.
    .select('fall_id, claims:claims!fk_bridge_claim!inner(claim_nummer, status_changed_at, schadens_hoehe_netto, created_at, operative_status, sv_id, vehicles:vehicle_id(kennzeichen_aktuell), gutachten(gesamt_schadensbetrag))')
    .not('claims.sv_id', 'is', null)
    .is('claims.lead_preis_netto', null)
    .in('claim_id', (billableClaimIds ?? []).map((c) => c.id))

  const rows = (faelle ?? [])
    .slice()
    .sort((a, b) => {
      const ca = ((Array.isArray(a.claims) ? a.claims[0] : a.claims)?.created_at as string | null) ?? ''
      const cb = ((Array.isArray(b.claims) ? b.claims[0] : b.claims)?.created_at as string | null) ?? ''
      return ca.localeCompare(cb)
    })
    .slice(0, 200)

  // SV-Namen aufloesen
  const svIds = Array.from(new Set(rows.map(f => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return c?.sv_id
  }).filter(Boolean) as string[]))
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
    <>
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
                // CMM-44 SP-G PR2: gesamt_schadensbetrag kommt aus gutachten (SSoT).
                const gutachtenRow = Array.isArray(claim?.gutachten) ? claim?.gutachten[0] : claim?.gutachten
                // CMM-49: kennzeichen aus vehicles (via claims.vehicle_id), sv_id/status aus claims.
                const veh = Array.isArray(claim?.vehicles) ? claim?.vehicles[0] : claim?.vehicles
                const svId = (claim?.sv_id as string | null) ?? null
                return (
                <Tr key={f.fall_id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40">
                  <Td className="px-4 font-mono text-xs">{claim?.claim_nummer ?? f.fall_id.slice(0, 8)}</Td>
                  <Td className="px-4">{veh?.kennzeichen_aktuell ?? '–'}</Td>
                  <Td className="px-4">{svId ? svNameMap[svId] ?? '–' : '–'}</Td>
                  <Td className="px-4 text-xs">{claim?.operative_status}</Td>
                  <Td className="px-4 text-right tabular-nums">
                    {claim?.schadens_hoehe_netto != null
                      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(claim.schadens_hoehe_netto))
                      : gutachtenRow?.gesamt_schadensbetrag != null
                      ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(gutachtenRow.gesamt_schadensbetrag))
                      : '–'}
                  </Td>
                  <Td className="px-4 text-center">{formatDate((claim?.created_at as string | null) ?? null)}</Td>
                  <Td className="px-4 text-right">
                    <Link
                      href={`/admin/faelle/${f.fall_id}`}
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
    </>
  )
}
