import { SchadensreportTeaserSection } from './SchadensreportTeaserSection'

// Phase B1 (21->12 Section-Komponenten): SchadensreportSection wrappt die
// bestehende SchadensreportTeaserSection (#18). Reine Komposition —
// Content/Tokens/t()-Keys liegen unverändert in der Sub-Komponente.

export async function SchadensreportSection() {
  return <SchadensreportTeaserSection />
}
