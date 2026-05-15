// AAR-928: Per-SV Balance — Pivot pro SV mit offener Forderung, gezahlt,
// Werbebudget-Guthaben und letzter Aktivitaet. Snapshot — kein Trend-Chart
// in dieser PR (separates Ticket fuer 3-Monats-Trend).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

function eur(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

export default async function PerSvBalancePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/')

  // Alle aktiven SVs
  const { data: svs } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, werbebudget_guthaben_netto')
    .eq('ist_aktiv', true)

  const svIds = (svs ?? []).map(s => s.id)
  if (svIds.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Per-SV Balance" description="Keine aktiven SVs" />
        <EmptyState title="Keine aktiven SVs" description="" />
      </div>
    )
  }

  // Profil-Namen
  const profileIds = (svs ?? []).map(s => s.profile_id).filter(Boolean) as string[]
  const { data: profiles } = profileIds.length > 0
    ? await supabase.from('profiles').select('id, vorname, nachname, email').in('id', profileIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  // Alle Abrechnungen pro SV (letzte 90 Tage)
  const grenze = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: abrechnungen } = await supabase
    .from('abrechnungen')
    .select('empfaenger_id, summe_brutto, bezahlt_am, storniert_am, faellig_am, versand_datum')
    .eq('empfaenger_typ', 'sv')
    .in('empfaenger_id', svIds)
    .gte('versand_datum', grenze)

  type Aggregat = { offen: number; bezahlt: number; storniert: number; letzteAktivitaet: string | null }
  const aggMap: Record<string, Aggregat> = {}
  for (const svId of svIds) aggMap[svId] = { offen: 0, bezahlt: 0, storniert: 0, letzteAktivitaet: null }

  const heute = new Date()
  for (const abr of abrechnungen ?? []) {
    const svId = abr.empfaenger_id as string
    if (!aggMap[svId]) continue
    const brutto = Number(abr.summe_brutto ?? 0)
    if (abr.storniert_am) {
      aggMap[svId].storniert += brutto
    } else if (abr.bezahlt_am) {
      aggMap[svId].bezahlt += brutto
    } else {
      aggMap[svId].offen += brutto
    }
    const aktivIso = (abr.bezahlt_am ?? abr.versand_datum) as string | null
    if (aktivIso && (!aggMap[svId].letzteAktivitaet || aktivIso > aggMap[svId].letzteAktivitaet!)) {
      aggMap[svId].letzteAktivitaet = aktivIso
    }
  }

  const rows = (svs ?? []).map(s => {
    const p = s.profile_id ? profileMap[s.profile_id] : null
    const name = p ? `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || (p.email ?? '–') : '–'
    const agg = aggMap[s.id]
    return {
      id: s.id,
      name,
      email: p?.email ?? '–',
      guthaben: Number(s.werbebudget_guthaben_netto ?? 0),
      offen: agg.offen,
      bezahlt: agg.bezahlt,
      storniert: agg.storniert,
      letzteAktivitaet: agg.letzteAktivitaet,
    }
  }).filter(r => r.offen > 0 || r.bezahlt > 0 || r.guthaben !== 0)
    .sort((a, b) => b.offen - a.offen)

  const totalOffen = rows.reduce((s, r) => s + r.offen, 0)
  const totalBezahlt = rows.reduce((s, r) => s + r.bezahlt, 0)
  const totalGuthaben = rows.reduce((s, r) => s + r.guthaben, 0)

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Per-SV Balance"
        description={`${rows.length} SVs mit Aktivität — offen ${eur(totalOffen)}, bezahlt ${eur(totalBezahlt)} (90 Tage), Werbebudget-Summe ${eur(totalGuthaben)}`}
      />

      {rows.length === 0 ? (
        <EmptyState title="Keine SV-Aktivität in den letzten 90 Tagen" description="" />
      ) : (
        <DataTableContainer className="mt-4">
          <Table>
            <Thead>
              <Tr>
                <Th className="text-left px-4">SV</Th>
                <Th className="text-right px-4">Offen</Th>
                <Th className="text-right px-4">Bezahlt (90d)</Th>
                <Th className="text-right px-4">Storniert</Th>
                <Th className="text-right px-4">Werbebudget</Th>
                <Th className="text-center px-4">Letzte Aktivität</Th>
                <Th className="text-right px-4">Aktion</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((r) => {
                const offenColor = r.offen > 1000 ? 'text-red-400' : r.offen > 0 ? 'text-amber-400' : 'text-claimondo-ondo'
                const guthabenColor = r.guthaben <= 0 ? 'text-red-400' : r.guthaben < 500 ? 'text-amber-400' : 'text-emerald-400'
                return (
                  <Tr key={r.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40">
                    <Td className="px-4">
                      <div className="text-claimondo-navy">{r.name}</div>
                      <div className="text-xs text-claimondo-ondo">{r.email}</div>
                    </Td>
                    <Td className={`px-4 text-right tabular-nums ${offenColor}`}>{eur(r.offen)}</Td>
                    <Td className="px-4 text-right tabular-nums text-emerald-400">{eur(r.bezahlt)}</Td>
                    <Td className="px-4 text-right tabular-nums text-claimondo-ondo">{r.storniert > 0 ? eur(r.storniert) : '–'}</Td>
                    <Td className={`px-4 text-right tabular-nums ${guthabenColor}`}>{eur(r.guthaben)}</Td>
                    <Td className="px-4 text-center text-xs">
                      {r.letzteAktivitaet
                        ? new Date(r.letzteAktivitaet).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
                        : '–'}
                    </Td>
                    <Td className="px-4 text-right">
                      <Link
                        href={`/admin/sachverstaendige/${r.id}`}
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
        Snapshot der letzten 90 Tage. 3-Monats-Trend-Chart kommt als separates Folge-Ticket.
      </p>
    </div>
  )
}
