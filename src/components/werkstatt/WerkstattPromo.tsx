'use client'

// AAR-956 WP-B (Task 9): Werkstatt QR-Code-Komponente.
// Zeigt den statischen QR-Code (werkstattStartUrl) zum Aushaengen.
// Download SVG + PNG, URL kopieren. Gespiegelt nach MaklerPromo.

import { useState, useTransition } from 'react'
import {
  QrCodeIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PrinterIcon,
  BadgeCheckIcon,
} from 'lucide-react'
import { Button } from '@/components/primitives'
import { Card } from '@/components/primitives'
import { QrCodeDownloadButtons } from '@/components/shared/QrCodeDownloadButtons'
import { generiereMeinAufstellerPdf } from '@/app/werkstatt/(shell)/promo/aufsteller-actions'

type Props = {
  startUrl: string
  qrSvg: string
  werkstattName: string
}

// Base64-PDF (Server-Action-Result) als Datei-Download ausloesen.
function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function WerkstattPromo({ startUrl, qrSvg, werkstattName }: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const [pdfFehler, setPdfFehler] = useState<string | null>(null)
  const [pdfPending, startPdf] = useTransition()

  function handleAufsteller() {
    setPdfFehler(null)
    startPdf(async () => {
      const res = await generiereMeinAufstellerPdf()
      if (!res.ok) {
        setPdfFehler(res.error)
        return
      }
      downloadBase64Pdf(res.base64, res.filename)
    })
  }

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    })
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
              <QrCodeDownloadButtons qrSvg={qrSvg} fileBaseName="claimondo-werkstatt-qr" />
            </div>
            <div
              className="flex items-center justify-center p-6 rounded-ios-xl bg-claimondo-bg border border-claimondo-border"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-2 text-body-xs text-claimondo-shield text-center">
              Scan führt Ihre Kunden direkt zur Schadensmeldung — ohne manuelle Eingabe.
            </p>
          </div>

          {/* Aushang-Material: Self-Print-Aufsteller (A5) + Partner-Badge (Task #5) */}
          <div className="border-t border-claimondo-border pt-5">
            <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo font-medium">
              Aushang-Material
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="navy"
                size="sm"
                onClick={handleAufsteller}
                loading={pdfPending}
                iconLeft={<PrinterIcon width={14} height={14} />}
              >
                Aufsteller (A5) als PDF
              </Button>
              <a
                href="/partner-badges/claimondo-partner.svg"
                download="claimondo-partner-badge.svg"
                className="inline-flex items-center justify-center gap-1.5 rounded-ios-lg border border-claimondo-border px-3 py-2 text-sm font-medium text-claimondo-navy hover:border-claimondo-ondo"
              >
                <BadgeCheckIcon width={14} height={14} />
                Partner-Badge (SVG)
              </a>
            </div>
            {pdfFehler ? <p className="mt-2 text-sm text-danger-strong">{pdfFehler}</p> : null}
            <p className="mt-2 text-body-xs text-claimondo-shield">
              Druckfertiges A5-PDF für Theke &amp; Schaufenster — mit Ihrem persönlichen QR-Code.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
