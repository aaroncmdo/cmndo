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
  searchParams: Promise<{ lat?: string; lng?: string; plz?: string }>
}) {
  const sp = await searchParams
  const lat = sp.lat ? Number(sp.lat) : undefined
  const lng = sp.lng ? Number(sp.lng) : undefined
  const plz = sp.plz?.trim() || undefined

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <ConsentBridge />
      <WerkstattFinderEmbedClient
        initialLat={lat !== undefined && Number.isFinite(lat) ? lat : undefined}
        initialLng={lng !== undefined && Number.isFinite(lng) ? lng : undefined}
        initialPlz={plz}
      />
    </div>
  )
}
