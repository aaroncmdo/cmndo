import type { Metadata } from 'next'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { FinderMap } from './_components/FinderMap'
import { FinderWizard } from './_components/FinderWizard'

// AAR-956 — Gutachter-Finder Embed (Haupt-App, standalone, iframe-baar).
// Zieht den Finder aus der Marketing-App hierher → direkter Termin-Engine-Zugriff,
// design-token-konform, per <iframe> auf claimondo.de + beliebigen Seiten einbettbar.
//
// WS1a: Datenschicht WIEDERVERWENDET — ladeAktiveSVs/ladeSvLeads (leak-safe, Google-Reviews).
// WS1b: Karten-UI <FinderMap> aus der Marketing-Karte portiert (next-intl → inline DE).
// WS2: Profil-ueber-Pin + GoogleBewertungBadge. WS3: empfohlener SV + Route/Zoom.
// WS4: 3-Step-Wizard mit <FlowSlotStep> (Engine inline) füllt den wizardSlot.

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
    <FinderMap
      svLeads={leadPins}
      aktiveSVs={svs}
      height="100dvh"
      wizardSlot={<FinderWizard />}
    />
  )
}
