// Makler-Vermittlung: statischer Makler-QR-Einstieg. Spiegelt /start/werkstatt/[werkstattId],
// aber OHNE Geo (Makler hat keinen kundenrelevanten Standort → location-first Wizard fragt den
// Kunden nach seinem Ort). Attribution: primaerer Promo-Code des Maklers wird via promotionCodeId
// an den FinderWizard -> reserviereEmbedTermin -> lead.promotion_code_id durchgereicht.
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { FinderMap } from '@/app/embed/gutachter-finder/_components/FinderMap'
import { FinderWizard } from '@/app/embed/gutachter-finder/_components/FinderWizard'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function MaklerStartPage({ params }: { params: Promise<{ maklerId: string }> }) {
  const { maklerId } = await params

  // service-role: /start ist public (kein Auth-User) -> RLS-Reads wuerden leer laufen.
  const supabase = createAdminClient()
  const { data: makler } = await supabase
    .from('makler')
    .select('id, status')
    .eq('id', maklerId)
    .maybeSingle()
  if (!makler || makler.status !== 'aktiv') redirect('/gutachter-finden')

  // Primaerer aktiver Promo-Code des Maklers (= Attributions-Identifier).
  const { data: promo } = await supabase
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', makler.id)
    .eq('aktiv', true)
    .order('erstellt_am', { ascending: true })
    .limit(1)
    .maybeSingle()

  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const svs = aktiveRes.ok ? aktiveRes.data : []
  const leadPins = leadsRes.ok ? leadsRes.data : []

  return (
    <FinderMap
      svLeads={leadPins}
      aktiveSVs={svs}
      height="100dvh"
      initialCenter={null}
      initialZoom={6}
      forceFallback={false}
      wizardSlot={<FinderWizard forceFallback={false} promotionCodeId={(promo?.id as string | null) ?? null} />}
    />
  )
}
