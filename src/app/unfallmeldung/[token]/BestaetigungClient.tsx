'use client'

// Slice 2c — Was der Unfallgegner sieht, wenn er den SMS-Link antippt:
// seine eigenen Angaben zur Kontrolle, den gesetzlichen Pflicht-Hinweis, und einen
// Bestaetigen-Button. Der Klick loest die Unfallmeldung an seine Haftpflicht aus.
import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { bestaetigeGegnerMeldung } from './actions'

type Props = {
  token: string
  abgelaufen: boolean
  bereitsBestaetigt: boolean
  gegnerName: string | null
  kennzeichen: string | null
  unfallDatum: string | null
  hergang: string | null
}

function formatDatum(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <SectionCard>{children}</SectionCard>
      </div>
    </div>
  )
}

function Danke() {
  return (
    <Rahmen>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center">
          <CheckIcon className="w-7 h-7 text-success-strong" />
        </div>
        <h1 className="text-heading-md text-claimondo-navy">Vielen Dank — bestätigt.</h1>
        <p className="text-body-sm text-claimondo-ondo">
          Wir melden den Schaden jetzt Ihrer Haftpflichtversicherung.
        </p>
        <p className="text-body-xs text-claimondo-ondo/80">
          Hinweis: Sie sind unabhängig davon verpflichtet, den Schaden auch selbst Ihrer
          Haftpflichtversicherung zu melden.
        </p>
      </div>
    </Rahmen>
  )
}

export function BestaetigungClient({
  token,
  abgelaufen,
  bereitsBestaetigt,
  gegnerName,
  kennzeichen,
  unfallDatum,
  hergang,
}: Props) {
  const [fertig, setFertig] = useState(bereitsBestaetigt)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  if (fertig) return <Danke />

  if (abgelaufen) {
    return (
      <Rahmen>
        <div className="flex flex-col gap-3 py-4 text-center">
          <h1 className="text-heading-md text-claimondo-navy">Dieser Link ist abgelaufen.</h1>
          <p className="text-body-sm text-claimondo-ondo">
            Ihre Angaben sind bei uns gespeichert. Bitte melden Sie sich kurz bei uns, damit wir den
            Schaden Ihrer Haftpflichtversicherung melden können.
          </p>
        </div>
      </Rahmen>
    )
  }

  const datum = formatDatum(unfallDatum)

  async function bestaetigen() {
    setLaeuft(true)
    setFehler(null)
    const res = await bestaetigeGegnerMeldung(token)
    setLaeuft(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.')
      return
    }
    setFertig(true)
  }

  return (
    <Rahmen>
      <div className="flex flex-col gap-5 py-2">
        <div>
          <h1 className="text-heading-md text-claimondo-navy">Bitte bestätigen Sie Ihre Angaben</h1>
          <p className="mt-2 text-body-sm text-claimondo-ondo">
            Sie haben nach dem Unfall folgende Angaben gemacht. Bitte prüfen Sie sie kurz und
            bestätigen Sie — erst dann melden wir den Schaden Ihrer Haftpflichtversicherung.
          </p>
        </div>

        <dl className="flex flex-col gap-2 rounded-ios-md bg-claimondo-bg p-4">
          {gegnerName ? (
            <div className="flex justify-between gap-4">
              <dt className="text-body-xs text-claimondo-ondo">Name</dt>
              <dd className="text-body-sm text-claimondo-navy text-right">{gegnerName}</dd>
            </div>
          ) : null}
          {kennzeichen ? (
            <div className="flex justify-between gap-4">
              <dt className="text-body-xs text-claimondo-ondo">Kennzeichen</dt>
              <dd className="text-body-sm text-claimondo-navy text-right">{kennzeichen}</dd>
            </div>
          ) : null}
          {datum ? (
            <div className="flex justify-between gap-4">
              <dt className="text-body-xs text-claimondo-ondo">Unfalldatum</dt>
              <dd className="text-body-sm text-claimondo-navy text-right">{datum}</dd>
            </div>
          ) : null}
          {hergang ? (
            <div className="flex flex-col gap-1 pt-1">
              <dt className="text-body-xs text-claimondo-ondo">Unfallhergang</dt>
              <dd className="text-body-sm text-claimondo-navy">{hergang}</dd>
            </div>
          ) : null}
        </dl>

        <p className="text-body-xs text-claimondo-ondo">
          Der Schaden wird der Haftpflichtversicherung des Unfallverursachers gemeldet. Sie sind
          unabhängig davon verpflichtet, den Schaden auch selbst Ihrer Haftpflichtversicherung zu
          melden.
        </p>

        {fehler ? <p className="text-body-sm text-danger">{fehler}</p> : null}

        <Button onClick={bestaetigen} loading={laeuft} disabled={laeuft}>
          Angaben bestätigen
        </Button>
      </div>
    </Rahmen>
  )
}
