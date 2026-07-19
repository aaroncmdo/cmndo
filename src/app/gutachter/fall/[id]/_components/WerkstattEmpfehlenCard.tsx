'use client'

// Gutachter empfiehlt IM AUFTRAG des Kunden 1-3 Partner-Werkstaetten (Option 1).
// Anders als die fruehere Direkt-Zuweisung: hier waehlt der SV bis zu 3 Werkstaetten
// als EMPFEHLUNG. Der Kunde bekommt sie per WhatsApp+Email und waehlt selbst auf
// /werkstatt-empfehlung/[token] — erst die Kundenwahl feuert assignReparaturWerkstatt.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { empfehleWerkstaettenAlsGutachter } from '../_actions/werkstatt-empfehlung'

type Props = { fallId: string; werkstaetten: (WerkstattFinderRow & { gruende?: MatchGrund[] })[] }

export function WerkstattEmpfehlenCard({ fallId, werkstaetten }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]))
  }

  function senden() {
    startTransition(async () => {
      const res = await empfehleWerkstaettenAlsGutachter({ fallId, werkstattIds: selected })
      if (!res.ok) {
        toast.error(res.error ?? 'Empfehlung fehlgeschlagen')
        return
      }
      toast.success('Empfehlung gesendet — der Kunde wählt jetzt selbst per WhatsApp/E-Mail.')
      setSelected([])
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-claimondo-navy">Werkstatt für den Kunden empfehlen</p>
        <p className="text-xs text-claimondo-ondo mt-1">
          Wähle bis zu 3 passende Partner-Werkstätten aus. Der Kunde erhält die Empfehlung per WhatsApp und
          E-Mail und wählt selbst eine aus.
        </p>
      </div>
      <WerkstattFinder werkstaetten={werkstaetten} onSelect={toggle} selectedIds={selected} loading={false} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-claimondo-ondo">{selected.length}/3 ausgewählt</p>
        <Button variant="navy" size="sm" onClick={senden} loading={pending} disabled={selected.length === 0}>
          {selected.length > 1 ? `${selected.length} Werkstätten empfehlen` : 'Werkstatt empfehlen'}
        </Button>
      </div>
    </div>
  )
}
