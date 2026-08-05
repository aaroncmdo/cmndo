// Makler-Akte (B3 des CRM-Drawer-Programms, Phase-A-Befund a3): erste echte Makler-
// Detail-View — kanonisch UNTERM Vertrieb-Dach (detailLink zielt hierher, @drawer-Slot
// liegt hier; eine /admin/makler/[id]-Alt-URL existierte nie). EntityDetailShell mit
// Link-Tabs nach Rezept (docs/superpowers/detail-view-recipe.md): pro Tab nur dessen
// Daten. Aktionen (Staffel/Abrechnung/Login-Mail) bleiben vorerst in der Liste.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntityDetailShell, { type DetailTab } from '@/components/shared/detail/EntityDetailShell'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { Card } from '@/components/primitives'
import { getMaklerAdminDetail, getMaklerProvisionen, type MaklerProvisionRow } from '@/lib/makler/admin-detail'
import { PartnerCockpitPanel } from '@/components/shared/partner/PartnerCockpitPanel'

export const dynamic = 'force-dynamic'

function datum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function euro(n: number | null): string {
  if (n === null) return '—'
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function statusTone(status: string | null): 'success' | 'danger' | 'neutral' {
  return status === 'aktiv' ? 'success' : status === 'gesperrt' ? 'danger' : 'neutral'
}

function provisionTone(status: string | null): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ausgezahlt') return 'success'
  if (status === 'freigegeben') return 'info'
  if (status === 'pending') return 'warning'
  if (status === 'storniert') return 'danger'
  return 'neutral'
}

function provisionLabel(status: string | null): string {
  if (status === 'ausgezahlt') return 'Ausgezahlt'
  if (status === 'freigegeben') return 'Freigegeben'
  if (status === 'pending') return 'Offen'
  if (status === 'storniert') return 'Storniert'
  return status ?? '—'
}

function Feld({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <p className="text-caption text-claimondo-ondo/60">{label}</p>
      <p className="text-sm text-claimondo-navy break-words">{wert}</p>
    </div>
  )
}

export default async function MaklerAkteDetailPage({
  params,
  searchParams,
  variant = 'page',
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
  /** "drawer" wenn die Intercepting-Route die Page im DrawerShell rendert (Rezept-Muster). */
  variant?: 'page' | 'drawer'
}) {
  const { id } = await params
  const tab = (await searchParams)?.tab === 'provisionen' ? 'provisionen' : 'stammdaten'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (p?.rolle !== 'admin') redirect('/admin')

  const res = await getMaklerAdminDetail(id)
  if (!res.ok) notFound()
  const m = res.data

  // Rezept-Regel 5: nur die Daten des AKTIVEN Tabs laden.
  let provisionen: MaklerProvisionRow[] = []
  if (tab === 'provisionen') {
    const prov = await getMaklerProvisionen(id)
    provisionen = prov.ok ? prov.data : []
  }

  const tabs: DetailTab[] = [
    { key: 'stammdaten', label: 'Stammdaten', href: `/admin/vertrieb/makler/${id}` },
    { key: 'provisionen', label: 'Provisionen', href: `/admin/vertrieb/makler/${id}?tab=provisionen` },
  ]

  const ansprechpartner =
    [m.ansprechpartner_vorname, m.ansprechpartner_nachname].filter(Boolean).join(' ') || '—'

  return (
    <EntityDetailShell
      variant={variant}
      title={m.firma ?? 'Makler'}
      backHref="/admin/vertrieb/makler"
      backLabel="Makler"
      tabs={tabs}
      activeTab={tab}
      description={
        <span className="flex items-center gap-2 flex-wrap">
          <StatusBadge tone={statusTone(m.status)} size="xs">
            {m.status ?? 'unbekannt'}
          </StatusBadge>
          <span>Aktiviert am {datum(m.aktiviert_am)}</span>
          {m.email && <span>· {m.email}</span>}
        </span>
      }
    >
      {tab === 'provisionen' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-caption text-claimondo-ondo/60">
            {provisionen.length} Einträge · Summe (ohne stornierte):{' '}
            {euro(
              provisionen
                .filter((r) => r.status !== 'storniert')
                .reduce((sum, r) => sum + (r.betrag_netto_eur ?? 0), 0),
            )}
          </p>
          <DataTableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>Fall</Th>
                  <Th>Ereignis</Th>
                  <Th>Betrag (netto)</Th>
                  <Th>Status</Th>
                  <Th>Erstellt</Th>
                </Tr>
              </Thead>
              <Tbody>
                {provisionen.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.claim_nummer ?? '—'}</Td>
                    <Td>{r.trigger_event ?? '—'}</Td>
                    <Td className="tabular-nums">{euro(r.betrag_netto_eur)}</Td>
                    <Td>
                      <StatusBadge tone={provisionTone(r.status)} size="xs">
                        {provisionLabel(r.status)}
                      </StatusBadge>
                      {r.status === 'storniert' && r.storno_grund && (
                        <span className="ml-2 text-caption text-claimondo-ondo/60">{r.storno_grund}</span>
                      )}
                    </Td>
                    <Td>{datum(r.erstellt_am)}</Td>
                  </Tr>
                ))}
                {provisionen.length === 0 && (
                  <Tr>
                    <Td colSpan={5}>Noch keine Provisionen.</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </DataTableContainer>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <Card p={5} radius="lg" className="max-w-3xl">
            <div className="grid grid-cols-2 gap-4">
              <Feld label="Firma" wert={m.firma ?? '—'} />
              <Feld label="Ansprechpartner" wert={ansprechpartner} />
              <Feld label="E-Mail" wert={m.email ?? '—'} />
              <Feld label="Telefon" wert={m.telefon ?? '—'} />
              <Feld label="Provision (komplett, netto)" wert={euro(m.provision_betrag_komplett_netto)} />
              <Feld label="Provision (nur Gutachter, netto)" wert={euro(m.provision_betrag_nur_gutachter_netto)} />
              <Feld label="Status" wert={m.status ?? '—'} />
              <Feld label="Aktiviert am" wert={datum(m.aktiviert_am)} />
            </div>
            <p className="mt-4 text-caption text-claimondo-ondo/60">
              Staffelung, Abrechnung und Login-Mail verwaltest du weiterhin über die Makler-Liste.
            </p>
          </Card>
          <div className="mt-6 max-w-3xl">
            <h3 className="text-heading-sm text-claimondo-navy mb-2">Aktivität</h3>
            <PartnerCockpitPanel partnerTyp="makler" partnerId={id} />
          </div>
        </div>
      )}
    </EntityDetailShell>
  )
}
