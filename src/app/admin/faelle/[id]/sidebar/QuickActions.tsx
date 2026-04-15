'use client'

// AAR-162 / W2: Quick-Actions-Sidebar — phase-abhängige Buttons.
// Inhalte kommen aus der Subphasen-Matrix 3431da4c91248176ae66e2a981993f60.
// W2 implementiert das Grundgerüst + 2-3 Actions pro Haupt-Phase; der Rest
// (Stellungnahme-anfordern, Nachbesichtigung-koordinieren, etc.) wandert
// in W4 sobald die zugehörigen Server-Actions existieren.

import { useFall } from '../FallContext'

type QuickAction = {
  label: string
  description?: string
  onClick?: () => void
  disabled?: boolean
}

function getActionsForPhase(phase: string): QuickAction[] {
  switch (phase) {
    case 'ersterfassung':
    case 'erstgespraech':
    case 'flow-gesendet':
    case 'onboarding':
      return [
        { label: 'ZB1 anfordern', description: 'WA-Reminder an Kunde' },
        { label: 'Kunde anrufen' },
      ]
    case 'sv-gesucht':
    case 'termin-reserviert':
    case 'sv-zugewiesen':
    case 'sv-termin':
      return [
        { label: 'FIN-Call triggern', description: 'Cardentity/DAT Vorschaden-Check' },
        { label: 'Termin-Erinnerung senden' },
      ]
    case 'gutachten-erstellt':
    case 'akte-uebergeben':
    case 'gutachten-eingegangen':
      return [
        { label: 'QC durchführen' },
        { label: 'E-Akte an Kanzlei' },
      ]
    case 'as-versendet':
    case 'warten-auf-vs':
      return [{ label: 'Eskalation triggern', description: 'Bei Frist-Ablauf Tag 14/21/28' }]
    case 'vs-kuerzt':
      return [
        { label: 'Techn. Stellungnahme SV anfordern' },
        { label: 'Rüge vorbereiten' },
      ]
    case 'nachbesichtigung-laeuft':
      return [{ label: 'Nachbesichtigungs-Ergebnis einpflegen' }]
    case 'vs-reguliert':
    case 'regulierung-laeuft':
    case 'zahlung-eingegangen':
      return [{ label: 'Kunde informieren (WA)' }]
    default:
      return []
  }
}

export default function QuickActions() {
  const { phase } = useFall()
  const actions = getActionsForPhase(phase)
  if (actions.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <p className="text-[9px] font-semibold text-gray-500 uppercase">Quick Actions</p>
      <div className="space-y-1.5">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            disabled={a.disabled ?? true}
            onClick={a.onClick}
            title="Wird in W4 aktiviert (Server-Action fehlt noch)"
            className="w-full text-left px-2 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <p className="text-xs font-medium text-gray-700">{a.label}</p>
            {a.description && <p className="text-[10px] text-gray-400 mt-0.5">{a.description}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}
