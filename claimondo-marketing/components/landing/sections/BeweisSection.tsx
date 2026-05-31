import { BghAuthorityGrid } from './BghAuthorityGrid'
import { WertminderungSandenDannerSection } from './WertminderungSandenDannerSection'
import { VersichererTaktikenSection } from '../VersichererTaktikenSection'

// Phase B1 (21->12 Section-Komponenten): BeweisSection bündelt den
// Beleg-/Authority-Strang. Sie komponiert die bestehenden BghAuthorityGrid
// (#9), WertminderungSandenDannerSection (#12) und VersichererTaktikenSection
// (#17). Reine Komposition — Content/Tokens/t()-Keys liegen unverändert in den
// Sub-Komponenten. Die headingId="bgh-heading-premium" bleibt wie in
// HauptseitePremium.tsx erhalten.

export async function BeweisSection() {
  return (
    <>
      {/* 9 — BGH-Authority */}
      <BghAuthorityGrid headingId="bgh-heading-premium" />

      {/* 12 — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* 17 — Versicherer-Taktiken */}
      <VersichererTaktikenSection />
    </>
  )
}
