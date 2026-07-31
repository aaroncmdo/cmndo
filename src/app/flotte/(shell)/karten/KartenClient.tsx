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

type Aktion = (token: string) => Promise<{ ok: boolean; error?: string }>

type Props = {
  karten: Karte[]
  onIdentify: (token: string) => Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }>
  onQrPdf: () => Promise<{ ok: true; base64: string } | { ok: false; error: string }>
  onSperren: Aktion
  onEntsperren: Aktion
  onEntbinden: Aktion
}

/** Reine Label-Map ohne Farbe — vom status-registry-Ratchet ausdrücklich erlaubt. */
const STATUS_LABEL: Record<string, string> = {
  bestellt: 'Bestellt',
  frei: 'Frei',
  gebunden: 'Gebunden',
  gesperrt: 'Gesperrt',
  ersetzt: 'Ersetzt',
}

export default function KartenClient({
  karten, onIdentify, onQrPdf, onSperren, onEntsperren, onEntbinden,
}: Props) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladend, setLadend] = useState(false)
  const [pdfFehler, setPdfFehler] = useState<string | null>(null)
  const [pdfLadend, setPdfLadend] = useState(false)
  const [aktionToken, setAktionToken] = useState<string | null>(null)
  const [aktionFehler, setAktionFehler] = useState<string | null>(null)

  async function fuehreAus(token: string, aktion: Aktion) {
    setAktionFehler(null)
    setAktionToken(token)
    try {
      const res = await aktion(token)
      if (!res.ok) setAktionFehler(res.error ?? 'Aktion fehlgeschlagen.')
      else router.refresh()
    } finally {
      setAktionToken(null)
    }
  }

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

      <SectionCard title="Ihre Netzwerkkarten">
        {karten.length === 0 ? (
          <p className="text-sm text-claimondo-shield">Noch keine Netzwerkkarten vorhanden.</p>
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
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-claimondo-navy">{k.token}</span>
                    <span className="text-xs text-claimondo-shield">
                      {STATUS_LABEL[k.status] ?? k.status}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {k.status === 'gebunden' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onEntbinden)}
                      >
                        Vom Fahrzeug lösen
                      </Button>
                    )}
                    {k.status !== 'gesperrt' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onSperren)}
                      >
                        Sperren
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={aktionToken === k.token}
                        onClick={() => fuehreAus(k.token, onEntsperren)}
                      >
                        Entsperren
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {aktionFehler && (
              <p className="mt-3 text-sm text-danger-strong">{aktionFehler}</p>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
