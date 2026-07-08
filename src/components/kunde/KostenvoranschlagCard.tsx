'use client'

// WS4 (Reduced-Repair) — Kunde-KVA-Card fuer die reparatur-only Fallakte.
// Zeigt den (von der Werkstatt) hochgeladenen Kostenvoranschlag (Betrag + PDF-Link)
// und erlaubt dem Kunden, einen eigenen Kostenvoranschlag hochzuladen.
// EIN KVA-Dokument, zwei Upload-Quellen (Werkstatt via Modal, Kunde hier).

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileTextIcon, UploadIcon, Loader2Icon, ExternalLinkIcon } from 'lucide-react'

import { Card } from '@/components/primitives'
import { uploadKvaKunde } from '@/app/kunde/faelle/[id]/kva-actions'

export type KostenvoranschlagCardProps = {
  claimId: string
  netto: number | null
  brutto: number | null
  /** Signed/Public-URL des zuletzt hochgeladenen KVA-Dokuments (oder null). */
  kvaDokUrl: string | null
}

function euro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function KostenvoranschlagCard({
  claimId,
  netto,
  brutto,
  kvaDokUrl,
}: KostenvoranschlagCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hatBetrag = netto != null || brutto != null

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadKvaKunde(claimId, fd)
      if (inputRef.current) inputRef.current.value = ''
      if (!res.ok) {
        setError(res.error ?? 'Upload fehlgeschlagen')
        toast.error(res.error ?? 'Upload fehlgeschlagen')
        return
      }
      toast.success('Kostenvoranschlag hochgeladen.')
      router.refresh()
    })
  }

  return (
    <Card>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-5 h-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Kostenvoranschlag</h2>
        </div>

        {/* Betrag + Dokument der Werkstatt */}
        {hatBetrag ? (
          <div className="space-y-1.5">
            {brutto != null && (
              <div className="flex justify-between gap-2 text-body-sm">
                <span className="text-claimondo-ondo">Kostenvoranschlag (brutto)</span>
                <span className="text-claimondo-navy font-semibold tabular-nums">{euro(brutto)}</span>
              </div>
            )}
            {netto != null && (
              <div className="flex justify-between gap-2 text-body-sm">
                <span className="text-claimondo-ondo">Kostenvoranschlag (netto)</span>
                <span className="text-claimondo-navy font-medium tabular-nums">{euro(netto)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-claimondo-ondo">
            Sobald die Werkstatt einen Kostenvoranschlag erstellt, siehst du ihn hier. Du kannst
            auch selbst einen hochladen.
          </p>
        )}

        {/* Dokument ansehen */}
        {kvaDokUrl && (
          <a
            href={kvaDokUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-claimondo-navy underline underline-offset-2 hover:text-claimondo-ondo"
          >
            <ExternalLinkIcon className="w-4 h-4" />
            Kostenvoranschlag ansehen
          </a>
        )}

        {/* Eigenen KVA hochladen */}
        <label
          className={`flex items-center justify-center gap-2 w-full min-h-11 rounded-ios-xl border-2 border-dashed border-claimondo-border hover:border-claimondo-ondo bg-claimondo-bg hover:bg-white text-sm font-medium text-claimondo-navy cursor-pointer transition-colors ${
            pending ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          {pending ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" /> Lädt hoch …
            </>
          ) : (
            <>
              <UploadIcon className="w-4 h-4" /> Eigenen Kostenvoranschlag hochladen
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={handleFileSelected}
          />
        </label>

        {error && (
          <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-lg p-2">
            {error}
          </p>
        )}
      </div>
    </Card>
  )
}
