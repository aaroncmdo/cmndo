'use client'

// Aktionen je Stadt-Zeile. Muster: wissen-artikel/GenerateDraftButton.tsx
// (useTransition + sonner-toast + primitives/Button).
//
// Besonderheit: `verworfen[]` wird als eigener Toast gezeigt. Was am
// Quellenzwang gescheitert ist, MUSS sichtbar sein — ein stiller Verlust waere
// schlimmer als gar keine Pruefung, weil der Reviewer sonst nicht weiss, dass
// das Modell etwas geliefert hat, das wir nicht belegen konnten.

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { generiereEntwurf, veroeffentliche, verwirf } from './actions'

type Props = {
  stadtSlug: string
  eintragId: string | null
  status: string | null
}

function meldeVerworfene(verworfen: string[] | undefined) {
  if (!verworfen?.length) return
  toast.warning(`${verworfen.length} Eintrag/Einträge verworfen`, {
    description: verworfen.join(' · '),
    duration: 12_000,
  })
}

export default function LokalContentActions({ stadtSlug, eintragId, status }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleGenerieren() {
    startTransition(async () => {
      const res = await generiereEntwurf(stadtSlug)
      meldeVerworfene(res.verworfen)
      if (!res.ok) {
        toast.error(res.error ?? 'Inhalt konnte nicht erzeugt werden')
        return
      }
      // Seit 18.08.2026 geht ein Entwurf, der das Gate besteht, direkt live.
      // Der Review-Fall ist kein Fehler mehr, sondern das erwartete Ergebnis
      // eines arbeitenden Gates — deshalb ein Hinweis-Toast, kein roter.
      if (res.veroeffentlicht) {
        toast.success(
          `Veröffentlicht (Substanz-Score ${res.substanzScore ?? 0}) — die Stadtseite zeigt den Inhalt beim nächsten Aufbau.`,
        )
        return
      }
      toast.warning('Nicht automatisch veröffentlicht — liegt zur Prüfung bereit.', {
        description: res.hinweis,
        duration: 12_000,
      })
    })
  }

  function handleVeroeffentlichen() {
    if (!eintragId) return
    startTransition(async () => {
      const res = await veroeffentliche(eintragId)
      if (!res.ok) {
        toast.error(res.error ?? 'Veröffentlichen fehlgeschlagen')
        return
      }
      toast.success('Veröffentlicht — die Stadtseite zeigt den Inhalt beim nächsten Aufbau.')
    })
  }

  function handleVerwerfen() {
    if (!eintragId) return
    startTransition(async () => {
      const res = await verwirf(eintragId)
      if (!res.ok) {
        toast.error(res.error ?? 'Verwerfen fehlgeschlagen')
        return
      }
      toast.success('Entwurf verworfen.')
    })
  }

  // Offener Entwurf -> prüfen. Sonst -> neuen Entwurf anstoßen.
  const offen = status === 'entwurf' || status === 'in_review'

  if (offen && eintragId) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="navy" size="sm" loading={isPending} onClick={handleVeroeffentlichen}>
          Veröffentlichen
        </Button>
        <Button variant="ghost" size="sm" disabled={isPending} onClick={handleVerwerfen}>
          Verwerfen
        </Button>
      </div>
    )
  }

  return (
    <Button variant="ondo" size="sm" loading={isPending} onClick={handleGenerieren}>
      {status === 'veroeffentlicht' ? 'Neu erzeugen' : 'Erzeugen & veröffentlichen'}
    </Button>
  )
}
