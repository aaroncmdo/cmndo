import { PortalMockupSection } from './PortalMockupSection'

// Phase B1 (21->12 Section-Komponenten): ProduktAppSection wrappt die
// bestehende PortalMockupSection (#10 „Wie Uber"). Reine Komposition —
// Content/Tokens/t()-Keys liegen unverändert in der Sub-Komponente.

export async function ProduktAppSection() {
  return <PortalMockupSection />
}
