'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DownloadIcon } from 'lucide-react'
import { SchadenkarteScanner } from '@/components/flotte/SchadenkarteScanner'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'

type Karte = {
  id: string
  token: string
  status: string
  fahrzeugId: string | null
}

type Props = {
  karten: Karte[]
  onIdentify: (token: string) => Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }>
  onQrPdf: () => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
}

export default function KartenClient({ karten, onIdentify, onQrPdf }: Props) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladend, setLadend] = useState(false)
  const [pdfFehler, setPdfFehler] = useState<string | null>(null)
  const [pdfLadend, setPdfLadend] = useState(false)

  async function handleToken(token: string) {
    setFehler(null)
    setLadend(true)
    try {
      const result = await onIdentify(token)
      if (result.ok) {
        router.push('/flotte/fahrzeug/' + result.vehicleId)
      } else {
        setFehler(result.error)
      }
    } finally {
      setLadend(false)
    }
  }

  async function handleQrPdf() {
    setPdfFehler(null)
    setPdfLadend(true)
    try {
      const result = await onQrPdf()
      if (!result.ok) {
        setPdfFehler(result.error)
        return
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'schadenkarten-qr.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLadend(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Fahrzeug per Karte identifizieren" subtitle="QR-Code scannen oder Token eingeben, um zum Fahrzeug zu springen.">
        <SchadenkarteScanner onToken={handleToken} disabled={ladend} />
        {fehler && (
          <p className="mt-3 text-sm text-danger-strong">{fehler}</p>
        )}
      </SectionCard>

      <SectionCard title="Ihre Schadenkarten">
        {karten.length === 0 ? (
          <p className="text-sm text-claimondo-shield">Noch keine Schadenkarten vorhanden.</p>
        ) : (
          <>
            <div className="mb-4">
              <Button
                variant="navy"
                size="sm"
                onClick={handleQrPdf}
                loading={pdfLadend}
                iconLeft={<DownloadIcon width={14} height={14} />}
              >
                Alle QR-Codes als PDF
              </Button>
              {pdfFehler && (
                <p className="mt-2 text-sm text-danger-strong">{pdfFehler}</p>
              )}
            </div>
            <ul className="divide-y divide-claimondo-border">
              {karten.map((k) => (
                <li key={k.id} className="flex items-center justify-between py-3 gap-4">
                  <span className="font-mono text-sm text-claimondo-navy">{k.token}</span>
                  <span className="text-xs text-claimondo-shield shrink-0">{k.status}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  )
}
