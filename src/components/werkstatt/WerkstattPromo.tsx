'use client'

// AAR-956 WP-B (Task 9): Werkstatt QR-Code-Komponente.
// Zeigt den statischen QR-Code (werkstattStartUrl) zum Aushaengen.
// Download SVG + PNG, URL kopieren. Gespiegelt nach MaklerPromo.

import { useState } from 'react'
import {
  QrCodeIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { Button } from '@/components/primitives'
import { Card } from '@/components/primitives'

type Props = {
  startUrl: string
  qrSvg: string
  werkstattName: string
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function WerkstattPromo({ startUrl, qrSvg, werkstattName }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    })
  }

  function downloadSvg() {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `claimondo-werkstatt-qr.svg`)
  }

  function downloadPng() {
    const size = 600
    const img = new Image()
    const encoded = btoa(unescape(encodeURIComponent(qrSvg)))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      canvas.toBlob((blob) => {
        if (!blob) return
        triggerDownload(blob, `claimondo-werkstatt-qr.png`)
      }, 'image/png')
    }
    img.src = `data:image/svg+xml;base64,${encoded}`
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">
          QR-Code
        </h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Hängen Sie diesen QR-Code in Ihrem Betrieb aus. Kunden scannen ihn und
          gelangen direkt zu Ihrem Schadenmelde-Einstieg.
        </p>
      </header>

      <Card bordered radius="md">
        <div className="space-y-5">
          {/* URL-Anzeige + Kopieren */}
          <div>
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Ihr Einstiegs-Link
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={startUrl}
                className="flex-1 font-mono text-sm text-claimondo-navy bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2.5 truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="navy"
                size="sm"
                onClick={() => copy(startUrl, 'url')}
                iconLeft={copied === 'url' ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
              >
                {copied === 'url' ? 'Kopiert' : 'Kopieren'}
              </Button>
              <a
                href={startUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-ios-lg border border-claimondo-border text-claimondo-ondo hover:border-claimondo-ondo"
                aria-label="Link in neuem Tab öffnen"
              >
                <ExternalLinkIcon width={15} height={15} />
              </a>
            </div>
          </div>

          {/* QR-Code */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium inline-flex items-center gap-1.5">
                <QrCodeIcon width={12} height={12} />
                QR-Code — {werkstattName}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="navy"
                  size="sm"
                  onClick={downloadPng}
                  iconLeft={<DownloadIcon width={12} height={12} />}
                >
                  PNG
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadSvg}
                  iconLeft={<DownloadIcon width={12} height={12} />}
                >
                  SVG
                </Button>
              </div>
            </div>
            <div
              className="flex items-center justify-center p-6 rounded-ios-xl bg-claimondo-bg border border-claimondo-border"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-2 text-body-xs text-claimondo-shield text-center">
              Scan führt Ihre Kunden direkt zur Schadensmeldung — ohne manuelle Eingabe.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
