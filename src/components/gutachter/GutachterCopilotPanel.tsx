'use client'

// SV-Copilot — duenner Wrapper ueber die geteilte CopilotChat-Shell (DRY 2/3,
// 2026-07-15). Technisch-fachlich (Kalkulation, Wertminderung, Vorschaeden,
// Nutzungsausfall, Totalschaden/Restwert, BVSK). Streaming via
// /api/gutachter/copilot. Prop-API unveraendert ({ fallId }) — Consumer
// (FallDetailClient) unberuehrt.

import { EuroIcon, ClipboardCheckIcon, GaugeIcon, CarIcon } from 'lucide-react'
import { CopilotChat, type CopilotSuggestion } from '@/components/shared/CopilotChat'

const SUGGESTIONS: CopilotSuggestion[] = [
  {
    icon: <EuroIcon width={14} height={14} />,
    label: 'Wertminderung ermitteln',
    query:
      'Wie ermittle ich die merkantile Wertminderung für dieses Fahrzeug? Welche Methode passt und welche Faktoren sind hier relevant?',
  },
  {
    icon: <ClipboardCheckIcon width={14} height={14} />,
    label: 'Vorschäden abgrenzen',
    query:
      'Wie grenze ich einen Vorschaden sauber vom aktuellen Schaden ab und wie dokumentiere ich das im Gutachten?',
  },
  {
    icon: <GaugeIcon width={14} height={14} />,
    label: 'Nutzungsausfall-Klasse',
    query:
      'Welche Nutzungsausfall-Klasse und welcher Tagessatz passen für dieses Fahrzeug? Ist eine Herabstufung angebracht?',
  },
  {
    icon: <CarIcon width={14} height={14} />,
    label: 'Reparatur oder Totalschaden?',
    query:
      'Reparatur oder Totalschaden — wie bewerte ich hier die 130%-Grenze technisch und was ist beim Restwert zu beachten?',
  },
]

export function GutachterCopilotPanel({ fallId }: { fallId: string }) {
  return (
    <CopilotChat
      endpoint="/api/gutachter/copilot"
      body={{ fallId }}
      title="Gutachter-Copilot"
      subtitle="KI-Assistent für die technische Begutachtung — mit Fall-Kontext"
      greeting={
        <>
          <p>
            Hallo, ich bin Ihr <strong>Gutachter-Copilot</strong>. Ich kenne
            den Fall — Fahrzeug, Schadenart, Vorschäden und die bereits
            erfassten Gutachten-Werte. Frag mich zur Kalkulation,
            Wertminderung, Nutzungsausfall oder Totalschaden-Bewertung.
          </p>
          <p className="mt-2 text-[13px] text-claimondo-ondo">
            Starte mit einem Vorschlag oder stelle eine eigene Frage. Keine
            Rechtsberatung — das bewertet die Kanzlei.
          </p>
        </>
      }
      suggestions={SUGGESTIONS}
      accessDeniedText="Kein Zugriff auf diesen Fall."
    />
  )
}
