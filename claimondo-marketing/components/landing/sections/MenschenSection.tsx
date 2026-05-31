import { BeraterSection } from './BeraterSection'
import { FounderSection } from '../FounderSection'

// Phase B1 (21->12 Section-Komponenten): MenschenSection bündelt den
// „Menschen hinter Claimondo"-Strang. Sie komponiert die bestehenden
// BeraterSection (#6) und FounderSection (#20). Reine Komposition —
// Content/Tokens/t()-Keys liegen unverändert in den Sub-Komponenten.
// (FounderSection ist eine Client-Component; das Rendern aus dieser
// Server-Component ist unverändert zur bisherigen Einbindung.)

export async function MenschenSection() {
  return (
    <>
      {/* 6 — Berater */}
      <BeraterSection />

      {/* 20 — Founder (E-E-A-T) */}
      <FounderSection />
    </>
  )
}
