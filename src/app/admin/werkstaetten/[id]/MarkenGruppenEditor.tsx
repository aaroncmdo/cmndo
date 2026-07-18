'use client'

// Task #5 (Werkstatt-Datenpflege): Inline-Editor für Marken + Fahrzeug-Gruppen auf der
// Werkstatt-Detailseite. Vorher gab es KEINE UI für diese beiden Ranking-Achsen (nur faehigkeiten).
// Marke ist die STÄRKSTE Achse (markengebunden schlägt frei). Reuse der Server-Actions
// setWerkstattMarken / setWerkstattFahrzeugGruppen — Toggle-Chips über das Button-Primitive
// (navy=aktiv / ghost=inaktiv), exakt wie FaehigkeitenStaffelEditor (component-set-ratchet-safe).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { HAEUFIGE_HERSTELLER } from '@/app/embed/werkstatt-finder/_components/wizard-logic'
import { FAHRZEUG_GRUPPEN } from '@/lib/werkstatt/fahrzeug-gruppen'
import { setWerkstattMarken, setWerkstattFahrzeugGruppen } from '../actions'

const INPUT_CLS =
  'flex-1 px-3 py-2 rounded-ios-md border border-claimondo-border bg-white text-body-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20'

export function MarkenGruppenEditor({
  werkstattId,
  marken,
  fahrzeugGruppen,
}: {
  werkstattId: string
  marken: string[]
  fahrzeugGruppen: string[]
}) {
  const router = useRouter()
  const [markenSel, setMarkenSel] = useState<string[]>(marken)
  const [markenInput, setMarkenInput] = useState('')
  const [markenBusy, setMarkenBusy] = useState(false)
  const [gruppenSel, setGruppenSel] = useState<string[]>(fahrzeugGruppen)
  const [gruppenBusy, setGruppenBusy] = useState(false)

  const hatMarke = (m: string) => markenSel.some((x) => x.toLowerCase() === m.toLowerCase())

  function toggleMarke(m: string) {
    setMarkenSel((prev) => (hatMarke(m) ? prev.filter((x) => x.toLowerCase() !== m.toLowerCase()) : [...prev, m]))
  }
  function addCustomMarke() {
    const m = markenInput.trim()
    if (m && !hatMarke(m)) setMarkenSel((prev) => [...prev, m])
    setMarkenInput('')
  }

  async function speichereMarken() {
    setMarkenBusy(true)
    try {
      const res = await setWerkstattMarken(werkstattId, markenSel)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Marken gespeichert')
      router.refresh()
    } finally {
      setMarkenBusy(false)
    }
  }

  function toggleGruppe(g: string) {
    setGruppenSel((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }
  async function speichereGruppen() {
    setGruppenBusy(true)
    try {
      const res = await setWerkstattFahrzeugGruppen(werkstattId, gruppenSel)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Fahrzeug-Gruppen gespeichert')
      router.refresh()
    } finally {
      setGruppenBusy(false)
    }
  }

  // Selektierte Freitext-Marken (nicht in der Häufig-Liste) zuerst zeigen, danach die
  // Häufig-Liste — so bleiben Custom-Brands sichtbar + abwählbar, ohne separaten X-Button.
  const customSelektiert = markenSel.filter(
    (m) => !HAEUFIGE_HERSTELLER.some((h) => h.toLowerCase() === m.toLowerCase()),
  )
  const markenChips = [...customSelektiert, ...HAEUFIGE_HERSTELLER]

  return (
    <div className="space-y-6">
      {/* ── Marken ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-semibold text-claimondo-navy">Marken</h3>
          <p className="text-caption text-claimondo-shield/70">
            Stärkste Ranking-Achse — markengebundene Werkstätten schlagen freie. Leer = markenoffen.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {markenChips.map((m) => (
            <Button
              key={m}
              variant={hatMarke(m) ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => toggleMarke(m)}
            >
              {m}
            </Button>
          ))}
        </div>

        {/* Freitext-Marke hinzufügen (Brands außerhalb der Häufig-Liste) */}
        <div className="flex gap-2">
          <input
            value={markenInput}
            onChange={(e) => setMarkenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomMarke()
              }
            }}
            placeholder="Weitere Marke hinzufügen…"
            className={INPUT_CLS}
          />
          <Button variant="ghost" onClick={addCustomMarke}>
            <PlusIcon className="w-4 h-4" />
          </Button>
        </div>

        <Button variant="navy" onClick={speichereMarken} loading={markenBusy}>
          Marken speichern
        </Button>
      </section>

      {/* ── Fahrzeug-Gruppen ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-body font-semibold text-claimondo-navy">Fahrzeug-Gruppen</h3>
          <p className="text-caption text-claimondo-shield/70">
            Welche Fahrzeugklassen die Werkstatt bedient. Leer = keine Einschränkung (schlechter gerankt).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FAHRZEUG_GRUPPEN.map((g) => (
            <Button
              key={g.value}
              variant={gruppenSel.includes(g.value) ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => toggleGruppe(g.value)}
            >
              {g.label}
            </Button>
          ))}
        </div>
        <Button variant="navy" onClick={speichereGruppen} loading={gruppenBusy}>
          Fahrzeug-Gruppen speichern
        </Button>
      </section>
    </div>
  )
}
