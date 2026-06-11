import type { Metadata } from 'next'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'

// AAR-956 — Gutachter-Finder Embed (Haupt-App, standalone, iframe-baar).
// Zieht den Finder aus der Marketing-App hierher → direkter Termin-Engine-Zugriff,
// design-token-konform, per <iframe> auf claimondo.de + beliebigen Seiten einbettbar.
//
// WS1a: Datenschicht WIEDERVERWENDET — ladeAktiveSVs/ladeSvLeads existieren schon in
// der Haupt-App (src/lib/actions/gutachter-finder-actions.ts, gespeist u.a. /api/v1/
// sv-in-naehe), leak-safe + Google-Reviews aus google_bewertungen_cache. Kein Port.
// WS1b: Karten-UI (Mapbox-Client) als <FinderMap svs leadPins>. WS2: Profil-ueber-Pin
// + GoogleBewertungBadge. WS4: 3-Step-Wizard mit <FlowSlotStep> (Engine inline).

export const metadata: Metadata = {
  // Embed nicht separat indexiert — /gutachter-finden (Marketing) ist die SEO-Flaeche.
  robots: { index: false, follow: false },
}

export default async function GutachterFinderEmbedPage() {
  // Reuse: dieselben Loader wie die public sv-in-naehe-API + die Marketing-Karte.
  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const svs = aktiveRes.ok ? aktiveRes.data : []
  const leadPins = leadsRes.ok ? leadsRes.data : []

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-claimondo-bg p-6">
      <div className="text-center">
        <h1 className="text-heading-md font-bold text-claimondo-navy">Gutachter-Finder Embed</h1>
        <p className="mt-2 text-body-sm text-claimondo-ondo">
          WS1a — Datenschicht (Reuse): <strong>{svs.length}</strong> aktive SVs +{' '}
          <strong>{leadPins.length}</strong> Lead-Pins geladen.
        </p>
        <p className="mt-1 text-caption text-claimondo-ondo/70">Karten-UI (WS1b) + Wizard (WS4) folgen.</p>
      </div>
    </main>
  )
}
