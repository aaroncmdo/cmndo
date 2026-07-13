'use client'

// AAR-kanzlei-portal PR 3: Drawer von rechts mit Liste aller Dokumente
// des Falls. Lädt aus fall_dokumente — RLS in Migration 20260421151144
// erlaubt SELECT für Rolle kanzlei auf komplett-Pakete.
//
// Kanzlei-Paket wird als erster Block hervorgehoben (wenn vorhanden) —
// alle anderen Dokumente chronologisch danach. Kein ZIP-Bundle, kein
// Streaming — plain file per Link, wie von Aaron gewünscht.
//
// Storage-RLS-Rest: Liste + Download-URLs kommen aus der Server-Action
// `listFallDokumenteMitUrls`. Der Browser kann private Buckets nicht
// signieren (createSignedUrl -> null), und der Service-Client darf nicht in
// den Browser. Die Action haelt den Read auf dem User-Client (RLS-Gate:
// Migration 20260421151144 limitiert kanzlei auf service_typ='komplett')
// und signiert nur mit dem Service-Client.

import { useEffect, useState } from 'react'
import { XIcon, FileTextIcon, DownloadIcon, FileIcon } from 'lucide-react'
import { Drawer } from '@/components/primitives/Drawer'
import { listFallDokumenteMitUrls } from '@/lib/dokumente/fall-dokumente-urls'

type FallDokument = {
  id: string
  dokument_typ: string | null
  kategorie: string | null
  storage_path: string | null
  original_filename: string | null
  mime_type: string | null
  groesse_bytes: number | null
  hochgeladen_am: string | null
  beschreibung: string | null
}

const DOKUMENT_TYP_LABEL: Record<string, string> = {
  kanzlei_paket: 'Kanzlei-Paket',
  kanzlei: 'Kanzlei-Paket',
  gutachten: 'Gutachten',
  fahrzeugschein: 'Fahrzeugschein (ZB1)',
  polizeibericht: 'Polizeibericht',
  schadensfotos: 'Unfallfoto',
  unfallfoto: 'Unfallfoto',
  sa_pdf: 'Schadenaufnahme (SA)',
  anschlussschreiben: 'Anschlussschreiben',
  vollmacht: 'Vollmacht',
  'kunde-nachreichung': 'Kunden-Nachreichung',
  sonstiges: 'Sonstiges',
}

function fileLabel(d: FallDokument): string {
  if (d.original_filename) return d.original_filename
  const key = d.dokument_typ ?? d.kategorie ?? ''
  return DOKUMENT_TYP_LABEL[key] ?? key ?? 'Dokument'
}

function typLabel(d: FallDokument): string {
  const key = d.dokument_typ ?? d.kategorie ?? ''
  return DOKUMENT_TYP_LABEL[key] ?? key ?? 'Sonstiges'
}

function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isKanzleiPaket(d: FallDokument): boolean {
  const key = (d.dokument_typ ?? d.kategorie ?? '').toLowerCase()
  return key === 'kanzlei_paket' || key === 'kanzlei'
}

export default function DokumenteDrawer({
  fallId,
  fallNummer,
  kunde,
  onClose,
}: {
  fallId: string
  fallNummer: string
  kunde: string
  onClose: () => void
}) {
  const [dokumente, setDokumente] = useState<FallDokument[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bucketPublicUrls, setBucketPublicUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Rows + signierte URLs in einem Server-Roundtrip (RLS-gescopter Read,
      // Service-Client nur zum Signieren — siehe fall-dokumente-urls.ts).
      const res = await listFallDokumenteMitUrls(fallId)
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDokumente(res.dokumente)
      const urls: Record<string, string> = {}
      res.dokumente.forEach((d) => {
        if (d.url) urls[d.id] = d.url
      })
      setBucketPublicUrls(urls)
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      cancelled = true
    }
  }, [fallId])

  const kanzleiPaket = dokumente?.find(isKanzleiPaket) ?? null
  const andereDokumente = dokumente?.filter((d) => !isKanzleiPaket(d)) ?? []

  return (
    <Drawer open onClose={onClose} width={448} noPadding hideCloseButton ariaLabel="Dokumente">
      <div className="flex flex-col h-full">
        <header className="px-5 py-4 border-b border-claimondo-border flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
              Dokumente
            </p>
            <p className="text-sm font-mono text-claimondo-ondo mt-0.5">{fallNummer}</p>
            <p className="text-xs text-claimondo-ondo truncate">{kunde}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-claimondo-bg text-claimondo-ondo shrink-0"
            aria-label="Schließen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-ios-lg bg-danger-soft border border-danger/30 p-3 text-xs text-danger-strong">
              Fehler beim Laden: {error}
            </div>
          )}

          {dokumente === null && !error && (
            <p className="text-sm text-claimondo-ondo/70 italic">Lade Dokumente …</p>
          )}

          {dokumente && dokumente.length === 0 && (
            <p className="text-sm text-claimondo-ondo italic">
              Noch keine Dokumente im Fall. Sobald Claimondo das Kanzlei-Paket
              erstellt, erscheint es hier.
            </p>
          )}

          {kanzleiPaket && (
            <section>
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium mb-2">
                Kanzlei-Paket
              </p>
              <DokumentRow
                dokument={kanzleiPaket}
                publicUrl={bucketPublicUrls[kanzleiPaket.id] ?? null}
                highlight
              />
            </section>
          )}

          {andereDokumente.length > 0 && (
            <section>
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium mb-2">
                Alle Dokumente ({andereDokumente.length})
              </p>
              <div className="space-y-2">
                {andereDokumente.map((d) => (
                  <DokumentRow
                    key={d.id}
                    dokument={d}
                    publicUrl={bucketPublicUrls[d.id] ?? null}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Drawer>
  )
}

function DokumentRow({
  dokument,
  publicUrl,
  highlight,
}: {
  dokument: FallDokument
  publicUrl: string | null
  highlight?: boolean
}) {
  const name = fileLabel(dokument)
  const typ = typLabel(dokument)
  const size = formatBytes(dokument.groesse_bytes)
  const datum = formatDate(dokument.hochgeladen_am)

  return (
    <div
      className={`rounded-ios-lg border p-3 flex items-start gap-3 ${
        highlight
          ? 'border-claimondo-ondo bg-claimondo-bg/40'
          : 'border-claimondo-border bg-white'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-ios-lg flex items-center justify-center shrink-0 ${
          highlight ? 'bg-claimondo-ondo text-white' : 'bg-claimondo-bg text-claimondo-ondo'
        }`}
      >
        {highlight ? (
          <FileTextIcon className="w-4 h-4" />
        ) : (
          <FileIcon className="w-4 h-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-claimondo-navy truncate" title={name}>
          {name}
        </p>
        <p className="text-[11px] text-claimondo-ondo mt-0.5">
          {typ}
          {size ? ` · ${size}` : ''}
          {` · ${datum}`}
        </p>
        {dokument.beschreibung && dokument.beschreibung !== name && (
          <p className="text-[11px] text-claimondo-ondo mt-0.5 italic truncate">
            {dokument.beschreibung}
          </p>
        )}
      </div>
      {publicUrl ? (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener"
          download={dokument.original_filename ?? undefined}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-ios-md bg-claimondo-ondo text-white text-[11px] font-medium hover:bg-claimondo-navy transition-colors"
          title="Herunterladen / Öffnen"
        >
          <DownloadIcon className="w-3 h-3" />
          Öffnen
        </a>
      ) : (
        <span className="shrink-0 text-[10px] text-claimondo-ondo/70 italic">
          kein Link
        </span>
      )}
    </div>
  )
}
