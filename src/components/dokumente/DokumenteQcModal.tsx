// AAR-326 (Child 6 von AAR-320): QC-Modal für hochgeladene Dokumente.
//
// Flow: KB klickt auf ein hochgeladenes Dokument, das noch nicht geprüft ist.
// Modal zeigt Preview + zwei Aktionen:
//   - „Akzeptieren" → pflichtdokumente.status='geprueft', Task erledigt
//   - „Ablehnen + Neu anfordern" → abgelehnt + neuer ausstehender Eintrag
//     + Kunden-Task + Smart-Channel Push (über ablehneDokument-Action).
//
// Die Server-Actions akzeptiereDokument() und ablehneDokument() prüfen
// Rolle (admin/kb) als Defense-in-Depth.

'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  Loader2Icon,
  AlertCircleIcon,
  FileTextIcon,
  ExternalLinkIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { akzeptiereDokument, ablehneDokument } from '@/lib/dokumente/zuordnung'

export type QcDoc = {
  id: string
  label: string
  original_filename: string | null
  previewUrl: string | null
  hochgeladen_am: string
}

export default function DokumenteQcModal({
  doc,
  open,
  onOpenChange,
}: {
  doc: QcDoc | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'default' | 'ablehnen'>('default')
  const [begruendung, setBegruendung] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode('default')
      setBegruendung('')
      setError(null)
    }
  }, [open, doc?.id])

  function handleAccept() {
    if (!doc) return
    setError(null)
    startTransition(async () => {
      const res = await akzeptiereDokument(doc.id)
      if (res.success) {
        toast.success('Dokument akzeptiert')
        onOpenChange(false)
        router.refresh()
      } else {
        setError(res.error ?? 'Akzeptieren fehlgeschlagen')
        toast.error(res.error ?? 'Akzeptieren fehlgeschlagen')
      }
    })
  }

  function handleReject() {
    if (!doc) return
    setError(null)
    const trimmed = begruendung.trim()
    if (trimmed.length < 10) {
      setError(`Begründung muss mindestens 10 Zeichen haben (aktuell ${trimmed.length})`)
      return
    }
    startTransition(async () => {
      const res = await ablehneDokument(doc.id, trimmed)
      if (res.success) {
        toast.success('Ablehnung gespeichert — Kunde wird benachrichtigt')
        onOpenChange(false)
        router.refresh()
      } else {
        setError(res.error ?? 'Ablehnung fehlgeschlagen')
        toast.error(res.error ?? 'Ablehnung fehlgeschlagen')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dokumenten-Prüfung</DialogTitle>
        </DialogHeader>

        {doc && (
          <div className="space-y-4 pt-1">
            {/* Datei-Info */}
            <div className="rounded-lg border border-claimondo-border bg-[#f8f9fb] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-semibold">
                {doc.label}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-claimondo-ondo/70 shrink-0" />
                  <span className="text-sm text-claimondo-navy truncate">
                    {doc.original_filename ?? 'Unbenannt'}
                  </span>
                </div>
                {doc.previewUrl && (
                  <a
                    href={doc.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo hover:underline shrink-0"
                  >
                    <ExternalLinkIcon className="w-3 h-3" /> Öffnen
                  </a>
                )}
              </div>
              <p className="mt-1 text-[10px] text-claimondo-ondo">
                Hochgeladen: {new Date(doc.hochgeladen_am).toLocaleDateString('de-DE')}
              </p>
            </div>

            {mode === 'ablehnen' && (
              <div>
                <label className="block text-xs font-medium text-claimondo-navy mb-1">
                  Begründung <span className="text-claimondo-ondo/70 font-normal">(wird dem Kunden gezeigt)</span>
                </label>
                <textarea
                  value={begruendung}
                  onChange={(e) => setBegruendung(e.target.value)}
                  rows={3}
                  disabled={pending}
                  placeholder="Was muss der Kunde nachbessern? (min. 10 Zeichen)"
                  className="w-full px-3 py-2 text-sm border border-claimondo-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
                />
                <p className="mt-1 text-[10px] text-claimondo-ondo/70">
                  Der Kunde bekommt eine WhatsApp/SMS/Email-Benachrichtigung mit dieser Begründung.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <AlertCircleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {mode === 'default' ? (
            <>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-medium text-claimondo-navy bg-white border border-claimondo-border rounded-md hover:bg-[#f8f9fb] disabled:opacity-50"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={() => setMode('ablehnen')}
                disabled={pending || !doc}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-white border border-orange-200 rounded-md hover:bg-orange-50 disabled:opacity-50"
              >
                <XCircleIcon className="w-3.5 h-3.5" />
                Ablehnen + Neu anfordern
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={pending || !doc}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2Icon className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2Icon className="w-3.5 h-3.5" />
                )}
                Akzeptieren
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('default')
                  setBegruendung('')
                  setError(null)
                }}
                disabled={pending}
                className="px-3 py-1.5 text-xs font-medium text-claimondo-navy bg-white border border-claimondo-border rounded-md hover:bg-[#f8f9fb] disabled:opacity-50"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={pending || !doc || begruendung.trim().length < 10}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                {pending && <Loader2Icon className="w-3 h-3 animate-spin" />}
                Ablehnung senden
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
