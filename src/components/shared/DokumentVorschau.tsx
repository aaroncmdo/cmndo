'use client'
// Shared Dokument-Vorschau-Modal (Task A — kein Caller-Wiring, nur Shell).
// Verbraucher: Kunde-Portal + SV-Portal (spaetere Tasks).
// Benutzt primitives.Modal + primitives.Button — kein handgerolltes Markup.

import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '@/components/primitives/Modal'
import { Button } from '@/components/primitives/Button'
import { erkenneVorschauTyp } from '@/lib/dokumente/vorschau-typ'

// ---------------------------------------------------------------------------
// Prop-Typen
// ---------------------------------------------------------------------------

export interface DokumentVorschauProps {
  open: boolean
  onClose: () => void
  /** Download-/Preview-URL. Null = Vorschau nicht verfuegbar. */
  url: string | null
  /** Anzeige-Name der Datei (Titel des Modals + Alt-Text). */
  dateiname: string
  /** MIME-Typ oder Typ-Slug — optional, verbessert die Typ-Erkennung. */
  typ?: string | null
}

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

export function DokumentVorschau({ open, onClose, url, dateiname, typ }: DokumentVorschauProps) {
  const vorschauTyp = erkenneVorschauTyp(url, typ)

  function oeffneInTab() {
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={900}
      ariaLabel={`Vorschau: ${dateiname}`}
      noPadding={false}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3 pr-8">
        <h2 className="text-heading-sm font-semibold text-claimondo-navy break-all">
          {dateiname}
        </h2>
        {url && (
          <Button
            variant="ghost"
            size="sm"
            onClick={oeffneInTab}
            ariaLabel="Im neuen Tab öffnen"
            className="shrink-0"
          >
            Öffnen
          </Button>
        )}
      </div>

      {/* Body */}
      <VorschauBody url={url} dateiname={dateiname} vorschauTyp={vorschauTyp} oeffneInTab={oeffneInTab} />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Body je Typ
// ---------------------------------------------------------------------------

interface VorschauBodyProps {
  url: string | null
  dateiname: string
  vorschauTyp: 'pdf' | 'bild' | 'andere'
  oeffneInTab: () => void
}

function VorschauBody({ url, dateiname, vorschauTyp, oeffneInTab }: VorschauBodyProps) {
  if (!url) {
    return <NichtVerfuegbarHinweis zeigeButton={false} oeffneInTab={oeffneInTab} />
  }

  if (vorschauTyp === 'pdf') {
    return (
      <iframe
        src={url}
        className="h-[70vh] w-full rounded-ios-md border border-claimondo-border"
        title={dateiname}
      />
    )
  }

  if (vorschauTyp === 'bild') {
    return (
      <div className="flex items-center justify-center rounded-ios-md border border-claimondo-border bg-claimondo-bg p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={dateiname}
          className="mx-auto max-h-[70vh] object-contain"
        />
      </div>
    )
  }

  // 'andere'
  return <NichtVerfuegbarHinweis zeigeButton oeffneInTab={oeffneInTab} />
}

// ---------------------------------------------------------------------------
// Fallback-Hinweis
// ---------------------------------------------------------------------------

interface NichtVerfuegbarHinweisProps {
  zeigeButton: boolean
  oeffneInTab: () => void
}

function NichtVerfuegbarHinweis({ zeigeButton, oeffneInTab }: NichtVerfuegbarHinweisProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-body text-claimondo-secondary">
        Diese Datei kann nicht direkt in der Vorschau angezeigt werden.
      </p>
      {zeigeButton && (
        <Button variant="navy" size="md" onClick={oeffneInTab}>
          Im neuen Tab öffnen
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Convenience-Hook (DRY-Verdrahtung fuer spaetere Caller)
// ---------------------------------------------------------------------------

export interface DokumentVorschauDoc {
  url: string | null
  dateiname: string
  typ?: string | null
}

export interface UseDokumentVorschauReturn {
  /** Dokument-Vorschau oeffnen. */
  oeffnen: (doc: DokumentVorschauDoc) => void
  /** Modal schliessen. */
  schliessen: () => void
  /** Gerenderte Modal-Komponente — einfach irgendwo ins JSX einfuegen. */
  modal: ReactNode
}

export function useDokumentVorschau(): UseDokumentVorschauReturn {
  const [state, setState] = useState<{ open: boolean; doc: DokumentVorschauDoc }>({
    open: false,
    doc: { url: null, dateiname: '' },
  })

  const oeffnen = useCallback((doc: DokumentVorschauDoc) => {
    setState({ open: true, doc })
  }, [])

  const schliessen = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }))
  }, [])

  const modal = (
    <DokumentVorschau
      open={state.open}
      onClose={schliessen}
      url={state.doc.url}
      dateiname={state.doc.dateiname}
      typ={state.doc.typ}
    />
  )

  return { oeffnen, schliessen, modal }
}
