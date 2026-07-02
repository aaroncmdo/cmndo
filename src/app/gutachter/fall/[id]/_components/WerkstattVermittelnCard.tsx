'use client'

// Gutachter vermittelt IM AUFTRAG des Kunden eine Partner-Werkstatt (aus unserem Pool).
// Wird (via topServerBlocks in page.tsx) nur gerendert, wenn brauchtWerkstattVermittlung
// true ist — Reparatur gewuenscht + noch keine Werkstatt hinterlegt. Nach der Wahl wird
// der Kunde automatisch benachrichtigt (assignReparaturWerkstatt).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { vermittleWerkstattAlsGutachter } from '../actions'

type Props = {
  fallId: string
  werkstaetten: WerkstattFinderRow[]
}

export function WerkstattVermittelnCard({ fallId, werkstaetten }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function onSelect(werkstattId: string) {
    setSelectedId(werkstattId)
    startTransition(async () => {
      const res = await vermittleWerkstattAlsGutachter({ fallId, werkstattId })
      if (!res.ok) {
        toast.error(res.error ?? 'Vermittlung fehlgeschlagen')
        setSelectedId(null)
        return
      }
      toast.success('Werkstatt für den Kunden vermittelt. Er wird benachrichtigt.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-claimondo-navy">Werkstatt für den Kunden vermitteln</p>
        <p className="text-xs text-claimondo-ondo mt-1">
          Der Kunde möchte reparieren und hat noch keine Werkstatt. Wähle im Auftrag des Kunden eine der
          nächstgelegenen Partner-Werkstätten aus – er wird automatisch informiert.
        </p>
      </div>
      <WerkstattFinder
        werkstaetten={werkstaetten}
        onSelect={onSelect}
        selectedId={selectedId}
        loading={pending}
      />
    </div>
  )
}
