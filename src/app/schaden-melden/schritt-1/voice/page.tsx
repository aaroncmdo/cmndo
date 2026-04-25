import { FlowShell } from '../../_components/FlowShell'
import { VoiceRecorderClient } from './VoiceRecorderClient'
import PageHeader from '@/components/shared/PageHeader'

// AAR-470 C4: Voice-Modus Schritt 1. Server-Shell + Client-Recorder. Prefill
// landet in sessionStorage und wird von /schritt-1 gelesen (Tippen-Modus).

export default function Schritt1VoicePage() {
  return (
    <FlowShell step={1}>
      <div className="space-y-6">
        <PageHeader
          title="Was ist passiert?"
          description="Sprechen Sie einfach drauflos — unsere KI transkribiert und füllt das Formular für Sie vor."
          size="lg"
        />
        <VoiceRecorderClient />
      </div>
    </FlowShell>
  )
}
