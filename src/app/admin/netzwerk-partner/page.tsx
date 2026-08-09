// Admin-Netzwerkpartner-Uebersicht (Vertriebssicht): tabellarische Liste ALLER SVs mit ihrem
// effektiven Netzwerkpartner-Abo-Status (comped/aktiv/…/kein), gefiltert (alle | nur Partner),
// Partner zuerst. Ergaenzt die per-SV-Sektion im SV-Detail (comped setzen/entziehen, #5058) um
// den Ueberblick. Der Status kommt aus sv_netzwerk_abonnements (RLS-locked → service-role).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { NetzwerkPartnerBadge } from '@/components/shared/NetzwerkPartnerBadge'
import { deriveNetzwerkPartnerStatus, type AboRow, type NetzwerkPartnerStatus } from '@/lib/netzwerk/partner-uebersicht'

export const dynamic = 'force-dynamic'

type Zeile = {
  svId: string
  name: string
  email: string | null
  status: NetzwerkPartnerStatus
}

export default async function AdminNetzwerkPartnerPage({
  searchParams,
}: {
  searchParams: Promise<{ nur?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const nurPartner = (await searchParams)?.nur === 'partner'
  const admin = createAdminClient()

  // 1) Alle nicht-geloeschten SVs + Profil-Name.
  const { data: svRows } = await admin
    .from('sachverstaendige')
    .select('id, profile_id, firmenname')
    .is('geloescht_am', null)
  const svs = svRows ?? []
  const profileIds = svs.map((s) => s.profile_id as string | null).filter((x): x is string => !!x)

  // 2) Profile (Name/Email) + Abo-Rows — beide RLS-locked fuer den Admin-User-Context → service-role.
  const [{ data: profileRows }, { data: aboRows }] = await Promise.all([
    profileIds.length > 0
      ? admin.from('profiles').select('id, vorname, nachname, email').in('id', profileIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    admin
      .from('sv_netzwerk_abonnements')
      .select('sv_id, status, gueltig_bis, stripe_subscription_id, erstellt_am')
      .order('erstellt_am', { ascending: false }),
  ])

  const profById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p as { vorname: string | null; nachname: string | null; email: string | null }]),
  )
  const abosBySv = new Map<string, AboRow[]>()
  for (const a of aboRows ?? []) {
    const sid = a.sv_id as string
    if (!abosBySv.has(sid)) abosBySv.set(sid, [])
    abosBySv.get(sid)!.push({
      status: a.status as string,
      gueltig_bis: (a.gueltig_bis as string | null) ?? null,
      stripe_subscription_id: (a.stripe_subscription_id as string | null) ?? null,
    })
  }

  const now = new Date()
  let zeilen: Zeile[] = svs.map((s) => {
    const prof = s.profile_id ? profById.get(s.profile_id as string) : null
    const name = [prof?.vorname, prof?.nachname].filter(Boolean).join(' ').trim()
      || (s.firmenname as string | null)?.trim()
      || 'Sachverständiger'
    return {
      svId: s.id as string,
      name,
      email: prof?.email ?? null,
      status: deriveNetzwerkPartnerStatus(abosBySv.get(s.id as string) ?? [], now),
    }
  })

  // Partner zuerst (istAktiv), dann Name.
  zeilen.sort((a, b) => Number(b.status.istAktiv) - Number(a.status.istAktiv) || a.name.localeCompare(b.name, 'de'))
  const partnerCount = zeilen.filter((z) => z.status.istAktiv).length
  if (nurPartner) zeilen = zeilen.filter((z) => z.status.istAktiv)

  const filterLinkCls = (aktiv: boolean) =>
    `text-xs font-medium px-3 py-1.5 rounded-ios-lg border ${
      aktiv ? 'border-claimondo-ondo bg-claimondo-ondo/10 text-claimondo-navy' : 'border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
    }`

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-heading-md font-bold text-claimondo-navy">Netzwerkpartner</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/netzwerk-partner" className={filterLinkCls(!nurPartner)}>
            Alle {svs.length}
          </Link>
          <Link href="/admin/netzwerk-partner?nur=partner" className={filterLinkCls(nurPartner)}>
            Nur Partner {partnerCount}
          </Link>
        </div>
      </div>

      <p className="text-body-xs text-claimondo-ondo/70">
        Effektiver Netzwerkpartner-Status je SV (Matching-Vorrang, Whitelabel, Provisions-Suppression hängen daran).
        comped setzen/entziehen im jeweiligen SV-Detail.
      </p>

      {zeilen.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-claimondo-ondo/70">
          {nurPartner ? 'Keine aktiven Netzwerkpartner.' : 'Keine Sachverständigen.'}
        </p>
      ) : (
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Sachverständiger</Th>
                <Th>Status</Th>
                <Th>Gültig bis</Th>
                <Th>Stripe-Abo</Th>
              </Tr>
            </Thead>
            <Tbody>
              {zeilen.map((z) => (
                <Tr key={z.svId} className="hover:bg-claimondo-bg">
                  <Td>
                    <Link href={`/admin/sachverstaendige/${z.svId}`} className="font-medium text-claimondo-navy hover:underline">
                      {z.name}
                    </Link>
                    {z.email && <div className="text-[10px] text-claimondo-ondo/60">{z.email}</div>}
                  </Td>
                  <Td>
                    <NetzwerkPartnerBadge status={z.status} />
                  </Td>
                  <Td className="text-claimondo-ondo/80 tabular-nums">
                    {z.status.gueltigBis ? new Date(z.status.gueltigBis).toLocaleDateString('de-DE') : '—'}
                  </Td>
                  <Td className="font-mono text-[10px] text-claimondo-ondo/50">
                    {z.status.stripeSubscriptionId ?? '—'}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
