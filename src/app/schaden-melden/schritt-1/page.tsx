import { FlowShell } from '../_components/FlowShell'

// AAR-467 C1 Stub — Inhalt kommt in AAR-468 (C2: Tippen-Modus) und
// AAR-470 (C4: Voice-Modus).

export default function Schritt1Page() {
  return (
    <FlowShell step={1}>
      <h1 className="text-2xl font-bold text-claimondo-navy">Schritt 1 — Schadenhergang</h1>
      <p className="mt-2 text-slate-600">
        Platzhalter. Wird in AAR-468 (Tippen) und AAR-470 (Voice) befüllt.
      </p>
    </FlowShell>
  )
}
