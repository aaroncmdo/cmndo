'use client'

// Werkstatt-Copilot — duenner Wrapper ueber die geteilte CopilotChat-Shell
// (DRY 3/3, 2026-07-15). Reparatur-/abwicklungs-fokussiert (Abrechnungsweg,
// KVA, Gutachten-Abweichung, Totalschaden). Streaming via /api/werkstatt/copilot.
// Prop-API unveraendert ({ claimId }) — Consumer (WerkstattAuftragDetail) unberuehrt.

import { EuroIcon, FileTextIcon, AlertTriangleIcon, WrenchIcon } from 'lucide-react'
import { CopilotChat, type CopilotSuggestion } from '@/components/shared/CopilotChat'

const SUGGESTIONS: CopilotSuggestion[] = [
  {
    icon: <EuroIcon width={14} height={14} />,
    label: 'Wie läuft die Abrechnung?',
    query:
      'Wie läuft die Abrechnung bei diesem Fall (Abrechnungsweg)? Was bedeutet das für Freigabe und Bezahlung meiner Reparatur?',
  },
  {
    icon: <FileTextIcon width={14} height={14} />,
    label: 'Was gehört in meinen KVA?',
    query:
      'Was gehört in meinen Kostenvoranschlag für diesen Schaden und worauf muss ich bei der Kalkulation achten?',
  },
  {
    icon: <AlertTriangleIcon width={14} height={14} />,
    label: 'Reparatur weicht vom Gutachten ab',
    query:
      'Meine tatsächliche Reparatur weicht vom Gutachten ab (mehr Aufwand/Teile). Wie melde ich das sauber über Claimondo nach?',
  },
  {
    icon: <WrenchIcon width={14} height={14} />,
    label: 'Reparatur oder Totalschaden?',
    query:
      'Reparatur oder Totalschaden — lohnt sich die Reparatur hier noch (130%-Grenze)? Was ist zu beachten?',
  },
]

export function WerkstattCopilotPanel({ claimId }: { claimId: string }) {
  return (
    <div className="mt-3">
      <CopilotChat
        endpoint="/api/werkstatt/copilot"
        body={{ claimId }}
        title="Werkstatt-Copilot"
        subtitle="KI-Assistent für Reparatur & Abwicklung — mit Auftrags-Kontext"
        greeting={
          <>
            <p>
              Hallo, ich bin Ihr <strong>Werkstatt-Copilot</strong>. Ich kenne den
              Auftrag — Fahrzeug, Abrechnungsweg, Gutachten-Werte, Ihren KVA und den
              Reparaturtermin. Frag mich zu Abrechnung, Kalkulation oder dem Umgang mit
              dem Gutachten.
            </p>
            <p className="mt-2 text-[13px] text-claimondo-ondo">
              Keine Rechtsberatung — das klärt die Kanzlei/Claimondo.
            </p>
          </>
        }
        suggestions={SUGGESTIONS}
        accessDeniedText="Kein Zugriff auf diesen Auftrag."
      />
    </div>
  )
}
