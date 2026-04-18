import { FlowShell } from '../../_components/FlowShell'
import { AnalyseGuard } from './AnalyseGuard'

// AAR-472 C6: Schritt 2b — Claude-Vision-Analyse der Schadensfotos.
// Der eigentliche Guard (leadId + fotos.length >= 3) ist client-seitig,
// weil diese Daten im Flow-Store (sessionStorage) leben. Server-seitig
// liefert die FlowShell nur die Außenhülle.

export default function Schritt2AnalysePage() {
  return (
    <FlowShell step={2}>
      <AnalyseGuard />
    </FlowShell>
  )
}
