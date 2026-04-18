import { FlowShell } from '../../_components/FlowShell'
import { VoiceRecorderClient } from './VoiceRecorderClient'

// AAR-470 C4: Voice-Modus Schritt 1. Server-Shell + Client-Recorder. Prefill
// landet in sessionStorage und wird von /schritt-1 gelesen (Tippen-Modus).

export default function Schritt1VoicePage() {
  return (
    <FlowShell step={1}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-claimondo-navy">
            Was ist passiert?
          </h1>
          <p className="mt-2 text-slate-600">
            Sprechen Sie einfach drauflos — unsere KI transkribiert und
            füllt das Formular für Sie vor.
          </p>
        </div>
        <VoiceRecorderClient />
      </div>
    </FlowShell>
  )
}
