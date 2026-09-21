'use client'

// Unterschriftsfeld-Editor für SV-Dokumente (Aaron 20.09.2026: „das Unterschriftsfeld muss
// gesetzt werden"). Geteilt von Basic-Wizard, Nachweise-Seite, bezahltem Wizard und Admin-Akte.
//
// Vorschau per Browser-PDF-Embed (iframe) — derselbe Weg wie der Admin-Klick-Editor unter
// /admin/vertraege; das Repo hat bewusst kein pdf.js. Koordinaten in PDF-Punkten, Ursprung
// unten links (pdf-lib). Der Klick setzt die MITTE des Feldes; Datum und Name sind optional
// und werden an ihrer Klickposition als Textanfang gesetzt (Annahme A3 im Soll-Blatt).
//
// ⚠ Auf Mobilgeräten (iOS Safari) rendert ein PDF-iframe schlecht — der Editor sagt das und
// empfiehlt den Desktop; das Setzen bleibt möglich.

import { useState } from 'react'
import { MousePointerClickIcon, CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import type { PdfMasse, SignaturKonfig } from '@/lib/sv/unterschriftsfeld'

type Ziel = 'unterschrift' | 'datum' | 'name'

const DEFAULT_BREITE = 180
const DEFAULT_HOEHE = 60

export type UnterschriftsfeldEditorProps = {
  pdfUrl: string
  masse: PdfMasse
  slotLabel: string
  initial?: Partial<SignaturKonfig> | null
  onSpeichern: (konfig: SignaturKonfig) => Promise<{ ok: true } | { ok: false; error: string }>
  onAbbrechen?: () => void
  /** Text auf dem Speichern-Knopf (Wizard: „Unterschriftsfeld speichern"). */
  speichernLabel?: string
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

export function UnterschriftsfeldEditor({
  pdfUrl,
  masse,
  slotLabel,
  initial,
  onSpeichern,
  onAbbrechen,
  speichernLabel = 'Unterschriftsfeld speichern',
}: UnterschriftsfeldEditorProps) {
  const [page, setPage] = useState(clamp(initial?.page ?? 0, 0, Math.max(0, masse.seiten - 1)))
  const [feld, setFeld] = useState<{ x: number; y: number; width: number; height: number } | null>(
    initial && typeof initial.x === 'number' && typeof initial.y === 'number'
      ? { x: initial.x, y: initial.y, width: initial.width ?? DEFAULT_BREITE, height: initial.height ?? DEFAULT_HOEHE }
      : null,
  )
  const [datum, setDatum] = useState<{ x: number; y: number } | null>(
    typeof initial?.datum_x === 'number' && typeof initial?.datum_y === 'number' ? { x: initial.datum_x, y: initial.datum_y } : null,
  )
  const [name, setName] = useState<{ x: number; y: number } | null>(
    typeof initial?.name_x === 'number' && typeof initial?.name_y === 'number' ? { x: initial.name_x, y: initial.name_y } : null,
  )
  const [ziel, setZiel] = useState<Ziel>('unterschrift')
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gespeichert, setGespeichert] = useState(false)

  const breite = feld?.width ?? DEFAULT_BREITE
  const hoehe = feld?.height ?? DEFAULT_HOEHE

  function aufKlick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const xPdf = ((e.clientX - rect.left) / rect.width) * masse.breite
    const yPdf = masse.hoehe - ((e.clientY - rect.top) / rect.height) * masse.hoehe
    setGespeichert(false)
    setFehler(null)
    if (ziel === 'unterschrift') {
      setFeld({
        x: Math.round(clamp(xPdf - breite / 2, 0, masse.breite - breite)),
        y: Math.round(clamp(yPdf - hoehe / 2, 0, masse.hoehe - hoehe)),
        width: breite,
        height: hoehe,
      })
    } else if (ziel === 'datum') {
      setDatum({ x: Math.round(clamp(xPdf, 0, masse.breite)), y: Math.round(clamp(yPdf, 0, masse.hoehe)) })
    } else {
      setName({ x: Math.round(clamp(xPdf, 0, masse.breite)), y: Math.round(clamp(yPdf, 0, masse.hoehe)) })
    }
  }

  function groesse(w: number, h: number) {
    const nw = clamp(Math.round(w), 60, Math.round(masse.breite))
    const nh = clamp(Math.round(h), 24, Math.round(masse.hoehe))
    setFeld((prev) => {
      const base = prev ?? { x: 60, y: 100, width: nw, height: nh }
      return {
        x: Math.round(clamp(base.x, 0, masse.breite - nw)),
        y: Math.round(clamp(base.y, 0, masse.hoehe - nh)),
        width: nw,
        height: nh,
      }
    })
  }

  async function speichern() {
    if (!feld) {
      setFehler('Bitte klicken Sie zuerst auf die Stelle, an der Ihr Kunde unterschreibt.')
      return
    }
    setSpeichert(true)
    setFehler(null)
    try {
      const res = await onSpeichern({
        page,
        x: feld.x,
        y: feld.y,
        width: feld.width,
        height: feld.height,
        ...(datum ? { datum_x: datum.x, datum_y: datum.y } : {}),
        ...(name ? { name_x: name.x, name_y: name.y } : {}),
      })
      if (!res.ok) setFehler(res.error)
      else setGespeichert(true)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  // Prozentwerte fürs Overlay (CSS: links/oben; PDF: links/unten).
  const pct = (v: number, ganz: number) => `${(v / ganz) * 100}%`
  const feldStyle = feld
    ? {
        left: pct(feld.x, masse.breite),
        top: pct(masse.hoehe - feld.y - feld.height, masse.hoehe),
        width: pct(feld.width, masse.breite),
        height: pct(feld.height, masse.hoehe),
      }
    : null

  return (
    <div className="space-y-3" data-testid="unterschriftsfeld-editor">
      <div className="flex items-start gap-2 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy">
        <MousePointerClickIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden="true" />
        <div>
          <p className="font-semibold">Wo unterschreibt Ihr Kunde auf „{slotLabel}&ldquo;?</p>
          <p className="text-xs text-claimondo-ondo">
            Klicken Sie auf die Stelle im Dokument. Das Feld lässt sich danach in der Größe anpassen; Datum und Name sind optional.
            <span className="lg:hidden"> Am besten am Computer — auf dem Handy wird die Vorschau oft nicht angezeigt.</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-claimondo-ondo">Setzen:</span>
        <Button size="sm" variant={ziel === 'unterschrift' ? 'navy' : 'ghost'} onClick={() => setZiel('unterschrift')}>Unterschrift</Button>
        <Button size="sm" variant={ziel === 'datum' ? 'navy' : 'ghost'} onClick={() => setZiel('datum')}>Datum (optional)</Button>
        <Button size="sm" variant={ziel === 'name' ? 'navy' : 'ghost'} onClick={() => setZiel('name')}>Name (optional)</Button>
        {masse.seiten > 1 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-claimondo-navy">
            <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Vorherige Seite">
              <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
            Seite {page + 1} von {masse.seiten}
            <Button size="icon" variant="ghost" disabled={page >= masse.seiten - 1} onClick={() => setPage((p) => Math.min(masse.seiten - 1, p + 1))} aria-label="Nächste Seite">
              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-ios-lg border border-claimondo-border bg-white"
        style={{ aspectRatio: `${masse.breite} / ${masse.hoehe}` }}
      >
        <iframe
          key={`${pdfUrl}#${page}`}
          title={`Vorschau ${slotLabel}`}
          src={`${pdfUrl}#page=${page + 1}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Position im Dokument setzen"
          className="absolute inset-0 cursor-crosshair"
          onClick={aufKlick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setFeld((prev) => prev ?? { x: 60, y: 100, width: breite, height: hoehe })
            }
          }}
          data-testid="unterschriftsfeld-overlay"
        >
          {feldStyle && (
            <div
              className="absolute flex items-center justify-center border-2 border-dashed border-claimondo-ondo bg-claimondo-ondo/10 text-[10px] font-semibold uppercase tracking-wide text-claimondo-navy"
              style={feldStyle}
              data-testid="unterschriftsfeld-box"
            >
              Unterschrift
            </div>
          )}
          {datum && (
            <span
              className="absolute -translate-y-full rounded-ios-sm bg-claimondo-navy px-1 text-[10px] text-white"
              style={{ left: pct(datum.x, masse.breite), top: pct(masse.hoehe - datum.y, masse.hoehe) }}
            >
              Datum
            </span>
          )}
          {name && (
            <span
              className="absolute -translate-y-full rounded-ios-sm bg-claimondo-navy px-1 text-[10px] text-white"
              style={{ left: pct(name.x, masse.breite), top: pct(masse.hoehe - name.y, masse.hoehe) }}
            >
              Name
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-claimondo-ondo">
          Breite
          <input
            type="number"
            min={60}
            max={Math.round(masse.breite)}
            value={breite}
            onChange={(e) => groesse(Number(e.target.value) || DEFAULT_BREITE, hoehe)}
            className="mt-1 w-24 rounded-ios-sm border border-claimondo-border bg-white px-2 py-1 text-sm text-claimondo-navy"
          />
        </label>
        <label className="flex flex-col text-xs text-claimondo-ondo">
          Höhe
          <input
            type="number"
            min={24}
            max={Math.round(masse.hoehe)}
            value={hoehe}
            onChange={(e) => groesse(breite, Number(e.target.value) || DEFAULT_HOEHE)}
            className="mt-1 w-24 rounded-ios-sm border border-claimondo-border bg-white px-2 py-1 text-sm text-claimondo-navy"
          />
        </label>
        <span className="text-xs text-claimondo-ondo">
          {feld ? `Feld auf Seite ${page + 1} gesetzt` : 'Noch kein Feld gesetzt'}
        </span>
      </div>

      {fehler && (
        <p className="rounded-ios-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong" role="alert">
          {fehler}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="navy" loading={speichert} disabled={!feld} onClick={speichern}>
          {gespeichert ? (
            <>
              <CheckCircle2Icon className="mr-1.5 h-4 w-4" aria-hidden="true" /> Gespeichert
            </>
          ) : (
            speichernLabel
          )}
        </Button>
        {onAbbrechen && (
          <Button variant="ghost" disabled={speichert} onClick={onAbbrechen}>
            Später setzen
          </Button>
        )}
      </div>
    </div>
  )
}
