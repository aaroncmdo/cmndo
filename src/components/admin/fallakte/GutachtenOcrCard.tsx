'use client'

// Admin-only Card: zeigt + editiert die per Claude-OCR aus dem Gutachten
// extrahierten Werte des Claims. Fuer KB/SV/Kunde/Kanzlei wird sie nicht
// eingebunden; in getClaimForRole werden die Felder fuer Nicht-Admins
// ohnehin entfernt.
//
// Cluster:
//   Kern  — Reparatur, Minderwert, WBW, Restwert, Totalschaden, Gutachten-Datum
//   A     — Fahrzeug-Stammdaten (FIN, Kennzeichen, Erstzulassung, …)
//   B     — Vorschaeden + Karosseriezustand
//   C     — Reparatur-Detail (Lohnsaetze, Stunden, Material)
//   D     — Mietwagen + Nutzungsausfall
//   E     — SV-Metadaten + Kalkulationssystem
//
// Re-Run: triggert die OCR-Pipeline neu (force=true). Manuelle Korrekturen
// bleiben erhalten — ein Admin-Edit setzt
// gutachten_ocr_manuell_ueberschrieben=true; der Re-Run fuellt dann nur
// Felder die noch NULL sind.

import { useState, useTransition } from 'react'
import { FileText, AlertTriangle, RefreshCw, Pencil, Save, X } from 'lucide-react'
import {
  reRunGutachtenOcr,
  updateGutachtenOcrFelder,
} from '@/app/faelle/[id]/_actions'

export type GutachtenOcrCardData = {
  // Kontext
  claim_id: string
  fall_id: string
  /** Auftrag-ID des erstgutachten — Pipeline-Trigger braucht das. */
  auftrag_id: string | null
  // Kern
  reparaturkosten_netto: number | null
  reparaturkosten_brutto: number | null
  minderwert: number | null
  restwert: number | null
  wiederbeschaffungswert: number | null
  wiederbeschaffungsdauer_tage: number | null
  nutzungsausfall_tage: number | null
  totalschaden: boolean | null
  gutachten_datum: string | null
  // A
  gutachten_fin: string | null
  gutachten_kennzeichen: string | null
  gutachten_erstzulassung: string | null
  gutachten_laufleistung_km: number | null
  gutachten_tuv_bis: string | null
  gutachten_fahrzeug_typ: string | null
  gutachten_farbe: string | null
  gutachten_farbcode: string | null
  gutachten_kraftstoff: string | null
  // B
  gutachten_vorschaeden_text: string | null
  gutachten_lackmesswert_max_my: number | null
  gutachten_karosseriezustand: string | null
  // C
  gutachten_zeit_ak_std: number | null
  gutachten_zeit_kar_std: number | null
  gutachten_zeit_lack_std: number | null
  gutachten_lohnsatz_ak_eur: number | null
  gutachten_lohnsatz_kar_eur: number | null
  gutachten_lohnsatz_lack_eur: number | null
  gutachten_materialkosten_eur: number | null
  gutachten_lackmaterial_eur: number | null
  gutachten_verbringung_eur: number | null
  // D
  gutachten_mietwagen_klasse: string | null
  gutachten_mietwagen_tagessatz_eur: number | null
  gutachten_nutzungsausfall_tagessatz_eur: number | null
  // E
  gutachten_sv_honorar_netto: number | null
  gutachten_sv_honorar_brutto: number | null
  gutachten_kalkulationssystem: string | null
  gutachten_seitenzahl: number | null
  // Meta
  gutachten_ocr_processed_at: string | null
  gutachten_ocr_error: string | null
  gutachten_ocr_manuell_ueberschrieben: boolean | null
}

const formatEuro = (n: number | null) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const formatNumber = (n: number | null, suffix = '') =>
  n == null ? '–' : `${n.toLocaleString('de-DE')}${suffix}`

const formatDate = (s: string | null) => {
  if (!s) return '–'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
}

type FieldDef = {
  key: keyof GutachtenOcrCardData
  label: string
  /** UI-Typ — bestimmt input + Anzeige. */
  typ: 'eur' | 'int' | 'num' | 'text' | 'date' | 'bool' | 'select'
  /** Bei typ='select' die zulaessigen Optionen. */
  options?: string[]
  /** Suffix fuer Anzeige (z.B. "Tage", "h"). */
  suffix?: string
}

const KERN_FELDER: FieldDef[] = [
  { key: 'reparaturkosten_netto', label: 'Reparaturkosten netto', typ: 'eur' },
  { key: 'reparaturkosten_brutto', label: 'Reparaturkosten brutto', typ: 'eur' },
  { key: 'minderwert', label: 'Minderwert', typ: 'eur' },
  { key: 'wiederbeschaffungswert', label: 'Wiederbeschaffungswert', typ: 'eur' },
  { key: 'restwert', label: 'Restwert', typ: 'eur' },
  { key: 'wiederbeschaffungsdauer_tage', label: 'Wiederbeschaffungsdauer', typ: 'int', suffix: ' Tage' },
  { key: 'nutzungsausfall_tage', label: 'Nutzungsausfall', typ: 'int', suffix: ' Tage' },
  { key: 'totalschaden', label: 'Totalschaden', typ: 'bool' },
  { key: 'gutachten_datum', label: 'Gutachten-Datum', typ: 'date' },
]

const FAHRZEUG_FELDER: FieldDef[] = [
  { key: 'gutachten_fin', label: 'FIN', typ: 'text' },
  { key: 'gutachten_kennzeichen', label: 'Kennzeichen', typ: 'text' },
  { key: 'gutachten_erstzulassung', label: 'Erstzulassung', typ: 'date' },
  { key: 'gutachten_laufleistung_km', label: 'Laufleistung', typ: 'int', suffix: ' km' },
  { key: 'gutachten_tuv_bis', label: 'HU/AU bis', typ: 'date' },
  { key: 'gutachten_fahrzeug_typ', label: 'Fahrzeug-Typ', typ: 'text' },
  { key: 'gutachten_farbe', label: 'Farbe', typ: 'text' },
  { key: 'gutachten_farbcode', label: 'Farbcode', typ: 'text' },
  {
    key: 'gutachten_kraftstoff',
    label: 'Kraftstoff',
    typ: 'select',
    options: ['benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'sonstiges'],
  },
]

const ZUSTAND_FELDER: FieldDef[] = [
  { key: 'gutachten_vorschaeden_text', label: 'Vorschaeden', typ: 'text' },
  { key: 'gutachten_lackmesswert_max_my', label: 'Lackmesswert max', typ: 'num', suffix: ' µm' },
  {
    key: 'gutachten_karosseriezustand',
    label: 'Karosseriezustand',
    typ: 'select',
    options: ['makellos', 'gebrauchsspuren', 'unfallbeschaedigt', 'sonstiges'],
  },
]

const REPARATUR_FELDER: FieldDef[] = [
  { key: 'gutachten_zeit_ak_std', label: 'Zeit Mechanik', typ: 'num', suffix: ' h' },
  { key: 'gutachten_zeit_kar_std', label: 'Zeit Karosserie', typ: 'num', suffix: ' h' },
  { key: 'gutachten_zeit_lack_std', label: 'Zeit Lack', typ: 'num', suffix: ' h' },
  { key: 'gutachten_lohnsatz_ak_eur', label: 'Lohnsatz Mechanik', typ: 'eur' },
  { key: 'gutachten_lohnsatz_kar_eur', label: 'Lohnsatz Karosserie', typ: 'eur' },
  { key: 'gutachten_lohnsatz_lack_eur', label: 'Lohnsatz Lack', typ: 'eur' },
  { key: 'gutachten_materialkosten_eur', label: 'Materialkosten', typ: 'eur' },
  { key: 'gutachten_lackmaterial_eur', label: 'Lackmaterial', typ: 'eur' },
  { key: 'gutachten_verbringung_eur', label: 'Verbringung', typ: 'eur' },
]

const MIETWAGEN_FELDER: FieldDef[] = [
  { key: 'gutachten_mietwagen_klasse', label: 'Mietwagen-Klasse', typ: 'text' },
  { key: 'gutachten_mietwagen_tagessatz_eur', label: 'Mietwagen Tagessatz', typ: 'eur' },
  { key: 'gutachten_nutzungsausfall_tagessatz_eur', label: 'Nutzungsausfall Tagessatz', typ: 'eur' },
]

const SV_META_FELDER: FieldDef[] = [
  { key: 'gutachten_sv_honorar_netto', label: 'SV-Honorar netto', typ: 'eur' },
  { key: 'gutachten_sv_honorar_brutto', label: 'SV-Honorar brutto', typ: 'eur' },
  {
    key: 'gutachten_kalkulationssystem',
    label: 'Kalkulationssystem',
    typ: 'select',
    options: ['audatex', 'dat', 'autoixpert', 'sonstiges'],
  },
  { key: 'gutachten_seitenzahl', label: 'Seitenzahl', typ: 'int' },
]

function displayValue(field: FieldDef, value: unknown): string {
  if (value == null || value === '') return '–'
  switch (field.typ) {
    case 'eur':
      return formatEuro(value as number)
    case 'int':
      return formatNumber(value as number, field.suffix ?? '')
    case 'num':
      return formatNumber(value as number, field.suffix ?? '')
    case 'date':
      return formatDate(value as string)
    case 'bool':
      return value ? 'Ja' : 'Nein'
    default:
      return String(value)
  }
}

export default function GutachtenOcrCard({ data }: { data: GutachtenOcrCardData }) {
  const [editMode, setEditMode] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [draft, setDraft] = useState<Record<string, string | number | boolean | null>>({})

  const verarbeitet = !!data.gutachten_ocr_processed_at
  const fehler = data.gutachten_ocr_error
  const istUeberschrieben = !!data.gutachten_ocr_manuell_ueberschrieben

  function startEdit() {
    const initial: Record<string, string | number | boolean | null> = {}
    for (const def of [
      ...KERN_FELDER,
      ...FAHRZEUG_FELDER,
      ...ZUSTAND_FELDER,
      ...REPARATUR_FELDER,
      ...MIETWAGEN_FELDER,
      ...SV_META_FELDER,
    ]) {
      const v = data[def.key]
      initial[def.key as string] =
        v === null || v === undefined
          ? ''
          : (v as string | number | boolean)
    }
    setDraft(initial)
    setEditMode(true)
    setSaved(false)
  }

  function cancelEdit() {
    setEditMode(false)
    setDraft({})
    setError(null)
  }

  function saveEdit() {
    setError(null)
    // Patch nur die Felder zusammenstellen die sich gegenueber data geaendert haben
    const patch: Record<string, string | number | boolean | null> = {}
    for (const [key, val] of Object.entries(draft)) {
      const original = data[key as keyof GutachtenOcrCardData]
      const cleaned = val === '' ? null : val
      const orig = original ?? null
      if (cleaned !== orig) patch[key] = cleaned
    }
    if (Object.keys(patch).length === 0) {
      setEditMode(false)
      return
    }
    startTransition(async () => {
      const res = await updateGutachtenOcrFelder(data.claim_id, data.fall_id, patch)
      if (!res.ok) {
        setError(res.error ?? 'Speichern fehlgeschlagen')
        return
      }
      setEditMode(false)
      setDraft({})
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function rerun() {
    if (!data.auftrag_id) {
      setError('Kein Auftrag mit Gutachten gefunden — Re-Run nicht moeglich.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await reRunGutachtenOcr(data.auftrag_id as string, data.fall_id)
      if (!res.ok) setError(res.error ?? 'OCR-Re-Run fehlgeschlagen')
    })
  }

  return (
    <section className="bg-white border border-claimondo-border rounded-xl p-5 space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <FileText className="w-4 h-4 text-claimondo-shield" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Gutachten-Auswertung</h3>
        <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
          Admin-only · OCR
        </span>
        {istUeberschrieben && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
            manuell editiert
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!editMode && verarbeitet && (
            <button
              type="button"
              onClick={startEdit}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs text-claimondo-navy hover:underline disabled:opacity-40"
            >
              <Pencil className="w-3 h-3" />
              Bearbeiten
            </button>
          )}
          {editMode && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy disabled:opacity-40"
              >
                <X className="w-3 h-3" />
                Abbrechen
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs text-white bg-claimondo-navy hover:bg-claimondo-navy/90 px-2 py-1 rounded-md disabled:opacity-40"
              >
                <Save className="w-3 h-3" />
                {pending ? 'Speichern…' : 'Speichern'}
              </button>
            </>
          )}
          {!editMode && (
            <button
              type="button"
              onClick={rerun}
              disabled={pending || !data.auftrag_id}
              className="inline-flex items-center gap-1 text-xs text-claimondo-navy hover:underline disabled:opacity-40"
              title={!data.auftrag_id ? 'Kein Gutachten — Re-Run nicht moeglich' : 'OCR neu ausfuehren'}
            >
              <RefreshCw className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`} />
              Re-Run
            </button>
          )}
        </div>
      </header>

      {!verarbeitet && (
        <p className="text-xs text-claimondo-ondo">
          Noch keine OCR-Auswertung — wird nach QC-Freigabe automatisch
          generiert.
        </p>
      )}

      {verarbeitet && fehler && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-medium">OCR-Fehler</p>
            <p className="text-amber-800">{fehler}</p>
            <p className="text-amber-800 mt-1">
              Bitte „Re-Run" ausloesen oder Werte manuell ueber „Bearbeiten" nachtragen.
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
          Werte gespeichert.
        </p>
      )}

      {(verarbeitet || editMode) && (
        <>
          {data.totalschaden && !editMode && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-800 border border-red-200">
              Totalschaden
            </div>
          )}

          <ClusterBlock
            titel="Kern"
            felder={KERN_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />
          <ClusterBlock
            titel="Fahrzeug"
            felder={FAHRZEUG_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />
          <ClusterBlock
            titel="Zustand & Vorschaeden"
            felder={ZUSTAND_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />
          <ClusterBlock
            titel="Reparatur-Detail"
            felder={REPARATUR_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />
          <ClusterBlock
            titel="Mietwagen & Nutzungsausfall"
            felder={MIETWAGEN_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />
          <ClusterBlock
            titel="SV-Metadaten"
            felder={SV_META_FELDER}
            data={data}
            editMode={editMode}
            draft={draft}
            setDraft={setDraft}
          />

          <p className="text-[10px] text-claimondo-ondo/70">
            Verarbeitet {formatDate(data.gutachten_ocr_processed_at)}
            {istUeberschrieben && ' · manuell korrigierte Werte werden beim Re-Run geschuetzt'}
          </p>
        </>
      )}
    </section>
  )
}

function ClusterBlock({
  titel,
  felder,
  data,
  editMode,
  draft,
  setDraft,
}: {
  titel: string
  felder: FieldDef[]
  data: GutachtenOcrCardData
  editMode: boolean
  draft: Record<string, string | number | boolean | null>
  setDraft: (
    fn: (
      prev: Record<string, string | number | boolean | null>,
    ) => Record<string, string | number | boolean | null>,
  ) => void
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-1.5">
        {titel}
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {felder.map((def) => (
          <div key={def.key as string} className="contents">
            <dt className="text-claimondo-ondo/80 self-center">{def.label}</dt>
            <dd className="text-claimondo-navy font-medium text-right">
              {editMode ? (
                <FieldInput
                  field={def}
                  value={draft[def.key as string]}
                  onChange={(v) =>
                    setDraft((prev) => ({ ...prev, [def.key as string]: v }))
                  }
                />
              ) : (
                displayValue(def, data[def.key])
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: string | number | boolean | null | undefined
  onChange: (v: string | number | boolean | null) => void
}) {
  const cls =
    'w-full border border-claimondo-border rounded-md px-2 py-1 text-xs text-right focus:outline-none focus:border-claimondo-navy bg-white'

  if (field.typ === 'bool') {
    return (
      <select
        value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'true' ? true : v === 'false' ? false : null)
        }}
        className={cls}
      >
        <option value="">–</option>
        <option value="true">Ja</option>
        <option value="false">Nein</option>
      </select>
    )
  }
  if (field.typ === 'select') {
    return (
      <select
        value={(value as string | null) ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={cls}
      >
        <option value="">–</option>
        {field.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  if (field.typ === 'date') {
    return (
      <input
        type="date"
        value={(value as string | null) ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={cls}
      />
    )
  }
  if (field.typ === 'eur' || field.typ === 'num') {
    return (
      <input
        type="number"
        step="0.01"
        value={value === null || value === undefined || value === '' ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        className={cls}
      />
    )
  }
  if (field.typ === 'int') {
    return (
      <input
        type="number"
        step="1"
        value={value === null || value === undefined || value === '' ? '' : String(value)}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Math.round(Number(e.target.value)))
        }
        className={cls}
      />
    )
  }
  return (
    <input
      type="text"
      value={(value as string | null) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={cls}
    />
  )
}
