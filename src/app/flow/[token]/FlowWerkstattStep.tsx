'use client'

// Reparaturwunsch/Werkstatt: Kunde waehlt im Flow eine Partner-Werkstatt (5 naechste zum
// Besichtigungsort). Nur aktiv, wenn der Wizard-Step 'werkstatt' laeuft (needsWerkstatt
// server-gegated: Reparatur gewuenscht + noch keine Werkstatt). Auswahl -> waehleWerkstattFlow
// (token-scoped, quelle='kunde') -> onWeiter. Ueberspringbar (nicht-blockierend).

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { ladeWerkstaettenFlow, waehleWerkstattFlow, speichereReparaturWunschterminFlow } from './self-service-actions'
import { Button } from '@/components/primitives/Button/Button.web'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'

export function FlowWerkstattStep({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // SP2 Task 3: Wunschtermin-State (lokal, Berlin-Wall-Clock "YYYY-MM-DDTHH:MM")
  // Wird angezeigt, sobald eine Werkstatt erfolgreich hinterlegt wurde.
  const [werkstattHinterlegt, setWerkstattHinterlegt] = useState<WerkstattFinderRow | null>(null)
  const [wunschtermin, setWunschtermin] = useState<string>('')
  const [wunschterminPending, startWunschterminTransition] = useTransition()

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
      // SP2 Task 3: Wunschtermin-Picker anzeigen statt direkt weiter.
      const gewaehlte = werkstaetten.find((w) => w.id === werkstattId) ?? null
      setWerkstattHinterlegt(gewaehlte)
    })
  }

  // SP2 Task 3: Wunschtermin speichern und dann weitergehen.
  function onWunschterminVorschlagen() {
    // Button ist bei leerem Wunschtermin disabled (s. u.) — kein zusaetzlicher Guard noetig.
    startWunschterminTransition(async () => {
      const result = await speichereReparaturWunschterminFlow(token, wunschtermin)
      if (!result.ok) {
        toast.error(result.error ?? 'Fehler beim Speichern des Wunschtermins.')
        return
      }
      toast.success('Wunschtermin gespeichert.')
      onWeiter()
    })
  }

  // SP2 Task 3: Wunschtermin-Abschnitt — erscheint, sobald Werkstatt hinterlegt.
  if (werkstattHinterlegt !== null) {
    const werkstattName = werkstattHinterlegt.name
    const werkstattOrt = werkstattHinterlegt.adresse_ort ?? werkstattHinterlegt.adresse_plz ?? null
    const anzeige = werkstattOrt ? `${werkstattName}, ${werkstattOrt}` : werkstattName
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-claimondo-navy">Wunschtermin vorschlagen</h2>
          <p className="text-sm text-claimondo-ondo mt-1">
            Ihr Fahrzeug wird zu <strong>{anzeige}</strong> gebracht. Wann möchten Sie es
            hinbringen? (optional)
          </p>
        </div>
        <WunschterminPicker value={wunschtermin} onChange={setWunschtermin} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="navy"
            onClick={onWunschterminVorschlagen}
            loading={wunschterminPending}
            disabled={!wunschtermin}
          >
            Wunschtermin vorschlagen
          </Button>
          <Button variant="ghost" onClick={onWeiter} disabled={wunschterminPending}>
            Überspringen
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-claimondo-navy">Wählen Sie Ihre Werkstatt</h2>
        <p className="text-sm text-claimondo-ondo mt-1">
          Die nächstgelegenen Partner-Werkstätten zu Ihrem Besichtigungsort. Sie können diesen
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
