import { FlowShell } from '../_components/FlowShell'
import { Schritt4Guard } from './Schritt4Guard'
import PageHeader from '@/components/shared/PageHeader'

// AAR-476 C10: Schritt 4 — Signup + optionale Makler-Consent-Box +
// Lead→Fall-Konvertierung. Guard ist client-seitig weil flow-store nur
// im sessionStorage lebt.

export default function Schritt4Page() {
  return (
    <FlowShell step={4}>
      <div className="mb-6">
        <PageHeader
          title="Account anlegen"
          description="Letzter Schritt: Account erstellen, Fall absenden. Danach geht es direkt in Ihr Portal."
          size="lg"
        />
      </div>
      <Schritt4Guard />
    </FlowShell>
  )
}
