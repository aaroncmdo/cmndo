'use client'

// Aaron 2026-04-30: Vertragseditor-Client. Pro Slot eine Card mit:
//  - Aktuelles PDF (signed-URL Embed)
//  - Klickbares Overlay zum Setzen der Unterschriftsposition
//  - Upload neue Version
//  - Save-Button für Konfig

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  UploadIcon,
  Loader2Icon,
  SaveIcon,
  RefreshCwIcon,
  FileTextIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import {
  uploadVertragPdf,
  saveVertragsKonfig,
  listVertragsVorlagen,
  type SlotId,
  type VorlageEntry,
  type VertragsKonfig,
  type SvOption,
} from './actions'

const SLOT_LABEL: Record<SlotId, string> = {
  sicherungsabtretung: 'Sicherungsabtretung',
  honorarvereinbarung: 'Honorarvereinbarung',
  datenschutzerklaerung: 'Datenschutzerklärung',
  widerrufsbelehrung: 'Widerrufsbelehrung',
}

const SLOT_ORDER: SlotId[] = [
  'sicherungsabtretung',
  'honorarvereinbarung',
  'datenschutzerklaerung',
  'widerrufsbelehrung',
]

// Standard-A4 wenn wir die echten Maße nicht kennen
const DEFAULT_PDF_WIDTH = 595
const DEFAULT_PDF_HEIGHT = 842

type Props = {
  initialVorlagen: VorlageEntry[]
  loadError: string | null
  svs: SvOption[]
}

export default function VertragseditorClient({
  initialVorlagen,
  loadError,
  svs,
}: Props) {
  const [svId, setSvId] = useState<string | null>(null)
  const [vorlagen, setVorlagen] = useState<VorlageEntry[]>(initialVorlagen)
  const [loading, setLoading] = useState(false)
  const byId = new Map(vorlagen.map((v) => [v.slotId, v]))

  async function refresh(targetSvId: string | null = svId) {
    setLoading(true)
    const r = await listVertragsVorlagen(targetSvId)
    if (r.ok) setVorlagen(r.vorlagen)
    setLoading(false)
  }

  async function onSvChange(next: string | null) {
    setSvId(next)
    await refresh(next)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {loadError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {loadError}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-claimondo-navy">
          Vorlage für:
        </label>
        <select
          value={svId ?? ''}
          onChange={(e) => onSvChange(e.target.value || null)}
          className="px-3 py-1.5 text-xs border border-claimondo-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
        >
          <option value="">Default (alle SVs ohne eigene Vorlage)</option>
          {svs.map((sv) => (
            <option key={sv.id} value={sv.id}>
              {sv.label}
            </option>
          ))}
        </select>
        {loading && (
          <span className="text-[11px] text-claimondo-ondo">lädt …</span>
        )}
      </div>
      <p className="text-xs text-claimondo-ondo">
        {svId
          ? 'SV-spezifische Vorlage. Wenn nichts hochgeladen ist, fällt der Fall-Anlage-Flow auf die Default-Vorlage zurück.'
          : 'Default-Vorlage — gilt für alle SVs ohne eigene Konfig. Klick auf das PDF setzt die Position für Unterschrift, Datum und Name.'}
      </p>
      {SLOT_ORDER.map((slotId) => (
        <SlotCard
          key={`${slotId}-${svId ?? 'default'}`}
          slotId={slotId}
          svId={svId}
          entry={byId.get(slotId) ?? null}
          onChanged={() => refresh()}
        />
      ))}
    </div>
  )
}

function SlotCard({
  slotId,
  svId,
  entry,
  onChanged,
}: {
  slotId: SlotId
  svId: string | null
  entry: VorlageEntry | null
  onChanged: () => void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Lokaler Editor-State pro Slot
  const [localPath, setLocalPath] = useState<string | null>(entry?.storage_path ?? null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(entry?.signed_url ?? null)
  const [pdfSize, setPdfSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_PDF_WIDTH,
    height: DEFAULT_PDF_HEIGHT,
  })
  const [konfig, setKonfig] = useState<VertragsKonfig>(
    entry?.konfig ?? {
      page: 0,
      x: 60,
      y: 100,
      width: 180,
      height: 60,
      datum_x: 60,
      datum_y: 180,
      name_x: 60,
      name_y: 75,
    },
  )
  const [target, setTarget] = useState<'unterschrift' | 'datum' | 'name'>('unterschrift')

  useEffect(() => {
    setLocalPath(entry?.storage_path ?? null)
    setPdfUrl(entry?.signed_url ?? null)
    if (entry?.konfig) setKonfig(entry.konfig)
  }, [entry?.storage_path, entry?.signed_url, entry?.konfig])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setSaved(false)
    const fd = new FormData()
    fd.append('datei', f)
    startTransition(async () => {
      const res = await uploadVertragPdf(slotId, svId, fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setLocalPath(res.storage_path)
      setPdfSize(res.first_page_size)
      // Neu laden um signed URL zu bekommen
      await onChanged()
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  function onPdfClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!localPath) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xPx = e.clientX - rect.left
    const yPx = e.clientY - rect.top
    // Px → PDF-Punkte (PDFs starten Y unten, HTML oben)
    const scaleX = pdfSize.width / rect.width
    const scaleY = pdfSize.height / rect.height
    const xPdf = Math.round(xPx * scaleX)
    const yPdf = Math.round(pdfSize.height - yPx * scaleY)

    setKonfig((prev) => {
      if (target === 'unterschrift') return { ...prev, x: xPdf, y: yPdf }
      if (target === 'datum') return { ...prev, datum_x: xPdf, datum_y: yPdf }
      return { ...prev, name_x: xPdf, name_y: yPdf }
    })
    setSaved(false)
  }

  function speichern() {
    if (!localPath) return
    setError(null)
    startTransition(async () => {
      const res = await saveVertragsKonfig(localPath, konfig)
      if (!res.ok) {
        setError(res.error ?? 'Speichern fehlgeschlagen')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  // Position-Marker für Overlay
  const aspect = pdfSize.height / pdfSize.width
  // Für Marker: PDF-Y in HTML-Y umkehren
  function pctTop(yPdf: number) {
    return `${((pdfSize.height - yPdf) / pdfSize.height) * 100}%`
  }
  function pctLeft(xPdf: number) {
    return `${(xPdf / pdfSize.width) * 100}%`
  }

  return (
    <section className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border bg-[#f8f9fb]">
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-4 h-4 text-claimondo-navy" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            {SLOT_LABEL[slotId]}
          </h2>
          {entry && (
            <>
              <span className="text-[10px] text-claimondo-ondo">
                · v{new Date(entry.ts).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  entry.quelle === 'sv'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : entry.quelle === 'legacy'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-[#f8f9fb] text-claimondo-ondo border border-claimondo-border'
                }`}
              >
                {entry.quelle === 'sv'
                  ? 'SV-eigen'
                  : entry.quelle === 'legacy'
                    ? 'Legacy'
                    : 'Default'}
              </span>
            </>
          )}
          {!entry && svId && (
            <span className="text-[10px] text-claimondo-ondo">
              · keine SV-Vorlage — Default greift
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-claimondo-border text-claimondo-navy hover:bg-white disabled:opacity-40"
          >
            {pending ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadIcon className="w-3.5 h-3.5" />
            )}
            {entry ? 'Neue Version' : 'PDF hochladen'}
          </button>
        </div>
      </header>

      {!localPath || !pdfUrl ? (
        <div className="px-4 py-8 text-xs text-claimondo-ondo text-center">
          Noch keine Vorlage hochgeladen.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-0">
          <div className="p-4 border-b md:border-b-0 md:border-r border-claimondo-border">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-claimondo-ondo/70">
                Position setzen für:
              </span>
              {(['unterschrift', 'datum', 'name'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTarget(t)}
                  className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                    target === t
                      ? 'bg-claimondo-navy text-white border-claimondo-navy'
                      : 'bg-white text-claimondo-ondo border-claimondo-border hover:bg-[#f8f9fb]'
                  }`}
                >
                  {t}
                </button>
              ))}
              <span className="text-[10px] text-claimondo-ondo/70 ml-auto">
                Klick auf das PDF setzt die Marke
              </span>
            </div>

            <div
              className="relative w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg overflow-hidden cursor-crosshair"
              style={{ aspectRatio: `${pdfSize.width} / ${pdfSize.height}` }}
              onClick={onPdfClick}
            >
              {/* PDF im iframe — pointer-events:none lassen damit Klicks aufs Overlay gehen */}
              <iframe
                src={`${pdfUrl}#page=${konfig.page + 1}&toolbar=0&navpanes=0`}
                className="absolute inset-0 w-full h-full pointer-events-none"
                title="PDF Vorschau"
              />
              {/* Marker */}
              <Marker
                color="bg-rose-500"
                label="U"
                top={pctTop(konfig.y)}
                left={pctLeft(konfig.x)}
                tooltip={`Unterschrift (${konfig.x}/${konfig.y})`}
              />
              {konfig.datum_x != null && konfig.datum_y != null && (
                <Marker
                  color="bg-amber-500"
                  label="D"
                  top={pctTop(konfig.datum_y)}
                  left={pctLeft(konfig.datum_x)}
                  tooltip={`Datum (${konfig.datum_x}/${konfig.datum_y})`}
                />
              )}
              {konfig.name_x != null && konfig.name_y != null && (
                <Marker
                  color="bg-emerald-500"
                  label="N"
                  top={pctTop(konfig.name_y)}
                  left={pctLeft(konfig.name_x)}
                  tooltip={`Name (${konfig.name_x}/${konfig.name_y})`}
                />
              )}
            </div>
          </div>

          <aside className="p-4 space-y-3">
            <PositionFields
              label="Unterschrift"
              x={konfig.x}
              y={konfig.y}
              widthVal={konfig.width}
              heightVal={konfig.height}
              onChange={(x, y, w, h) =>
                setKonfig((prev) => ({ ...prev, x, y, width: w ?? prev.width, height: h ?? prev.height }))
              }
            />
            <PositionFields
              label="Datum"
              x={konfig.datum_x ?? 60}
              y={konfig.datum_y ?? 180}
              onChange={(x, y) => setKonfig((prev) => ({ ...prev, datum_x: x, datum_y: y }))}
            />
            <PositionFields
              label="Name"
              x={konfig.name_x ?? 60}
              y={konfig.name_y ?? 75}
              onChange={(x, y) => setKonfig((prev) => ({ ...prev, name_x: x, name_y: y }))}
            />
            <div className="pt-2 border-t border-claimondo-border space-y-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
                  Seite (0 = erste)
                </span>
                <input
                  type="number"
                  min={0}
                  value={konfig.page}
                  onChange={(e) =>
                    setKonfig((prev) => ({ ...prev, page: Number(e.target.value) || 0 }))
                  }
                  className="w-full mt-1 px-2 py-1 text-xs border border-claimondo-border rounded-md focus:outline-none focus:ring-1 focus:ring-claimondo-navy"
                />
              </label>
              <button
                type="button"
                onClick={speichern}
                disabled={pending || !localPath}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-claimondo-navy text-white hover:bg-[#4573A2] disabled:opacity-40"
              >
                {pending ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : saved ? (
                  <CheckCircle2Icon className="w-3.5 h-3.5" />
                ) : (
                  <SaveIcon className="w-3.5 h-3.5" />
                )}
                {saved ? 'Gespeichert' : 'Position speichern'}
              </button>
              <button
                type="button"
                onClick={onChanged}
                className="w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] text-claimondo-ondo hover:text-claimondo-navy"
              >
                <RefreshCwIcon className="w-3 h-3" /> Neu laden
              </button>
            </div>
          </aside>
        </div>
      )}

      {error && (
        <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
          {error}
        </p>
      )}
    </section>
  )
}

function Marker({
  color,
  label,
  top,
  left,
  tooltip,
}: {
  color: string
  label: string
  top: string
  left: string
  tooltip: string
}) {
  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${color} text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md ring-2 ring-white pointer-events-none`}
      style={{ top, left }}
      title={tooltip}
    >
      {label}
    </div>
  )
}

function PositionFields({
  label,
  x,
  y,
  widthVal,
  heightVal,
  onChange,
}: {
  label: string
  x: number
  y: number
  widthVal?: number
  heightVal?: number
  onChange: (x: number, y: number, width?: number, height?: number) => void
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mb-1">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1">
        <input
          type="number"
          value={x}
          onChange={(e) => onChange(Number(e.target.value) || 0, y, widthVal, heightVal)}
          className="px-2 py-1 text-xs border border-claimondo-border rounded-md focus:outline-none"
          placeholder="x"
        />
        <input
          type="number"
          value={y}
          onChange={(e) => onChange(x, Number(e.target.value) || 0, widthVal, heightVal)}
          className="px-2 py-1 text-xs border border-claimondo-border rounded-md focus:outline-none"
          placeholder="y"
        />
        {widthVal != null && (
          <>
            <input
              type="number"
              value={widthVal}
              onChange={(e) =>
                onChange(x, y, Number(e.target.value) || 0, heightVal)
              }
              className="px-2 py-1 text-xs border border-claimondo-border rounded-md focus:outline-none"
              placeholder="w"
            />
            <input
              type="number"
              value={heightVal ?? 60}
              onChange={(e) =>
                onChange(x, y, widthVal, Number(e.target.value) || 0)
              }
              className="px-2 py-1 text-xs border border-claimondo-border rounded-md focus:outline-none"
              placeholder="h"
            />
          </>
        )}
      </div>
    </div>
  )
}
