'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { speichereNachweis, waehlePraemie } from './actions'

type Praemie = { id: string; name: string; beschreibung: string | null }

type Props = {
  token: string
  betrag: number
  hatPraemie: boolean
  praemien: Praemie[]
  hatNachweis: boolean
}

export default function GewinnClient({ token, betrag, hatPraemie, praemien, hatNachweis }: Props) {
  const [pending, startTransition] = useTransition()
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [praemieFest, setPraemieFest] = useState(hatPraemie)
  const [fertig, setFertig] = useState(hatNachweis)

  function handlePraemie(id: string) {
    setGewaehlt(id)
    startTransition(async () => {
      const res = await waehlePraemie(token, id)
      if (!res.ok) {
        toast.error(res.error ?? 'Das hat nicht geklappt.')
        setGewaehlt(null)
        return
      }
      setPraemieFest(true)
      toast.success('Auswahl gespeichert.')
    })
  }

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fd = new FormData(event.currentTarget)
    startTransition(async () => {
      const res = await speichereNachweis(token, fd)
      if (!res.ok) {
        toast.error(res.error ?? 'Der Upload hat nicht geklappt.')
        return
      }
      setFertig(true)
    })
  }

  return (
    <main className="min-h-screen bg-claimondo-bg px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          <p className="text-caption text-claimondo-ondo">Sie haben gewonnen</p>
          <p className="mt-2 text-5xl font-black tabular-nums text-claimondo-navy">
            {betrag.toLocaleString('de-DE')} €
          </p>
          <p className="mt-2 text-body-sm leading-relaxed text-claimondo-shield/80">
            Gutschein aus unserer täglichen Verlosung. Noch ein Schritt, dann ist er unterwegs.
          </p>
        </header>

        {/* Prämienwahl nur, wenn bei der Teilnahme keine getroffen wurde. */}
        {!praemieFest && praemien.length > 0 ? (
          <section className="rounded-ios-lg border border-claimondo-border bg-white p-5">
            <h2 className="text-heading-sm font-semibold text-claimondo-navy">
              Welchen Gutschein möchten Sie?
            </h2>
            <ul className="mt-3 space-y-2">
              {praemien.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handlePraemie(p.id)}
                    disabled={pending}
                    aria-pressed={gewaehlt === p.id}
                    className={[
                      'w-full rounded-ios-md border px-4 py-3 text-left transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      gewaehlt === p.id
                        ? 'border-claimondo-navy bg-claimondo-navy text-white'
                        : 'border-claimondo-border hover:border-claimondo-ondo',
                    ].join(' ')}
                  >
                    <span className="block text-body-sm font-semibold">{p.name}</span>
                    {p.beschreibung ? (
                      <span
                        className={
                          gewaehlt === p.id
                            ? 'block text-body-xs text-white/70'
                            : 'block text-body-xs text-claimondo-shield/60'
                        }
                      >
                        {p.beschreibung}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-ios-lg border border-claimondo-border bg-white p-5">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">
            Nachweis hochladen
          </h2>
          {fertig ? (
            <p className="mt-3 text-body-sm leading-relaxed text-claimondo-shield/80">
              Ihr Nachweis ist angekommen. Wir prüfen ihn und melden uns per WhatsApp, sobald
              der Gutschein unterwegs ist.
            </p>
          ) : (
            <>
              <p className="mt-2 text-body-sm leading-relaxed text-claimondo-shield/80">
                Ein Beleg über Ihren unverschuldeten Unfallschaden genügt: die Schadennummer der
                gegnerischen Versicherung, ein polizeiliches Aktenzeichen oder ein Unfallbericht.
                Ein Foto reicht.
              </p>
              <form onSubmit={handleUpload} className="mt-4 space-y-3">
                <input
                  type="file"
                  name="nachweis"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  required
                  disabled={pending}
                  className="w-full rounded-ios-md border border-claimondo-border px-3 py-2.5 text-body-sm file:mr-3 file:rounded-ios-sm file:border-0 file:bg-claimondo-navy file:px-3 file:py-1.5 file:text-white"
                />
                <Button type="submit" loading={pending} fullWidth>
                  Nachweis senden
                </Button>
                <p className="text-body-xs text-claimondo-shield/60">
                  JPG, PNG, WEBP oder PDF, maximal 10 MB.
                </p>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
