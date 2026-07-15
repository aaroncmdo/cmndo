// AAR-956: Zentraler Partner-Abrechnungen Hub-Tab — zeigt alle Partner-Typen
// aggregiert (SV, Kanzlei, Makler, Werkstatt, Marketing) + vollstaendige
// Positionstabelle via PartnerBillingPanel.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerBillingPanel } from '@/components/shared/finance/PartnerBillingPanel'
import { getPartnerBilling } from '@/lib/finance/partner-billing'

export const dynamic = 'force-dynamic'

const PARTNER_TYP_LABEL: Record<string, string> = {
  sv: 'SV / Gutachter',
  kanzlei: 'Kanzlei',
  makler: 'Makler',
  werkstatt: 'Werkstatt',
  marketing: 'Marketing/Maik',
}

function formatEur(betrag: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)
}

export default async function PartnerAbrechnungenView() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/')

  const { rows, aggregat } = await getPartnerBilling()

  const typEntries = Object.entries(aggregat.perPartnerTyp)

  return (
    // Layout-Wrapper (nicht Seiten-Chrome): gap-6 haelt den Abstand zwischen Aggregat-Grid
    // und Positionstabelle. Nur das Padding (p-4 md:p-6) faellt mit dem Header weg.
    <div className="flex flex-col gap-6">
      {/* Per-Rolle Aggregat-Breakdown */}
      {typEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {typEntries.map(([typ, bucket]) => (
            <div
              key={typ}
              className="rounded-ios-md border border-claimondo-border bg-white p-4 flex flex-col gap-1"
            >
              <span className="text-xs font-medium text-claimondo-ondo">
                {PARTNER_TYP_LABEL[typ] ?? typ}
              </span>
              <span className="text-sm font-semibold text-claimondo-navy">
                {formatEur(bucket.brutto)}
              </span>
              <span className="text-xs text-claimondo-ondo/70">
                Netto {formatEur(bucket.netto)} · {bucket.anzahl} Pos.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Vollstaendige Positionstabelle */}
      <PartnerBillingPanel
        rows={rows}
        aggregat={aggregat}
        showPartnerColumn
      />
    </div>
  )
}
