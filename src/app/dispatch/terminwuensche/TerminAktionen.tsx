'use client'

// kunde-termin-funnel T3 (Task 10): Aktionsspalte der Terminwunsch-Queue.
// "SV zuweisen" oeffnet einen einfachen Modal mit der SV-Liste — bewusst YAGNI
// gegen SvDispatchPanel (kein Isochrone-/Slot-Matching: der Termin-Slot steht
// schon fest, es fehlt nur der Partner). Auswahl aus der Liste loest die
// Zuweisung sofort aus (1-Klick, gleiches Muster wie WerkstattVermittlungPanel.
// handleSelect). "Stornieren" nutzt das confirm()-Doppel-Check-Muster aus
// SvDispatchPanel.handleCancel (rueckrufe-Aktionsspalte hat keinen eigenen
// Confirm-Dialog, sondern ein Formular — SvDispatchPanel ist hier die naehere
// Vorlage fuer eine reine Ja/Nein-Aktion).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlusIcon, XIcon } from 'lucide-react'
import { Button, Modal } from '@/components/primitives'
import { weiseTerminwunschZu, storniereTerminwunsch } from './actions'

export type SvOption = { id: string; name: string }

export default function TerminAktionen({
  terminId,
  status,
  svOptionen,
}: {
  terminId: string
  status: string | null
  svOptionen: SvOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  // Scope-Entscheidung (Controller-Contract): sv_gesucht-Wuensche sind erst mit
  // T4 (Portal-Buchung) zuweisbar — Button bleibt deaktiviert, Tooltip erklaert warum.
  const zuweisenGesperrt = status === 'sv_gesucht'

  function handleAssign(svId: string) {
    startTransition(async () => {
      const r = await weiseTerminwunschZu(terminId, svId)
      if (r.ok) {
        toast.success('SV zugewiesen')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Zuweisung fehlgeschlagen')
      }
    })
  }

  function handleStorno() {
    if (!confirm('Terminwunsch wirklich stornieren?')) return
    startTransition(async () => {
      const r = await storniereTerminwunsch(terminId)
      if (r.ok) {
        toast.success('Terminwunsch storniert')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Stornieren fehlgeschlagen')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span title={zuweisenGesperrt ? 'sv_gesucht-Wünsche: Zuweisung folgt mit Portal-Buchung (T4)' : undefined}>
        <Button
          variant="ondo"
          size="sm"
          disabled={pending || zuweisenGesperrt}
          onClick={() => setOpen(true)}
          iconLeft={<UserPlusIcon className="w-3.5 h-3.5" />}
        >
          SV zuweisen
        </Button>
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={handleStorno}
        iconLeft={<XIcon className="w-3.5 h-3.5" />}
      >
        Stornieren
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} ariaLabel="SV zuweisen" maxWidth={420}>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-claimondo-navy">SV zuweisen</h3>
          {svOptionen.length === 0 ? (
            <p className="text-xs text-claimondo-ondo">Keine aktiven Sachverständigen verfügbar.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {svOptionen.map((sv) => (
                <button
                  key={sv.id}
                  type="button"
                  disabled={pending}
                  onClick={() => handleAssign(sv.id)}
                  className="w-full text-left px-3 py-2 rounded-ios-lg border border-claimondo-border bg-white hover:border-claimondo-ondo hover:bg-claimondo-bg transition-colors disabled:opacity-50 text-sm text-claimondo-navy"
                >
                  {sv.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
