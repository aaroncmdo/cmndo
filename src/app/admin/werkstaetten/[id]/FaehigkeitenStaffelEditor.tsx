'use client'

// Inline-Editoren fuer Faehigkeiten + Staffelung auf der Werkstatt-Detailseite.
// Reuse der bestehenden Server-Actions (setWerkstattFaehigkeiten / setWerkstattStaffel) —
// kein neuer Backend-Code. Ausgelagert, damit WerkstattDetailClient nicht weiter waechst.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { setWerkstattFaehigkeiten } from '../actions'
import { setWerkstattStaffel } from '../staffel-actions'

const FAEH_OPTIONS: { value: string; label: string }[] = [
  { value: 'karosserie', label: 'Karosserie' },
  { value: 'lackierung', label: 'Lackierung' },
  { value: 'mechanik', label: 'Mechanik' },
  { value: 'glas', label: 'Glas' },
  { value: 'smart_repair', label: 'Smart-Repair' },
]

const INPUT_CLS =
  'w-full px-3 py-2 rounded-ios-md border border-claimondo-border bg-white text-body-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20'

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export function FaehigkeitenStaffelEditor({
  werkstattId,
  faehigkeiten,
  staffel,
}: {
  werkstattId: string
  faehigkeiten: string[]
  staffel: { schwelle: number; bonus_betrag_netto: number }[]
}) {
  const router = useRouter()
  const [faehEdit, setFaehEdit] = useState(false)
  const [faehSel, setFaehSel] = useState<string[]>(faehigkeiten)
  const [faehBusy, setFaehBusy] = useState(false)
  const [staffelEdit, setStaffelEdit] = useState(false)
  const [rows, setRows] = useState<{ schwelle: string; bonus: string }[]>(
    staffel.map((s) => ({ schwelle: String(s.schwelle), bonus: String(s.bonus_betrag_netto) })),
  )
  const [staffelBusy, setStaffelBusy] = useState(false)

  function toggleFaeh(v: string) {
    setFaehSel((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
  }

  async function speichereFaeh() {
    setFaehBusy(true)
    try {
      const res = await setWerkstattFaehigkeiten(werkstattId, faehSel)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Fähigkeiten gespeichert')
      setFaehEdit(false)
      router.refresh()
    } finally {
      setFaehBusy(false)
    }
  }

  async function speichereStaffel() {
    setStaffelBusy(true)
    try {
      const stufen = rows
        .filter((r) => r.schwelle.trim() !== '')
        .map((r) => ({ schwelle: Number(r.schwelle), bonus_betrag_netto: Number(r.bonus) || 0 }))
      const res = await setWerkstattStaffel(werkstattId, stufen)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Staffelung gespeichert')
      setStaffelEdit(false)
      router.refresh()
    } finally {
      setStaffelBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Fähigkeiten */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-body-xs text-claimondo-ondo">Fähigkeiten</p>
          {!faehEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFaehSel(faehigkeiten)
                setFaehEdit(true)
              }}
              iconLeft={<PencilIcon className="w-4 h-4" />}
            >
              Bearbeiten
            </Button>
          )}
        </div>
        {!faehEdit ? (
          <p className="text-body-sm text-claimondo-navy">
            {faehigkeiten.length > 0
              ? faehigkeiten.map((f) => FAEH_OPTIONS.find((o) => o.value === f)?.label ?? f).join(', ')
              : 'Vollservice (keine Einschränkung)'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {FAEH_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  variant={faehSel.includes(o.value) ? 'navy' : 'ghost'}
                  size="sm"
                  onClick={() => toggleFaeh(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <p className="text-body-xs text-claimondo-ondo">Nichts gewählt = Vollservice.</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFaehEdit(false)}>
                Abbrechen
              </Button>
              <Button variant="navy" size="sm" loading={faehBusy} onClick={speichereFaeh}>
                Speichern
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Staffelung */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-body-xs text-claimondo-ondo">Staffel-Boni</p>
          {!staffelEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRows(staffel.map((s) => ({ schwelle: String(s.schwelle), bonus: String(s.bonus_betrag_netto) })))
                setStaffelEdit(true)
              }}
              iconLeft={<PencilIcon className="w-4 h-4" />}
            >
              Bearbeiten
            </Button>
          )}
        </div>
        {!staffelEdit ? (
          staffel.length === 0 ? (
            <p className="text-body-sm text-claimondo-ondo">Keine Staffel-Stufen hinterlegt.</p>
          ) : (
            <ul className="text-body-sm text-claimondo-navy space-y-0.5">
              {staffel.map((s, i) => (
                <li key={i}>
                  ab {s.schwelle} Vermittlungen → {euro(s.bonus_betrag_netto)} Bonus
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={r.schwelle}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, schwelle: e.target.value } : x)))}
                  placeholder="ab X Vermittlungen"
                  className={INPUT_CLS}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.bonus}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, bonus: e.target.value } : x)))}
                  placeholder="Bonus (netto €)"
                  className={INPUT_CLS}
                />
                <Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2Icon className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((rs) => [...rs, { schwelle: '', bonus: '' }])}
              iconLeft={<PlusIcon className="w-4 h-4" />}
            >
              Stufe hinzufügen
            </Button>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStaffelEdit(false)}>
                Abbrechen
              </Button>
              <Button variant="navy" size="sm" loading={staffelBusy} onClick={speichereStaffel}>
                Speichern
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
