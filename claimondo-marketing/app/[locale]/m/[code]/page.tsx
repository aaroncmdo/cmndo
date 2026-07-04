import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveMaklerByPromoCode } from '@/lib/makler/resolve-promo'
import { SITE_URL } from '@/lib/seo/jsonld'
import { MaklerHubLanding } from './MaklerHubLanding'

// Makler-Kunden-Landeseite: claimondo.de/m/[Promo-Code]. Oeffentliche, INDEXIERBARE
// SEO-Mikroseite je Makler (Aaron-Entscheid 30.06.: index statt noindex). Loest den
// Promo-Code -> Makler, trackt den Klick (promo_clicks) und rendert den gebrandeten Hub.
// Public (kein auth.uid()) -> service-role.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const target = await resolveMaklerByPromoCode(createServiceClient(), code)
  // Ungueltiger/inaktiver Code -> die Seite redirectet; Metadata darf nichts indexieren.
  if (!target || !target.aktiv) {
    return { robots: { index: false, follow: false } }
  }
  const title = `Kfz-Schaden regulieren mit ${target.firma} | Claimondo`
  const description = `${target.firma} empfiehlt Claimondo: unabhängigen Kfz-Gutachter in Ihrer Nähe finden, Termin buchen und Ihren Anspruch prüfen. Unverschuldet? Die Regulierung ist für Sie kostenlos (§ 249 BGB).`
  const url = `${SITE_URL}/m/${code}`
  // Share-/Link-Vorschau: das frueher hier hardcodierte /og-default.png existiert nicht (404)
  // -> kaputtes Vorschaubild beim Teilen. Wir nutzen den funktionierenden dynamischen
  // OG-Generator (app/opengraph-image.tsx, liefert 200 image/png).
  const ogImage = `${SITE_URL}/opengraph-image`
  return {
    // absolute: sonst haengt das Layout-Template ('%s | Claimondo') ein zweites
    // "| Claimondo" an -> "... | Claimondo | Claimondo".
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    // Makler-spezifische Twitter/X-Karte (sonst greift das generische Layout-Default).
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

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
