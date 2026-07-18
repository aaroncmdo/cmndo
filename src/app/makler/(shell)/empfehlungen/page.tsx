import { redirect } from 'next/navigation'
import { getCurrentMakler, getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { getMaklerEmpfehlungUebersicht } from '@/lib/makler/empfehlung'
import { buildMaklerReferralSnippets } from '@/lib/makler/share-snippets'
import { EmpfehlungShareCard } from '@/components/makler/EmpfehlungShareCard'
import { StatCard } from '@/components/shared/StatCard'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

function eur(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export default async function EmpfehlungenPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/makler')

  const [promo, uebersicht] = await Promise.all([
    getMaklerPrimaryPromoCode(makler.id),
    getMaklerEmpfehlungUebersicht(makler.id),
  ])

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const snippets = promo ? buildMaklerReferralSnippets(promo.code, makler.firma, base) : null
  const t = uebersicht?.totals
  const downline = uebersicht?.downline ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-claimondo-navy">Empfehlungen</h1>
      <p className="mt-1 text-sm text-claimondo-shield">
        Laden Sie weitere Makler ein und verdienen Sie 10&nbsp;€ pro vermitteltem Gutachten Ihrer
        geworbenen Partner.
      </p>

      {snippets ? (
        <div className="mt-6">
          <EmpfehlungShareCard
            referralUrl={snippets.url}
            whatsappHref={snippets.whatsappHref}
            mailtoHref={snippets.mailtoHref}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-ios-lg border border-claimondo-border bg-white p-5 text-sm text-claimondo-shield">
          Ihr Empfehlungs-Link wird gerade vorbereitet. Bitte laden Sie die Seite in Kürze erneut.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Geworbene Makler" value={String(t?.downline_count ?? 0)} />
        <StatCard label="Override gesamt" value={eur(t?.override_netto_gesamt ?? 0)} />
        <StatCard label="davon offen" value={eur(t?.override_pending ?? 0)} />
      </div>

      {uebersicht?.upline ? (
        <div className="mt-6 rounded-ios-md bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
          Ihr Werber: <span className="font-semibold">{uebersicht.upline.firma}</span>
        </div>
      ) : null}

      <h2 className="mt-8 text-lg font-semibold text-claimondo-navy">Meine geworbenen Makler</h2>
      {downline.length === 0 ? (
        <p className="mt-2 text-sm text-claimondo-shield">
          Noch keine geworbenen Makler. Teilen Sie Ihren Link oben.
        </p>
      ) : (
        <DataTableContainer className="mt-3">
          <Table>
            <Thead>
              <Tr>
                <Th>Firma</Th>
                <Th>Ansprechpartner</Th>
                <Th>Status</Th>
                <Th>Gutachten</Th>
                <Th>Override verdient</Th>
              </Tr>
            </Thead>
            <Tbody>
              {downline.map((d) => (
                <Tr key={d.makler_id}>
                  <Td>{d.firma}</Td>
                  <Td>{d.ansprechpartner_vorname}</Td>
                  <Td>{d.status}</Td>
                  <Td>{d.gutachten_count}</Td>
                  <Td>{eur(d.override_netto_summe)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
