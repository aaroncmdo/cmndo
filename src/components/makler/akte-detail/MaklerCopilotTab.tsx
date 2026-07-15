'use client'

// AAR-489 (M7): Makler-Copilot — duenner Wrapper ueber die geteilte
// CopilotChat-Shell (DRY-Extraktion 2026-07-15). Rollen-Spezifika (Endpoint,
// Greeting, Vorschlaege, Kontext-Badge) via Props; Streaming/Bubbles/Markdown
// teilt die Shell mit dem Gutachter-/Werkstatt-Copilot. Prop-API unveraendert
// (fallId/gegnerVsName/kontextLoaded) — Consumer (MaklerAkteDetail) unberuehrt.

import { PhoneIcon, ClockIcon, EuroIcon, AlertTriangleIcon } from 'lucide-react'
import { CopilotChat, type CopilotSuggestion } from '@/components/shared/CopilotChat'

type Props = {
  fallId: string
  gegnerVsName: string | null
  kontextLoaded: boolean
}

function buildSuggestions(gegnerVs: string | null): CopilotSuggestion[] {
  return [
    {
      icon: <PhoneIcon width={14} height={14} />,
      label: 'Kunde hat angerufen — was sage ich?',
      query:
        'Der Kunde hat gerade angerufen und möchte wissen, wie der Stand zu seinem Fall ist. Was sage ich ihm? Gib mir bitte einen kurzen Antwort-Text.',
    },
    {
      icon: <ClockIcon width={14} height={14} />,
      label: 'Wann kommt die Regulierung?',
      query:
        'Wann kann ich mit der Regulierung durch die gegnerische Versicherung rechnen?',
    },
    {
      icon: <EuroIcon width={14} height={14} />,
      label: 'Mit wie viel kann der Kunde rechnen?',
      query:
        'Mit welchem Regulierungsbetrag kann der Kunde realistisch rechnen? Nenne eine Orientierung ohne Garantie.',
    },
    {
      icon: <AlertTriangleIcon width={14} height={14} />,
      label: gegnerVs
        ? `Was ist bei ${gegnerVs} typisch?`
        : 'Was ist bei der Gegenseite typisch?',
      query: gegnerVs
        ? `Was sollte ich bei der Regulierung durch ${gegnerVs} besonders beachten? Typische Kürzungen, Besonderheiten?`
        : 'Was sollte ich bei der Regulierung durch die gegnerische Versicherung besonders beachten?',
    },
  ]
}

export function MaklerCopilotTab({ fallId, gegnerVsName, kontextLoaded }: Props) {
  return (
    <CopilotChat
      endpoint="/api/makler/copilot"
      body={{ fallId }}
      title="Claimondo Copilot"
      subtitle="KI-Assistent mit vollem Fall-Kontext — hilft bei Kunden-Fragen"
      greeting={
        <>
          <p>
            Hallo, ich bin Ihr <strong>Claimondo Copilot</strong>. Ich kenne den
            gesamten Fall — Status, Gutachten, Timeline und den Gruppenchat.
            Fragen Sie mich einfach, was der Kunde wissen möchte.
          </p>
          <p className="mt-2 text-[13px] text-claimondo-ondo">
            Starten Sie mit einer der Vorschläge oder stellen Sie eine eigene
            Frage.
          </p>
        </>
      }
      suggestions={buildSuggestions(gegnerVsName)}
      headerBadge={
        kontextLoaded ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-white/10 text-white/90 border border-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Fall-Kontext geladen
          </span>
        ) : undefined
      }
      accessDeniedText="Ihr Zugriff auf diesen Fall wurde widerrufen."
      placeholder="Fragen Sie den Copilot …"
    />
  )
}
