'use client'

// AAR-404: Gutachten prominent in der rechten Spalte der SV-Fallakte.
// - Gated ab Subphase 4.4 „gutachten-erstellen" oder später (Phase 5/6)
// - Wenn noch kein Gutachten: Upload-Zone via shared DokumentSlot (AAR-Phase0 0.1)
// - Wenn ein Gutachten vorliegt: aktuelle Version mit Download + Ansehen,
//   ältere Uploads als aufklappbare Versions-Historie
// - Download/Ansehen nutzt den shared Signed-URL-Helper (AAR-Phase0 0.4)

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  FileTextIcon,
  DownloadIcon,
  EyeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
} from 'lucide-react'
import DokumentSlot from '@/components/fall/DokumentSlot'
import { getSignedUrl } from '@/lib/supabase/storage'
import type { SvSubphase } from '@/lib/gutachter/subphase'
import { formatDatum } from '@/lib/format'

export type GutachtenDokument = {
  id: string
  dokument_typ: string
  storage_path: string
  original_filename: string | null
  hochgeladen_am: string
}

type Props = {
  fallId: string
  fallNummer: string
  subphase: SvSubphase
  gutachten: GutachtenDokument[]
}

// AAR-411: delegiert an die zentrale Formatter-Bibliothek.
function fmtDate(iso: string | null): string {
  return formatDatum(iso) || '—'
}

function istAbGutachtenErstellen(subphase: SvSubphase): boolean {
  // Phase 5 + 6 sind immer nach „Gutachten erstellen". In Phase 4 nur ab dem
  // Subphase-Code 'gutachten-erstellen' — davor (Auftrag eingegangen, Termin
  // bestätigt, Vor-Ort) ist der Upload noch nicht dran.
  if (subphase.phase >= 5) return true
  if (subphase.phase === 4 && subphase.code === 'gutachten-erstellen') return true
  return false
}

export function GutachtenCard({ fallId, fallNummer, subphase, gutachten }: Props) {
  const [historieOffen, setHistorieOffen] = useState(false)
  const [busyAction, setBusyAction] = useState<null | 'download' | 'view'>(null)
  const [, startTransition] = useTransition()

  if (!istAbGutachtenErstellen(subphase)) return null

  // Neueste Version zuerst — DB-Sortierung ist ascending, daher hier umdrehen.
  const sorted = [...gutachten].sort((a, b) =>
    b.hochgeladen_am.localeCompare(a.hochgeladen_am),
  )
  const current = sorted[0] ?? null
  const vorgaengerversionen = sorted.slice(1)

  function handleOpen(doc: GutachtenDokument, action: 'download' | 'view') {
    setBusyAction(action)
    startTransition(async () => {
      try {
        const res = await getSignedUrl(doc.storage_path, 60, 'fall-dokumente')
        if (!res.ok) {
          toast.error(`Link konnte nicht erzeugt werden: ${res.error}`)
          return
        }
        if (action === 'download') {
          // Sauberer Filename via <a download> — funktioniert auf allen Browsern
          // weil der Bucket public/signed ist und auf gleichem Origin läuft.
          const a = document.createElement('a')
          a.href = res.url
          a.download = doc.original_filename || `Gutachten-${fallNummer}.pdf`
          a.rel = 'noopener noreferrer'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        } else {
          window.open(res.url, '_blank', 'noopener,noreferrer')
        }
      } catch (err) {
        console.error('[GutachtenCard] open failed', err)
        toast.error('Öffnen fehlgeschlagen')
      } finally {
        setBusyAction(null)
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
          Gutachten
        </h3>
        {sorted.length > 0 && (
          <span className="text-[11px] text-claimondo-ondo/70">
            Version {sorted.length}
          </span>
        )}
      </div>

      {current ? (
        <>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-ios-lg bg-[var(--brand-primary)]/5 flex items-center justify-center shrink-0">
              <FileTextIcon className="w-5 h-5 text-[var(--brand-primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-claimondo-navy truncate">
                {current.original_filename || `Gutachten-${fallNummer}.pdf`}
              </p>
              <p className="text-[11px] text-claimondo-ondo mt-0.5">
                Hochgeladen {fmtDate(current.hochgeladen_am)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleOpen(current, 'download')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg bg-[var(--brand-primary)] text-white text-xs font-medium hover:bg-[var(--brand-primary)] disabled:opacity-60"
            >
              {busyAction === 'download' ? (
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <DownloadIcon className="w-3.5 h-3.5" />
              )}
              Herunterladen
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleOpen(current, 'view')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg border border-[var(--brand-secondary)] text-[var(--brand-secondary)] text-xs font-medium hover:bg-[var(--brand-secondary)]/5 disabled:opacity-60"
            >
              {busyAction === 'view' ? (
                <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <EyeIcon className="w-3.5 h-3.5" />
              )}
              Ansehen
            </button>
          </div>

          {vorgaengerversionen.length > 0 && (
            <div className="pt-3 border-t border-claimondo-border">
              <button
                type="button"
                onClick={() => setHistorieOffen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-claimondo-ondo hover:text-claimondo-navy"
              >
                {historieOffen ? (
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                )}
                Vorgängerversionen ({vorgaengerversionen.length})
              </button>
              {historieOffen && (
                <ul className="mt-2 space-y-1">
                  {vorgaengerversionen.map((doc, i) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 text-[11px] text-claimondo-ondo"
                    >
                      <FileTextIcon className="w-3 h-3 text-claimondo-ondo/70" />
                      <span className="flex-1 truncate">
                        {doc.original_filename ||
                          `Version ${vorgaengerversionen.length - i}`}
                      </span>
                      <span className="text-claimondo-ondo/70">
                        {fmtDate(doc.hochgeladen_am)}
                      </span>
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => handleOpen(doc, 'view')}
                        className="text-[var(--brand-secondary)] hover:text-[var(--brand-primary)] disabled:opacity-60"
                        aria-label="Ansehen"
                      >
                        <EyeIcon className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className="text-[11px] text-claimondo-ondo/70 pt-1">
            Neue Version? Einfach hochladen — die alte bleibt als Vorgänger
            erhalten.
          </p>
          <DokumentSlot
            slotLabel="Neue Version hochladen"
            fallId={fallId}
            dokumentTyp="gutachten"
            istPflicht={false}
            status="optional"
          />
        </>
      ) : (
        <>
          <p className="text-xs text-claimondo-ondo">
            Lade dein fertiges Gutachten hoch (PDF). Damit wechselt der Fall in
            die Kanzlei-Phase.
          </p>
          <DokumentSlot
            slotLabel="Gutachten (PDF)"
            fallId={fallId}
            dokumentTyp="gutachten"
            istPflicht={true}
            status="ausstehend"
          />
        </>
      )}
    </div>
  )
}
