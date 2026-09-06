'use client'

// SP-C1/C2 — Werkstatt-Finder-Card fuer die Kunde-Fallakte. Erscheint bei einem
// Reparatur-Claim OHNE hinterlegte Werkstatt: laedt die naechsten Partner-Werkstaetten
// + den Schadenort und laesst den Kunden auf einer Karte (+ Liste) eine waehlen
// (assignReparaturWerkstatt quelle='kunde'). Danach uebernimmt die bestehende
// WerkstattCard (Wunschtermin).

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WrenchIcon } from 'lucide-react'

import { WerkstattFinderMap } from '@/components/kunde/WerkstattFinderMap'
import { Card } from '@/components/primitives'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import {
  ladeWerkstaettenFuerClaim,
  waehleWerkstattPortal,
} from '@/app/kunde/faelle/[id]/werkstatt-finder-actions'

export default function WerkstattFinderCard({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[] | null>(null)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [keineSpezialisierte, setKeineSpezialisierte] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    ladeWerkstaettenFuerClaim(claimId).then((r) => {
      if (!alive) return
      if (r.ok) {
        setWerkstaetten(r.werkstaetten)
        setCenter(r.center)
        setKeineSpezialisierte(r.keineSpezialisierte)
      } else {
        setWerkstaetten([])
      }
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
          Wählen Sie eine Partner-Werkstatt in Ihrer Nähe für die Reparatur. Die Werkstatt meldet sich
          danach zur Terminabstimmung bei Ihnen.
        </p>
        <WerkstattFinderMap
          werkstaetten={werkstaetten ?? []}
          center={center}
          onSelect={handleSelect}
          selectedId={selectedId}
          loading={werkstaetten === null || isPending}
          keineSpezialisierte={keineSpezialisierte}
        />
      </div>
    </Card>
  )
}
