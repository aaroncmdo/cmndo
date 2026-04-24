// AAR-727: Shared raw-file Dokument-Liste — read-only Download-Ansicht.
//
// Portal-übergreifend (Kunde/Makler) dupliziert war die Darstellung einer
// Liste von `fall_dokumente`-Rohdateien mit Download-Link. SV/Admin nutzen
// weiter die Slot-basierte `DokumentenListe` (Pflicht-Katalog × Upload-
// Status) — diese Komponente hier rendert NUR hochgeladene Dateien in
// zwei Varianten:
//   - `list` (Kunde): kompakte Rows mit Icon + Name + Datum
//   - `grid` (Makler): 3-spaltiges Card-Grid mit Größe/MIME-Typ + Download-Button
//
// Alle Farben/Radien über Claimondo-Tokens + iOS-Radius — keine Hex-Literale.

import { FileTextIcon, FileIcon, ImageIcon, DownloadIcon } from 'lucide-react'
import { Card } from '@/components/primitives'

export type DokumentItem = {
  id: string
  /** Anzeige-Name (original_filename oder Fallback auf dokument_typ). */
  name: string
  /** Download-URL. `null` bedeutet „kein Zugriff" (Makler-Consent-Lücke o. ä.). */
  url: string | null
  /** Optionaler Typ-Slug (z. B. „gutachten", „anschlussschreiben"). */
  typ?: string | null
  /** MIME für Icon-Auswahl (image vs file). */
  mimeType?: string | null
  /** Dateigröße in Bytes. */
  groesseBytes?: number | null
  /** ISO-Timestamp (hochgeladen_am / created_at). */
  createdAt?: string | null
}

export type DokumenteDownloadListeVariant = 'list' | 'grid'

export interface DokumenteDownloadListeProps {
  dokumente: DokumentItem[]
  variant: DokumenteDownloadListeVariant
  /** Für Empty-State. Defaults sind generisch. */
  emptyTitle?: string
  emptyDescription?: string
  /** Rolle optional mitgegeben — aktuell nur für aria-label, reserviert für spätere Actions. */
  rolle?: 'admin' | 'kb' | 'sv' | 'kunde' | 'makler'
  className?: string
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function pickIcon(mimeType: string | null | undefined, typ: string | null | undefined) {
  if (mimeType?.startsWith('image/')) return ImageIcon
  if (typ && /foto|bild|image/i.test(typ)) return ImageIcon
  if (typ && /(gutachten|anschluss|regulierung|vollmacht|vertrag|sa|pdf)/i.test(typ))
    return FileTextIcon
  return FileIcon
}

function EmptyState({
  title,
  description,
  compact,
}: {
  title: string
  description?: string
  compact: boolean
}) {
  if (compact) {
    return <p className="text-sm text-claimondo-ondo/70">{title}</p>
  }
  return (
    <Card p={10}>
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-ondo mb-3">
          <FileTextIcon className="w-5 h-5" />
        </div>
        <h2 className="text-base font-semibold text-claimondo-navy mb-1">{title}</h2>
        {description && <p className="text-sm text-claimondo-ondo">{description}</p>}
      </div>
    </Card>
  )
}

export default function DokumenteDownloadListe({
  dokumente,
  variant,
  emptyTitle = 'Keine Dokumente',
  emptyDescription,
  rolle,
  className = '',
}: DokumenteDownloadListeProps) {
  if (dokumente.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        compact={variant === 'list'}
      />
    )
  }

  if (variant === 'grid') {
    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}
        data-rolle={rolle}
      >
        {dokumente.map((d) => {
          const Icon = pickIcon(d.mimeType, d.typ)
          const size = formatSize(d.groesseBytes)
          return (
            <Card key={d.id} p={4}>
              <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-claimondo-bg flex items-center justify-center text-claimondo-ondo">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">
                    {d.name}
                  </p>
                  {(d.typ || size) && (
                    <p className="text-xs text-claimondo-ondo mt-0.5">
                      {d.typ ?? ''}
                      {d.typ && size ? ' · ' : ''}
                      {size ?? ''}
                    </p>
                  )}
                  {d.createdAt && (
                    <p className="text-[11px] text-claimondo-ondo mt-0.5">
                      {formatDate(d.createdAt)}
                    </p>
                  )}
                </div>
              </div>
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-claimondo-navy text-white text-xs font-medium hover:bg-claimondo-shield transition-colors"
                >
                  <DownloadIcon className="w-3.5 h-3.5" />
                  Herunterladen
                </a>
              ) : (
                <span className="text-xs text-claimondo-ondo text-center py-2">
                  Kein Zugriff
                </span>
              )}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  // variant === 'list'
  return (
    <div className={`space-y-2 ${className}`} data-rolle={rolle}>
      {dokumente.map((d) => {
        const Icon = pickIcon(d.mimeType, d.typ)
        return d.url ? (
          <a
            key={d.id}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#f8f9fb] hover:bg-[#f8f9fb] transition-colors"
          >
            <Icon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            <span className="text-sm text-claimondo-navy truncate flex-1">{d.name}</span>
            {d.createdAt && (
              <span className="text-[10px] text-claimondo-ondo/70">{formatDate(d.createdAt)}</span>
            )}
          </a>
        ) : (
          <div
            key={d.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#f8f9fb] opacity-60"
          >
            <Icon className="w-4 h-4 text-claimondo-ondo shrink-0" />
            <span className="text-sm text-claimondo-navy truncate flex-1">{d.name}</span>
            <span className="text-[10px] text-claimondo-ondo/70">Kein Zugriff</span>
          </div>
        )
      })}
    </div>
  )
}
