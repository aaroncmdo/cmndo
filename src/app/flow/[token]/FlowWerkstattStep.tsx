'use client'

// Reparaturwunsch/Werkstatt: Kunde waehlt im Flow eine Partner-Werkstatt (5 naechste zum
// Besichtigungsort). Nur aktiv, wenn der Wizard-Step 'werkstatt' laeuft (needsWerkstatt
// server-gegated: Reparatur gewuenscht + noch keine Werkstatt). Auswahl -> waehleWerkstattFlow
// (token-scoped, quelle='kunde') -> onWeiter. Ueberspringbar (nicht-blockierend).

import { useEffect, useState, useTransition } from 'react'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { ladeWerkstaettenFlow, waehleWerkstattFlow } from './self-service-actions'
import { Button } from '@/components/primitives/Button/Button.web'

export function FlowWerkstattStep({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let aktiv = true
    ladeWerkstaettenFlow(token)
      .then((r) => {
        if (!aktiv) return
        if (r.ok) setWerkstaetten(r.werkstaetten)
        else setFehler(r.error)
      })
      .finally(() => {
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
    }
  }, [token])

  function onSelect(werkstattId: string) {
    setSelectedId(werkstattId)
    setFehler(null)
    startTransition(async () => {
      const res = await waehleWerkstattFlow(token, werkstattId)
      if (!res.ok) {
        setFehler(res.error ?? 'Auswahl fehlgeschlagen')
        setSelectedId(null)
        return
      }
      onWeiter()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-claimondo-navy">Wähle deine Werkstatt</h2>
        <p className="text-sm text-claimondo-ondo mt-1">
          Die nächstgelegenen Partner-Werkstätten zu deinem Besichtigungsort. Du kannst diesen
          Schritt auch überspringen und später entscheiden.
        </p>
      </div>
      {fehler && <p className="text-sm text-danger-strong">{fehler}</p>}
      <WerkstattFinder
        werkstaetten={werkstaetten}
        onSelect={onSelect}
        selectedId={selectedId}
        loading={loading || pending}
      />
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onWeiter} disabled={pending}>
          Überspringen
        </Button>
      </div>
    </div>
  )
}
