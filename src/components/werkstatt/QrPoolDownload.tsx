'use client'

// Download-Buttons fuer den QR-Pool: pro Code (QR-PNG + Flyer-PDF) und Bulk
// (alle als Flyer-PDF / QR-Codes-PDF). Erzeugung laeuft server-seitig
// (flyer-actions), der Client uebergibt nur Tokens und laedt das base64-Ergebnis.
import { useState } from 'react'
import { toast } from 'sonner'
import { DownloadIcon, FileTextIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import {
  generateQrPng,
  generateFlyerPdf,
  generateQrGridPdf,
} from '@/app/admin/werkstaetten/qr-pool/flyer-actions'

type DlResult = { ok: true; base64: string; filename: string } | { ok: false; error: string }

function triggerDownload(res: DlResult) {
  if (!res.ok) {
    toast.error(res.error)
    return
  }
  const mime = res.filename.endsWith('.png') ? 'image/png' : 'application/pdf'
  const bin = atob(res.base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = res.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Pro Code: QR als PNG + fertiger Flyer als PDF. */
export function QrCodeDownloads({ token }: { token: string }) {
  const [busy, setBusy] = useState<null | 'png' | 'flyer'>(null)
  const run = async (kind: 'png' | 'flyer', fn: () => Promise<DlResult>) => {
    setBusy(kind)
    try {
      triggerDownload(await fn())
    } catch {
      toast.error('Download fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        loading={busy === 'png'}
        onClick={() => run('png', () => generateQrPng(token))}
        iconLeft={<ImageIcon width={12} height={12} />}
      >
        PNG
      </Button>
      <Button
        variant="ghost"
        size="sm"
        loading={busy === 'flyer'}
        onClick={() => run('flyer', () => generateFlyerPdf([token]))}
        iconLeft={<FileTextIcon width={12} height={12} />}
      >
        Flyer
      </Button>
    </div>
  )
}

/** Bulk: alle uebergebenen Codes als Flyer-PDF (1 Flyer/Seite) oder QR-Codes-PDF. */
export function BulkDownloads({ tokens }: { tokens: string[] }) {
  const [busy, setBusy] = useState<null | 'flyer' | 'qr'>(null)
  const run = async (kind: 'flyer' | 'qr', fn: () => Promise<DlResult>) => {
    setBusy(kind)
    try {
      triggerDownload(await fn())
    } catch {
      toast.error('Download fehlgeschlagen.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="navy"
        size="sm"
        disabled={tokens.length === 0}
        loading={busy === 'flyer'}
        onClick={() => run('flyer', () => generateFlyerPdf(tokens))}
        iconLeft={<FileTextIcon width={14} height={14} />}
      >
        {tokens.length} Flyer als PDF
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={tokens.length === 0}
        loading={busy === 'qr'}
        onClick={() => run('qr', () => generateQrGridPdf(tokens))}
        iconLeft={<DownloadIcon width={14} height={14} />}
      >
        QR-Codes als PDF
      </Button>
    </div>
  )
}
