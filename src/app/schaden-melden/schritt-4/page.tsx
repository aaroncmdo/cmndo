import { FlowShell } from '../_components/FlowShell'
import { Schritt4Guard } from './Schritt4Guard'

// AAR-476 C10: Schritt 4 — Signup + optionale Makler-Consent-Box +
// Lead→Fall-Konvertierung. Guard ist client-seitig weil flow-store nur
// im sessionStorage lebt.

export default function Schritt4Page() {
  return (
    <FlowShell step={4}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0D1B3E]">Account anlegen</h1>
        <p className="mt-2 text-slate-600">
          Letzter Schritt: Account erstellen, Fall absenden. Danach geht es
          direkt in Ihr Portal.
        </p>
      </div>
      <Schritt4Guard />
    </FlowShell>
  )
}
