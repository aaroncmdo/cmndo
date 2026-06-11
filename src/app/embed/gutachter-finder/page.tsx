import type { Metadata } from 'next'

// AAR-956 — Gutachter-Finder Embed (Haupt-App, standalone, iframe-baar).
// Zieht den Finder aus der Marketing-App hierher → direkter Termin-Engine-Zugriff,
// design-token-konform, per <iframe> auf claimondo.de + beliebigen Seiten einbettbar.
// WS0: Route-Skelett (standalone, erbt nur das minimale Root-Layout). Karte (WS1/WS2)
// + 3-Step-Wizard mit Inline-Booking via <FlowSlotStep> (WS4) folgen.

export const metadata: Metadata = {
  // Embed wird NICHT separat indexiert — die Marketing-Seite /gutachter-finden ist
  // die SEO-Flaeche, der Embed nur die eingebettete Funktion.
  robots: { index: false, follow: false },
}

export default function GutachterFinderEmbedPage() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-claimondo-bg p-6"
    >
      <div className="text-center">
        <h1 className="text-heading-md font-bold text-claimondo-navy">Gutachter-Finder Embed</h1>
        <p className="mt-2 text-body-sm text-claimondo-ondo">
          WS0-Skelett — Karte + 3-Schritt-Wizard (Termin-Engine inline) folgen.
        </p>
      </div>
    </main>
  )
}
