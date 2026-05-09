'use client'

import { useState, useTransition } from 'react'
import { Phone, X, Send, Check } from 'lucide-react'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'

const PHONE_TEL = '+4922125906530'
const PHONE_DISPLAY = '0221 25906530'

type Props = {
  /** Quellen-Tag damit Dispatch sieht von welcher Seite der Rückruf kam */
  quelle?: string
}

export function StickyCallBar({ quelle = 'Hauptseite' }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [zeitfenster, setZeitfenster] = useState('Schnellstmöglich')
  const [nachricht, setNachricht] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await erstelleOeffentlichenRueckruf({ name, telefon, zeitfenster, nachricht, quelle })
      if (r.ok) setDone(true)
      else setError(r.error)
    })
  }

  return (
    <>
      {/* Sticky Bar — mobile + desktop unten rechts */}
      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-stretch gap-2 sm:left-auto sm:right-6 sm:translate-x-0">
        <a
          href={`tel:${PHONE_TEL}`}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-claimondo-ondo px-4 py-3.5 text-sm font-bold text-white shadow-2xl ring-1 ring-claimondo-shield/40 transition-all hover:-translate-y-0.5 hover:bg-claimondo-shield"
        >
          <Phone className="h-4 w-4" />
          <span>Sofort anrufen</span>
          <span className="hidden sm:inline opacity-70 font-normal">{PHONE_DISPLAY}</span>
        </a>
        <button
          onClick={() => setOpen(true)}
          className="rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-claimondo-navy shadow-2xl ring-1 ring-claimondo-border transition-all hover:-translate-y-0.5 hover:bg-claimondo-bg"
        >
          Rückruf
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-claimondo-navy/60 backdrop-blur-sm sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-claimondo-ondo hover:bg-claimondo-bg"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>

            {done ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <Check className="h-6 w-6 text-green-700" />
                </div>
                <h3 className="text-xl font-bold text-claimondo-navy">Wir rufen zurück</h3>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  Ein Berater meldet sich bei Ihnen — meistens in unter 15 Minuten während der Geschäftszeiten.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-claimondo-shield"
                >
                  Schließen
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-claimondo-navy">Rückruf anfordern</h3>
                  <p className="mt-1 text-sm text-claimondo-ondo">
                    0 € Beratung — wir melden uns innerhalb der Geschäftszeiten unter 15 Minuten.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="mt-1 w-full rounded-xl border border-claimondo-border bg-claimondo-bg px-4 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                    placeholder="Max Mustermann"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    Telefonnummer *
                  </label>
                  <input
                    type="tel"
                    required
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    autoComplete="tel"
                    className="mt-1 w-full rounded-xl border border-claimondo-border bg-claimondo-bg px-4 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                    placeholder="0151 …"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    Wann erreichbar?
                  </label>
                  <select
                    value={zeitfenster}
                    onChange={(e) => setZeitfenster(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-claimondo-border bg-white px-4 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                  >
                    <option>Schnellstmöglich</option>
                    <option>Heute Vormittag</option>
                    <option>Heute Nachmittag</option>
                    <option>Heute Abend</option>
                    <option>Morgen</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    Kurze Nachricht (optional)
                  </label>
                  <textarea
                    value={nachricht}
                    onChange={(e) => setNachricht(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-claimondo-border bg-claimondo-bg px-4 py-2.5 text-sm focus:border-claimondo-ondo focus:outline-none"
                    placeholder="Worum geht es?"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-claimondo-navy py-3 text-sm font-bold text-white shadow-md hover:bg-claimondo-shield disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {pending ? 'Wird gesendet…' : 'Rückruf anfordern'}
                </button>

                <p className="text-center text-[11px] text-claimondo-ondo/70">
                  Mit dem Absenden willigen Sie ein, dass wir Sie zurückrufen. Datenschutz nach DSGVO.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
