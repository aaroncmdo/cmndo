// W1.1 (Routen-Cleanup, PR #4482): Lead-Preis-Tabelle IN der Abrechnung — vorher eigene
// Route /gutachter/leadpreise, die im Abrechnung-Header nur verlinkt war (das dokumentierte
// "Route hinter Link verstecken"-Anti-Muster, AAR-244). Self-contained async RSC: laedt
// SV-Paket + leadpreise_tabelle selbst (gleiche Quellen wie die alte Page); der Header-Link
// springt jetzt als Anchor hierher. Alte Route -> 308 auf /gutachter/abrechnung.
import { createClient } from '@/lib/supabase/server'
import { FINANCE } from '@/lib/finance/constants'
import { getGutachterForUser } from '@/lib/gutachter'
import { paketLabelMitKontingent } from '@/lib/sachverstaendige/kontingent'
import { SectionCard } from '@/components/shared/SectionCard'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export async function LeadpreiseSection({ userId }: { userId: string }) {
  const supabase = await createClient()

  // AAR-209: paket_faelle_gesamt fuer den konsistenten Kontingent-Resolver mitladen.
  const sv = await getGutachterForUser<{
    id: string
    paket: string
    paket_faelle_gesamt: number | null
  }>(supabase, userId, 'id, paket, paket_faelle_gesamt')
  if (!sv) return null

  const { data: tabelle } = await supabase
    .from('leadpreise_tabelle')
    .select('schadenhoehe_bis_netto, paketpreis_netto, einzelpreis_netto, version, created_at')
    .eq('aktiv', true)
    .order('schadenhoehe_bis_netto', { ascending: true })

  const paketLabel = paketLabelMitKontingent(sv)
  const standDatum = tabelle?.[0]?.created_at
    ? new Date(tabelle[0].created_at).toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        month: 'long',
        year: 'numeric',
      })
    : 'März 2026'

  function eur(val: number) {
    return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <section id="leadpreise" className="scroll-mt-4 mt-4 space-y-4">
      <div>
        <h2 className="text-claimondo-navy font-semibold">Lead-Preis-Tabelle</h2>
        <p className="text-sm text-claimondo-ondo">
          Stand: {standDatum} (Version {tabelle?.[0]?.version ?? 'v1'})
        </p>
        <p className="text-xs text-claimondo-ondo/70 mt-1">
          Diese Tabelle ist Bestandteil Ihres Kooperationsvertrags (Anhang). Änderungen werden Ihnen
          vorab schriftlich mitgeteilt.
        </p>
      </div>

      {/* Erläuterung */}
      <div className="bg-[var(--brand-secondary)]/5 border border-[var(--brand-accent)]/30 rounded-ios-xl p-4">
        <p className="text-sm font-medium text-[var(--brand-primary)] mb-2">Wie funktioniert die Berechnung?</p>
        <ul className="text-xs text-[var(--brand-primary)] space-y-1.5 list-disc pl-4">
          <li>
            Solange du innerhalb deines monatlichen Kontingents ({paketLabel}) bist, gilt der{' '}
            <strong>Paket-Preis</strong>. Ab dem ersten Fall über dem Kontingent gilt der{' '}
            <strong>Einzel-Preis</strong>.
          </li>
          <li>
            Pro Fall im Kontingent werden <strong>150 EUR</strong> von Ihrem Werbebudget verrechnet
            (solange Guthaben vorhanden), den Rest zahlen Sie in der Monatsabrechnung.
          </li>
        </ul>
        {/* Beispiel-Callout: shared/SectionCard statt hand-rolled bg-white-Card
            (component-set-Ratchet). Kein Header -> reine gepadde Card. */}
        <SectionCard className="mt-3 rounded-ios-lg px-3 py-2">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider font-semibold mb-1">
            Beispiel {paketLabel}
          </p>
          <p className="text-xs text-claimondo-navy">
            Schaden 6.000 EUR im Kontingent: <strong>216 EUR</strong> Lead-Preis −{' '}
            <strong>150 EUR</strong> Werbebudget = <strong>66 EUR</strong> Nachzahlung
          </p>
        </SectionCard>
      </div>

      {/* Tabelle */}
      <SectionCard className="overflow-hidden p-0">
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
          <p className="text-[10px] text-claimondo-ondo/70">
            {tabelle?.length ?? 0} Einträge · Alle Preise netto zzgl. {FINANCE.MWST_PROZENT}% MwSt
          </p>
        </div>
      </SectionCard>
    </section>
  )
}
