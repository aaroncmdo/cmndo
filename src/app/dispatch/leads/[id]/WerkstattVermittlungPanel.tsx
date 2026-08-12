'use client'

// Phase 1, Task 5b: Reparatur-Werkstatt-Vermittlung im Dispatch-Lead-Detail
// (und via target='claim' in der Fallakte). Zeigt die aktuell zugewiesene
// Werkstatt + "Aendern" bzw. einen "Werkstatt vermitteln"-Button. Der Button
// oeffnet einen Drawer, laedt beim Oeffnen die nahen Partner-Werkstaetten
// (getWerkstaettenNah) und rendert den geteilten WerkstattFinder. Auswahl ->
// vermittleWerkstatt -> Toast + Drawer schliessen + router.refresh().
//
// Vorlage: SvDispatchPanel (Daten als Props, Server-Action + Result-Check +
// router.refresh). Sichtbar nur im Dispatch-/Fallakte-Kontext (dispatch/admin);
// beide Server-Actions sind zusaetzlich serverseitig per requireRole gehaertet.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WrenchIcon, MapPinIcon } from 'lucide-react'
import { Card, Button } from '@/components/primitives'
import { Drawer } from '@/components/primitives/Drawer'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { getWerkstaettenNah, vermittleWerkstatt } from './_actions/werkstatt-vermittlung'

type Props = {
  target: 'lead' | 'claim'
  id: string
  currentWerkstatt?: { id: string; name: string } | null
}

export default function WerkstattVermittlungPanel({ target, id, currentWerkstatt }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [werkstaetten, setWerkstaetten] = useState<WerkstattFinderRow[]>([])
  const [keineSpezialisierte, setKeineSpezialisierte] = useState(false)
  const [pending, startTransition] = useTransition()
  // Ops-Test 12.08. (Aaron): Im Haftpflichtfall blockte die P4-Invariante die
  // Vermittlung, solange der Kunde nicht digital unterschrieben hat. Hat der
  // Sachverstaendige die Sicherungsabtretung bereits offline eingeholt, bestaetigt
  // der Vermittelnde das hier — statt den Kunden ein zweites Mal unterschreiben zu lassen.
  const [saLiegtVor, setSaLiegtVor] = useState(false)

  function openDrawer() {
    setOpen(true)
    setLoading(true)
    setWerkstaetten([])
    getWerkstaettenNah({ target, id })
      .then((r) => {
        if (r.ok) {
          setWerkstaetten(r.werkstaetten)
          setKeineSpezialisierte(r.keineSpezialisierte)
        } else toast.error(r.error ?? 'Werkstätten konnten nicht geladen werden')
      })
      .catch(() => toast.error('Werkstätten konnten nicht geladen werden'))
      .finally(() => setLoading(false))
  }

  function handleSelect(werkstattId: string) {
    startTransition(async () => {
      const r = await vermittleWerkstatt({ target, id, werkstattId, saLiegtBereitsVor: saLiegtVor })
      if (r.ok) {
        toast.success('Werkstatt vermittelt')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(r.error ?? 'Vermittlung fehlgeschlagen')
      }
    })
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
            <WrenchIcon className="w-4 h-4 text-claimondo-ondo" />
            Reparatur-Werkstatt
          </h2>
          {currentWerkstatt ? (
            <p className="mt-1 text-sm text-claimondo-ondo truncate">{currentWerkstatt.name}</p>
          ) : (
            <p className="mt-1 text-xs text-claimondo-ondo/70">
              Noch keine Reparatur-Werkstatt vermittelt.
            </p>
          )}
        </div>
        <div className="shrink-0">
          <Button variant={currentWerkstatt ? 'ghost' : 'ondo'} size="sm" onClick={openDrawer}>
            {currentWerkstatt ? 'Ändern' : 'Werkstatt vermitteln'}
          </Button>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Werkstatt vermitteln"
        width={480}
        noPadding
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-claimondo-border px-5 py-4">
            <h3 className="text-base font-semibold text-claimondo-navy flex items-center gap-2">
              <WrenchIcon className="w-4 h-4 text-claimondo-ondo" />
              Werkstatt vermitteln
            </h3>
            <p className="mt-1 text-xs text-claimondo-ondo/70 flex items-center gap-1">
              <MapPinIcon className="w-3 h-3" />
              Partner-Werkstätten in der Nähe des Schadenorts
            </p>
          </div>
          {/* Ops-Test 12.08.: Ohne diese Bestätigung blockt die P4-Invariante die
              Vermittlung im Haftpflichtfall, bis der Kunde digital unterschreibt —
              obwohl der Sachverständige die SA oft längst analog eingeholt hat. */}
          <div className="border-b border-claimondo-border px-5 py-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={saLiegtVor}
                onChange={(e) => setSaLiegtVor(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-claimondo-ondo"
              />
              <span className="text-xs leading-relaxed text-claimondo-navy">
                Sicherungsabtretung liegt bereits vor
                <span className="mt-0.5 block text-claimondo-ondo/70">
                  Der Sachverständige hat sie eingeholt — der Kunde muss nicht erneut unterschreiben.
                  Wird mit Ihrem Namen und Zeitpunkt am Fall protokolliert.
                </span>
              </span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <WerkstattFinder
              werkstaetten={werkstaetten}
              loading={loading || pending}
              onSelect={handleSelect}
              selectedId={currentWerkstatt?.id ?? null}
              keineSpezialisierte={keineSpezialisierte}
            />
          </div>
        </div>
      </Drawer>
    </Card>
  )
}
