'use client'

// S2: SV editiert die Gutachten-Bewertungswerte (Reparaturkosten/Minderwert/WBW/Restwert/
// Nutzungsausfall + Totalschaden). Ersetzt den read-only-"erkannt"-Block, der aus der
// GutachtenCard rauswandert. OCR füllt vor; der SV ist die Autorität. Validierung (anomalien.ts)
// inline + advisory (nicht blockierend). "bestätigt"-Badge, wenn ein Mensch die Werte geprüft hat.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { PencilIcon, CheckIcon, AlertTriangleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { berechneGutachtenAnomalien } from '@/lib/qc/anomalien'
import { SV_WERTE_FELDER, type WerteFeld } from '@/lib/gutachter/gutachten-werte-felder'
import { updateGutachtenWerteSv } from '../actions'

export type GutachtenWerte = Record<string, number | boolean | null>

function fmtEur(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)
}
function fmtDisplay(f: WerteFeld, v: number | boolean | null): string {
  if (v === null) return '—'
  if (f.typ === 'bool') return v ? 'Ja' : 'Nein'
  if (f.typ === 'int') return String(v)
  return fmtEur(v as number)
}

export function GutachtenWerteCard({
  fallId,
  werte,
  manuellUeberschrieben,
}: {
  fallId: string
  werte: GutachtenWerte
  manuellUeberschrieben: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<GutachtenWerte>(werte)
  const [saving, startSaving] = useTransition()

  // Advisory-Validierung auf dem aktuellen Draft (gutachten_fin=null -> FIN-Regel greift nicht).
  const anomalien = berechneGutachtenAnomalien({
    reparaturkosten_netto: (draft.reparaturkosten_netto as number | null) ?? null,
    wiederbeschaffungswert: (draft.wiederbeschaffungswert as number | null) ?? null,
    restwert: (draft.restwert as number | null) ?? null,
    minderwert: (draft.minderwert as number | null) ?? null,
    totalschaden: (draft.totalschaden as boolean | null) ?? null,
    gutachten_fin: null,
  })

  function setFeld(f: WerteFeld, raw: string | boolean) {
    setDraft((d) => ({
      ...d,
      [f.key]: f.typ === 'bool' ? (raw as boolean) : raw === '' ? null : Number(raw),
    }))
  }

  function handleSave() {
    startSaving(async () => {
      const res = await updateGutachtenWerteSv(
        fallId,
        draft as Record<string, string | number | boolean | null>,
      )
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Gutachten-Werte gespeichert.')
        setEditMode(false)
      }
    })
  }

  return (
    <SectionCard bodyClassName="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Gutachten-Werte
        </h3>
        {manuellUeberschrieben && !editMode && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success-strong">
            <CheckIcon className="w-3 h-3" /> vom Gutachter bestätigt
          </span>
        )}
      </div>

      {editMode ? (
        <>
          <div className="grid grid-cols-1 gap-2">
            {SV_WERTE_FELDER.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-claimondo-ondo">{f.label}</span>
                {f.typ === 'bool' ? (
                  <input
                    type="checkbox"
                    checked={!!draft[f.key]}
                    onChange={(e) => setFeld(f, e.target.checked)}
                    className="h-4 w-4 rounded border-claimondo-border"
                  />
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft[f.key] === null || draft[f.key] === undefined ? '' : String(draft[f.key])}
                    onChange={(e) => setFeld(f, e.target.value)}
                    className="w-32 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-2 py-1 text-right text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
                  />
                )}
              </label>
            ))}
          </div>

          {anomalien.length > 0 && (
            <div className="rounded-ios-lg bg-warning-soft border border-warning/30 p-2 space-y-1">
              {anomalien.map((a) => (
                <p key={a.code} className="flex items-start gap-1.5 text-[11px] text-warning-strong">
                  <AlertTriangleIcon className="w-3 h-3 mt-0.5 shrink-0" /> {a.text}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="navy" size="sm" loading={saving} onClick={handleSave}>
              Speichern
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setDraft(werte)
                setEditMode(false)
              }}
            >
              Abbrechen
            </Button>
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            {SV_WERTE_FELDER.filter((f) => werte[f.key] !== null && werte[f.key] !== undefined).map(
              (f) => (
                <div key={f.key} className="contents">
                  <dt className="text-claimondo-ondo">{f.label}</dt>
                  <dd className="text-claimondo-navy text-right font-medium">
                    {fmtDisplay(f, werte[f.key] ?? null)}
                  </dd>
                </div>
              ),
            )}
          </dl>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<PencilIcon className="w-3.5 h-3.5" />}
            onClick={() => setEditMode(true)}
          >
            Werte bearbeiten
          </Button>
        </>
      )}
    </SectionCard>
  )
}
