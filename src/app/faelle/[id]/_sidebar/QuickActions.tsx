'use client'

// AAR-162 / W2 + AAR-163 / W3: Quick-Actions-Sidebar — phase-abhängige Buttons.
// Inhalte kommen aus der Subphasen-Matrix 3431da4c91248176ae66e2a981993f60.
// W3 verdrahtet den FIN-Call — alle anderen Actions bleiben Platzhalter bis
// zugehörige Server-Actions existieren (überwiegend W4/AAR-164).

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useFall } from '../FallContext'
import { triggerFinCallForFall } from '../_actions/dokumente'

type QuickAction = {
  label: string
  description?: string
  onClick?: () => void
  disabled?: boolean
  title?: string
}

export default function QuickActions() {
  const { fall, phase } = useFall()
  const [pending, startTransition] = useTransition()

  // AAR-163 FIN-Call: nur sichtbar wenn FIN vorhanden + SV-Termin in Zukunft
  // + noch nicht abgefragt. Admin/KB-Rollen-Check liegt serverseitig.
  const fin = (fall.fin_vin as string | null) ?? (fall.fin as string | null)
  const svTermin = fall.sv_termin as string | null
  const cardentityAm = (fall.cardentity_abfrage_am as string | null) ??
    (fall.cardentity_enriched_at as string | null)
  const finCallMoeglich =
    !!fin && !cardentityAm && (!svTermin || new Date(svTermin) > new Date())

  function triggerFinCall() {
    startTransition(async () => {
      const r = await triggerFinCallForFall(fall.id)
      if (r.success) {
        toast.success(
          r.updatedFields?.length
            ? `FIN-Call erfolgreich — ${r.updatedFields.length} Felder aktualisiert`
            : 'FIN-Call ausgeführt (keine neuen Daten)',
        )
      } else {
        toast.error(r.error ?? 'FIN-Call fehlgeschlagen')
      }
    })
  }

  const actions: QuickAction[] = []

  // FIN-Call ist phasen-übergreifend relevant (Vor-SV-Termin-Fenster)
  if (finCallMoeglich) {
    actions.push({
      label: pending ? 'FIN-Call läuft ...' : 'FIN-Call triggern',
      description: 'Cardentity/DAT — Fahrzeug + Vorschaden-Check',
      onClick: triggerFinCall,
      disabled: pending,
    })
  }

  // Phase-spezifische Platzhalter-Aktionen (W4 aktiviert sie)
  const phaseActions = getPhaseActions(phase)
  actions.push(...phaseActions)

  if (actions.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
      <p className="text-[9px] font-semibold text-gray-500 uppercase">Quick Actions</p>
      <div className="space-y-1.5">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            disabled={a.disabled}
            onClick={a.onClick}
            title={a.title ?? (a.onClick ? undefined : 'Wird in W4 aktiviert')}
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

function getPhaseActions(phase: string): QuickAction[] {
  switch (phase) {
    case 'ersterfassung':
    case 'erstgespraech':
    case 'flow-gesendet':
    case 'onboarding':
      return [
        { label: 'ZB1 anfordern', description: 'WA-Reminder an Kunde', disabled: true },
        { label: 'Kunde anrufen', disabled: true },
      ]
    case 'sv-gesucht':
    case 'termin-reserviert':
    case 'sv-zugewiesen':
    case 'sv-termin':
      return [{ label: 'Termin-Erinnerung senden', disabled: true }]
    case 'gutachten-erstellt':
    case 'akte-uebergeben':
    case 'gutachten-eingegangen':
      return [
        { label: 'QC durchführen', disabled: true },
        { label: 'E-Akte an Kanzlei', disabled: true },
      ]
    case 'as-versendet':
    case 'warten-auf-vs':
      return [{ label: 'Eskalation triggern', description: 'Bei Frist-Ablauf Tag 14/21/28', disabled: true }]
    case 'vs-kuerzt':
      return [
        { label: 'Techn. Stellungnahme SV anfordern', disabled: true },
        { label: 'Rüge vorbereiten', disabled: true },
      ]
    case 'nachbesichtigung-laeuft':
      return [{ label: 'Nachbesichtigungs-Ergebnis einpflegen', disabled: true }]
    case 'vs-reguliert':
    case 'regulierung-laeuft':
    case 'zahlung-eingegangen':
      return [{ label: 'Kunde informieren (WA)', disabled: true }]
    default:
      return []
  }
}
