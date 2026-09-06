'use client'

// GEO-P2 SP2: NPS-Formular (0-10 + Kommentar) + Opt-out. Muster: KundeTerminClient.
import { useState, useTransition } from 'react'
import { Button, Card } from '@/components/primitives'
import { submitNpsByToken, abmeldenByToken } from './actions'

type View = 'form' | 'abmelden' | 'done' | 'abgemeldet'

export function NpsFormClient({
  token,
  claimNummer,
  startAbmelden,
  reviewUrl,
}: {
  token: string
  claimNummer: string | null
  startAbmelden?: boolean
  reviewUrl?: string | null
}) {
  const [rating, setRating] = useState<number | null>(null)
  const [kommentar, setKommentar] = useState('')
  const [view, setView] = useState<View>(startAbmelden ? 'abmelden' : 'form')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (rating === null) {
      setError('Bitte eine Bewertung wählen.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await submitNpsByToken(token, rating, kommentar)
      if (res.ok) setView('done')
      else setError(res.error ?? 'Fehler')
    })
  }

  function handleAbmelden() {
    setError(null)
    startTransition(async () => {
      const res = await abmeldenByToken(token)
      if (res.ok) setView('abgemeldet')
      else setError(res.error ?? 'Fehler')
    })
  }

  if (view === 'done') {
    return (
      <Card className="max-w-md w-full text-center">
        <p className="text-lg font-semibold text-claimondo-navy">Vielen Dank!</p>
        <p className="text-sm text-claimondo-ondo mt-2">Ihre Bewertung hilft uns, besser zu werden.</p>
        {/* GEO: NPS->Review-Funnel — allen Antwortenden angeboten (ungated, Trustpilot/
            ProvenExpert-Richtlinien-konform). Dormant bis NPS_REVIEW_URL gesetzt ist. */}
        {reviewUrl && (
          <div className="mt-4 pt-4 border-t border-claimondo-border">
            <p className="text-sm text-claimondo-ondo mb-3">Möchten Sie Ihre Erfahrung auch öffentlich teilen?</p>
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 rounded-ios-lg bg-claimondo-navy text-white text-sm font-medium hover:bg-claimondo-ondo"
            >
              Öffentlich bewerten
            </a>
          </div>
        )}
      </Card>
    )
  }

  if (view === 'abgemeldet') {
    return (
      <Card className="max-w-md w-full text-center">
        <p className="text-claimondo-navy">Sie erhalten keine Feedback-Anfragen mehr. Danke für Ihre Rückmeldung.</p>
      </Card>
    )
  }

  if (view === 'abmelden') {
    return (
      <Card className="max-w-md w-full text-center">
        <p className="text-claimondo-navy mb-4">Möchten Sie keine Feedback-Anfragen mehr erhalten?</p>
        {error && <p className="text-sm text-danger-strong mb-3">{error}</p>}
        <Button variant="navy" fullWidth loading={pending} onClick={handleAbmelden}>
          Abmelden bestätigen
        </Button>
        <button
          onClick={() => setView('form')}
          className="mt-3 text-sm text-claimondo-ondo hover:text-claimondo-navy"
        >
          Zurück
        </button>
      </Card>
    )
  }

  return (
    <Card className="max-w-md w-full">
      <div className="mb-4">
        <p className="text-lg font-semibold text-claimondo-navy">Wie zufrieden waren Sie mit der Abwicklung?</p>
        {claimNummer && <p className="text-xs text-claimondo-ondo mt-1">Vorgang {claimNummer}</p>}
        <p className="text-sm text-claimondo-ondo mt-1">0 = gar nicht, 10 = sehr zufrieden</p>
      </div>
      <div className="grid grid-cols-11 gap-1 mb-4">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setRating(i)}
            aria-label={`Bewertung ${i}`}
            className={`aspect-square rounded-ios-sm text-sm font-medium border transition-colors ${
              rating === i
                ? 'bg-claimondo-navy/10 border-claimondo-navy text-claimondo-navy'
                : 'bg-claimondo-bg border-transparent text-claimondo-ondo hover:border-claimondo-light-blue'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <textarea
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        rows={3}
        placeholder="Möchten Sie uns noch etwas mitteilen? (optional)"
        className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-sm focus:outline-none focus:border-claimondo-ondo mb-3"
      />
      {error && <p className="text-sm text-danger-strong mb-3">{error}</p>}
      <Button variant="navy" fullWidth loading={pending} onClick={handleSubmit}>
        Bewertung absenden
      </Button>
      <button
        onClick={() => setView('abmelden')}
        className="mt-3 w-full text-center text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo"
      >
        Keine Umfragen mehr erhalten
      </button>
    </Card>
  )
}
