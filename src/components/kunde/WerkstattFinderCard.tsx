'use client'

// SP-C1 — Werkstatt-Finder-Card fuer die Kunde-Fallakte. Erscheint bei einem
// Reparatur-Claim OHNE hinterlegte Werkstatt: laedt die naechsten Partner-Werkstaetten
// und laesst den Kunden eine waehlen (assignReparaturWerkstatt quelle='kunde'). Danach
// uebernimmt die bestehende WerkstattCard (Wunschtermin). SP-C2 ersetzt die Liste
// durch eine Mapbox-Karte auf denselben Actions.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WrenchIcon } from 'lucide-react'

import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import { Card } from '@/components/primitives'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import {
  ladeWerkstaettenFuerClaim,
  waehleWerkstattPortal,
} from '@/app/kunde/faelle/[id]/werkstatt-finder-actions'

export default function WerkstattFinderCard({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    ladeWerkstaettenFuerClaim(claimId).then((r) => {
      if (!alive) return
      setWerkstaetten(r.ok ? r.werkstaetten : [])
    })
    return () => {
      alive = false
    }
  }, [claimId])

  async function handleSelect(werkstattId: string) {
    setSelectedId(werkstattId)
    const res = await waehleWerkstattPortal(claimId, werkstattId)
    if (!res.ok) {
      toast.error(res.error ?? 'Fehler')
      setSelectedId(null)
      return
    }
    toast.success('Werkstatt ausgewählt.')
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <WrenchIcon className="w-5 h-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Werkstatt finden</h2>
        </div>
        <p className="text-body-sm text-claimondo-ondo">
          Wähle eine Partner-Werkstatt in deiner Nähe für die Reparatur. Sie meldet sich danach zur
          Terminabstimmung bei dir.
        </p>
        <WerkstattFinder
          werkstaetten={werkstaetten ?? []}
          onSelect={handleSelect}
          selectedId={selectedId}
          loading={werkstaetten === null || isPending}
        />
      </div>
    </Card>
  )
}
