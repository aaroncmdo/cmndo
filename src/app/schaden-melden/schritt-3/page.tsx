import { FlowShell } from '../_components/FlowShell'
import { Schritt3Guard } from './Schritt3Guard'

// AAR-475 C9: Schritt 3 — Fahrzeugschein (ZB1). Scan via Camera/Upload oder
// manuelles Fallback-Formular. Guard-Checks sind client-seitig (flow-store
// liegt in sessionStorage).

export default function Schritt3Page() {
  return (
    <FlowShell step={3}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-claimondo-navy">Fahrzeugschein</h1>
        <p className="mt-2 text-slate-600">
          Wir brauchen die Fahrzeugdaten aus Ihrem ZB1. Am schnellsten mit der
          Kamera — oder manuell, wenn der Schein gerade nicht greifbar ist.
        </p>
      </div>
      <Schritt3Guard />
    </FlowShell>
  )
}
