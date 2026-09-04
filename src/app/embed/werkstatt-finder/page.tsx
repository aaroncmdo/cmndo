import type { Metadata } from 'next'
import { ConsentBridge } from '../gutachter-finder/_components/ConsentBridge'
import { WerkstattFinderEmbedClient } from './WerkstattFinderEmbedClient'

// Oeffentliche Werkstatt-Embed-Seite (iframe-baar). Zeigt echte Partner-Werkstaetten in
// der Naehe (nurEchte), der Pick vermittelt db-driven als Reparateur an den entstehenden
// Lead/Claim + Redirect in den bestehenden /flow. Vorlage: embed/gutachter-finder/page.tsx
// (ConsentBridge cross-origin-Consent). MVP: kein GTM-Block — nur ConsentBridge + Client.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // Embed nicht separat indexiert — die Marketing-Flaeche traegt die SEO.
  robots: { index: false, follow: false },
}

export default async function WerkstattFinderEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; plz?: string; token?: string; promo?: string; oppref?: string }>
}) {
  const sp = await searchParams
  const lat = sp.lat ? Number(sp.lat) : undefined
  const lng = sp.lng ? Number(sp.lng) : undefined
  const plz = sp.plz?.trim() || undefined
  // §10 Doppel-Lead-Falle: Re-Entry mit bestehendem Flow-Token -> die Lead-Anlage UPDATED
  // den bestehenden Lead statt einen zweiten anzulegen (server-seitig aufgeloest).
  const flowToken = sp.token?.trim() || undefined
  // E1.1 (Entry-Point-Matrix): Makler-/Partner-Promo-Code aus der Parent-URL (EmbedFinderSection
  // reicht ?promo= durch) -> Provision-Attribution am Lead. Server resolved Code->id (Format+aktiv).
  const promoCode = sp.promo?.trim() || undefined
  // OpenAI-Ads-Kennung, von der Parent-Seite durch die iframe-Grenze gereicht.
  const oppref = sp.oppref?.trim().slice(0, 300) || undefined

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ConsentBridge />
      <WerkstattFinderEmbedClient
        initialLat={lat !== undefined && Number.isFinite(lat) ? lat : undefined}
        initialLng={lng !== undefined && Number.isFinite(lng) ? lng : undefined}
        flowToken={flowToken}
        promoCode={promoCode}
        oppref={oppref}
        initialPlz={plz}
      />
    </div>
  )
}
