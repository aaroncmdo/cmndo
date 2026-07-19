'use client'

// Gutachter empfiehlt IM AUFTRAG des Kunden 1-3 Partner-Werkstaetten (Option 1).
// Anders als die fruehere Direkt-Zuweisung: hier waehlt der SV bis zu 3 Werkstaetten
// als EMPFEHLUNG. Der Kunde bekommt sie per WhatsApp+Email und waehlt selbst auf
// /werkstatt-empfehlung/[token] — erst die Kundenwahl feuert assignReparaturWerkstatt.
//
// Zwei Zustaende, beide DB-driven aus page.tsx (kein lokaler UI-State):
//   offeneEmpfehlung == null -> Finder + „empfehlen"
//   offeneEmpfehlung != null -> „laeuft"-Zustand + Zurueckziehen (Spec §11)

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { MatchGrund } from '@/lib/werkstatt/matching/rank-vorschlaege'
import {
  empfehleWerkstaettenAlsGutachter,
  zieheWerkstattEmpfehlungZurueck,
} from '../_actions/werkstatt-empfehlung'

type OffeneEmpfehlung = { anzahl: number; gesendetAm: string; werkstattNamen: string[] }

type Props = {
  fallId: string
  werkstaetten: (WerkstattFinderRow & { gruende?: MatchGrund[] })[]
  offeneEmpfehlung?: OffeneEmpfehlung | null
}

function gesendetLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function WerkstattEmpfehlenCard({ fallId, werkstaetten, offeneEmpfehlung }: Props) {
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

  function zurueckziehen() {
    startTransition(async () => {
      const res = await zieheWerkstattEmpfehlungZurueck({ fallId })
      if (!res.ok) {
        toast.error(res.error ?? 'Zurückziehen fehlgeschlagen')
        return
      }
      toast.success('Empfehlung zurückgezogen — der Link ist nicht mehr gültig.')
      router.refresh()
    })
  }

  // Laufende Empfehlung: der Kunde hat den Magic-Link und waehlt gerade. Hier bewusst
  // KEIN zweiter Finder — ein zweiter Batch wuerde einen parallelen Link erzeugen (die
  // Action blockt das serverseitig ohnehin). Stattdessen Status + Ruecknahme.
  if (offeneEmpfehlung) {
    const gesendet = gesendetLabel(offeneEmpfehlung.gesendetAm)
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">Empfehlung läuft</p>
          <p className="text-xs text-claimondo-ondo mt-1">
            Der Kunde hat{' '}
            {offeneEmpfehlung.anzahl === 1
              ? 'eine Werkstatt'
              : `${offeneEmpfehlung.anzahl} Werkstätten`}{' '}
            per WhatsApp und E-Mail erhalten und wählt selbst aus
            {gesendet ? ` — gesendet am ${gesendet}` : ''}.
          </p>
        </div>
        {offeneEmpfehlung.werkstattNamen.length > 0 && (
          <ul className="space-y-1">
            {offeneEmpfehlung.werkstattNamen.map((name) => (
              <li key={name} className="text-sm text-claimondo-navy">
                • {name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-claimondo-ondo">Erst die Wahl des Kunden weist die Werkstatt zu.</p>
          <Button variant="ghost" size="sm" onClick={zurueckziehen} loading={pending}>
            Empfehlung zurückziehen
          </Button>
        </div>
      </div>
    )
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
