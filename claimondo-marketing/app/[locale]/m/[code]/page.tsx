import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveMaklerByPromoCode } from '@/lib/makler/resolve-promo'
import { MaklerHubLanding } from './MaklerHubLanding'

// Makler-Kunden-Landeseite: claimondo.de/m/[Promo-Code]. Loest den Promo-Code zum
// Makler auf, trackt den Klick (promo_clicks) und rendert den gebrandeten Hub. Public
// (kein auth.uid()) -> service-role. noindex (Referral, kein SEO).
export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function MaklerHubPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { code } = await params
  const sb = createServiceClient()

  const target = await resolveMaklerByPromoCode(sb, code)
  // Unbekannter Code / inaktiver Makler -> sanft auf die Startseite (nie 404).
  if (!target || !target.aktiv) redirect('/')

  // Klick-Tracking (fire-and-forget): ein Tracking-Fehler darf die Seite nie brechen.
  try {
    await sb.from('promo_clicks').insert({ promotion_code_id: target.promotionCodeId })
  } catch (err) {
    console.error('[m] promo_clicks insert failed:', (err as Error).message)
  }

  const appOrigin = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

  return (
    <MaklerHubLanding
      firma={target.firma}
      finderHref={`${appOrigin}/start/makler/${target.maklerId}`}
      anspruchHref={`/check?m=${encodeURIComponent(code)}`}
    />
  )
}
