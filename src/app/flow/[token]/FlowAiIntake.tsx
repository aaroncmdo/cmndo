'use client'

// KI-gefuehrtes Intake: dialoggefuehrte Feststellungs-Erfassung. Erbt das
// /flow-Brand-Theme (Wrapper der Seite). Bei Fehler -> onFallback (klassischer Wizard).
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

type Turn = { role: 'user' | 'assistant'; content: string }

export default function FlowAiIntake({
  token,
  schema,
  onFertig,
  onFallback,
}: {
  token: string
  schema: IntakeFeld[]
  onFertig: () => void
  onFallback: () => void
}) {
  const [verlauf, setVerlauf] = useState<Turn[]>([
    {
      role: 'assistant',
      content: 'Hallo! Ich helfe Ihnen, Ihren Unfall kurz zu schildern. Was ist passiert?',
    },
  ])
  const [eingabe, setEingabe] = useState('')
  const [busy, setBusy] = useState(false)

  async function senden(text: string) {
    const nachricht = text.trim()
    if (!nachricht || busy) return
    setBusy(true)
    const historie = verlauf
    setVerlauf((v) => [...v, { role: 'user', content: nachricht }])
    setEingabe('')
    try {
      const res = await fetch(`/api/flow/${token}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nachricht, historie }),
      })
      const json = await res.json()
      if (!json.ok) {
        onFallback()
        return
      }
      setVerlauf((v) => [...v, { role: 'assistant', content: json.naechste_frage }])
      if (json.fertig) onFertig()
    } catch {
      onFallback()
    } finally {
      setBusy(false)
    }
  }

  // Chips: Optionen des ersten offenen Feldes mit Auswahlmoeglichkeiten.
  const chipFeld = schema.find((f) => f.optionen && f.optionen.length > 0)

  return (
    <SectionCard title="Schaden schildern">
      <div className="space-y-3">
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {verlauf.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <span
                className={`inline-block rounded-ios-lg px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'bg-claimondo-navy text-white'
                    : 'bg-claimondo-bg text-claimondo-navy'
                }`}
              >
                {t.content}
              </span>
            </div>
          ))}
        </div>

        {chipFeld?.optionen && (
          <div className="flex flex-wrap gap-2">
            {chipFeld.optionen.map((o) => (
              <Button
                key={o.wert}
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void senden(o.label)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void senden(eingabe)
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 rounded-ios-lg border border-claimondo-border px-3 py-2 text-sm"
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder="Ihre Antwort…"
            disabled={busy}
          />
          <Button variant="navy" loading={busy} onClick={() => void senden(eingabe)}>
            Senden
          </Button>
        </form>

        <button
          type="button"
          onClick={onFallback}
          className="text-xs text-claimondo-ondo underline underline-offset-2"
        >
          Lieber klassisch ausfüllen
        </button>
      </div>
    </SectionCard>
  )
}
