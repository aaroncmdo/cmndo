'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SchadenkarteScanner } from '@/components/flotte/SchadenkarteScanner'
import { SectionCard } from '@/components/shared/SectionCard'

type Karte = {
  id: string
  token: string
  status: string
  fahrzeugId: string | null
}

type Props = {
  karten: Karte[]
  onIdentify: (token: string) => Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }>
}

export default function KartenClient({ karten, onIdentify }: Props) {
  const router = useRouter()
  const [fehler, setFehler] = useState<string | null>(null)
  const [ladend, setLadend] = useState(false)

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
          <ul className="divide-y divide-claimondo-border">
            {karten.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-3 gap-4">
                <span className="font-mono text-sm text-claimondo-navy">{k.token}</span>
                <span className="text-xs text-claimondo-shield shrink-0">{k.status}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
