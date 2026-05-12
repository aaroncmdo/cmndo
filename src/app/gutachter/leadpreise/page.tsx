import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TagIcon } from 'lucide-react'
import { getGutachterForUser } from '@/lib/gutachter'
import { paketLabelMitKontingent } from '@/lib/sachverstaendige/kontingent'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export default async function LeadpreisePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // AAR-209: paket_faelle_gesamt zusätzlich laden für konsistenten
  // Kontingent-Resolver (dieselben Quellen wie willkommen + dashboard).
  const sv = await getGutachterForUser<{
    id: string; paket: string; paket_faelle_gesamt: number | null;
  }>(supabase, user.id, 'id, paket, paket_faelle_gesamt')
  if (!sv) redirect('/gutachter')

  const { data: tabelle } = await supabase.from('leadpreise_tabelle')
    .select('schadenhoehe_bis_netto, paketpreis_netto, einzelpreis_netto, version, created_at')
    .eq('aktiv', true)
    .order('schadenhoehe_bis_netto', { ascending: true })

  const paketLabel = paketLabelMitKontingent(sv)

  const standDatum = tabelle?.[0]?.created_at
    ? new Date(tabelle[0].created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' })
    : 'März 2026'

  function eur(val: number) { return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

  return (
    <div className="h-full overflow-y-auto py-6">
      <div className="space-y-5">
        <div>
          <PageHeader
            title="Lead-Preis-Tabelle"
            description={`Stand: ${standDatum} (Version ${tabelle?.[0]?.version ?? 'v1'})`}
            icon={TagIcon}
          />
          <p className="text-xs text-claimondo-ondo/70 mt-1">Diese Tabelle ist Bestandteil deines Kooperationsvertrags (Anhang). Änderungen werden dir vorab schriftlich mitgeteilt.</p>
        </div>

        {/* Erläuterung */}
        <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-accent)]/30 rounded-xl p-4">
          <p className="text-sm font-medium text-[var(--brand-primary)] mb-2">Wie funktioniert die Berechnung?</p>
          <ul className="text-xs text-[var(--brand-primary)] space-y-1.5 list-disc pl-4">
            <li>Solange du innerhalb deines monatlichen Kontingents ({paketLabel}) bist, gilt der <strong>Paket-Preis</strong>. Ab dem ersten Fall über dem Kontingent gilt der <strong>Einzel-Preis</strong>.</li>
            <li>Pro Fall im Kontingent werden <strong>150 EUR</strong> von deinem Werbebudget verrechnet (solange Guthaben vorhanden), den Rest zahlst du in der Monatsabrechnung.</li>
          </ul>
          <div className="mt-3 bg-white rounded-lg border border-claimondo-border px-3 py-2">
            <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider font-semibold mb-1">Beispiel {paketLabel}</p>
            <p className="text-xs text-claimondo-navy">Schaden 6.000 EUR im Kontingent: <strong>216 EUR</strong> Lead-Preis − <strong>150 EUR</strong> Werbebudget = <strong>66 EUR</strong> Nachzahlung</p>
          </div>
        </div>

        {/* Tabelle */}
        <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">
          <DataTableContainer variant="plain">
            <Table className="!text-xs">
              <Thead className="!normal-case !tracking-normal border-b border-claimondo-border">
                <Tr>
                  <Th className="text-claimondo-ondo">Schadenhöhe (Netto-RK bis)</Th>
                  <Th className="text-right text-claimondo-ondo">Paket-Preis (im Kontingent)</Th>
                  <Th className="text-right text-claimondo-ondo">Einzel-Preis (über Kontingent)</Th>
                </Tr>
              </Thead>
              <Tbody className="!divide-y-0">
                {(tabelle ?? []).map((row, i) => (
                  <Tr key={i} className="border-b border-claimondo-border hover:bg-claimondo-bg">
                    <Td className="!py-2.5 font-medium tabular-nums">{eur(Number(row.schadenhoehe_bis_netto))} EUR</Td>
                    <Td className="!py-2.5 text-right tabular-nums">{eur(Number(row.paketpreis_netto))} EUR</Td>
                    <Td className="!py-2.5 text-right tabular-nums">{eur(Number(row.einzelpreis_netto))} EUR</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
          <div className="px-4 py-3 bg-claimondo-bg border-t border-claimondo-border">
            <p className="text-[10px] text-claimondo-ondo/70">{tabelle?.length ?? 0} Einträge · Alle Preise netto zzgl. 19% MwSt</p>
          </div>
        </div>
      </div>
    </div>
  )
}
