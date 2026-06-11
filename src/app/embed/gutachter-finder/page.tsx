import type { Metadata } from 'next'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { FinderMap } from './_components/FinderMap'
import { GlassSurface } from './_components/GlassSurface'

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

// WS1b-Platzhalter im Sidebar-Slot: skizziert die 3 Schritte, bis WS4 den echten
// Inline-Wizard (FlowSlotStep) einsetzt. Server-gerendert, als Prop an FinderMap.
function WizardSlotPlaceholder() {
  return (
    <GlassSurface className="flex flex-col gap-2 p-5 text-center">
      <p className="text-body-sm font-bold text-claimondo-navy">Anfrage in 3 Schritten</p>
      <p className="text-caption leading-relaxed text-claimondo-ondo/80">
        Schaden schildern · Kontakt &amp; Ort · Termin wählen
      </p>
      <p className="text-caption text-claimondo-ondo/50">Wird gerade fertiggestellt.</p>
    </GlassSurface>
  )
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
      wizardSlot={<WizardSlotPlaceholder />}
    />
  )
}
