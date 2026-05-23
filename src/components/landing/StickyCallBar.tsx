'use client'

import { useState, useTransition } from 'react'
import { Phone, X, Send, Check } from 'lucide-react'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

const PHONE_TEL = PHONE_E164

type Props = {
  /** Quellen-Tag damit Dispatch sieht von welcher Seite der Rückruf kam */
  quelle?: string
  /** Wenn gesetzt: persistenter WhatsApp-Button in der Sticky-Bar (Content-Pages). */
  whatsappHref?: string
}

// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Sticky-Pill mit backdrop-blur,
// rounded-full Buttons, weichen 28-32px Schatten, active:scale Tap-Feedback.
// Modal mit Glass-Backdrop + rounded-Inputs.
export function StickyCallBar({ quelle = 'Hauptseite', whatsappHref }: Props) {
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
      {/* Sticky Bar — Floating-Pill mit Glass-Backdrop */}
      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-stretch gap-2 sm:left-auto sm:right-6 sm:translate-x-0">
        <a
          href={`tel:${PHONE_TEL}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(13,27,62,0.30)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_36px_rgba(13,27,62,0.38)] active:scale-[0.97]"
        >
          <Phone className="h-4 w-4" />
          <span>Sofort anrufen</span>
          <span className="hidden font-normal opacity-75 sm:inline">{PHONE_DISPLAY}</span>
        </a>
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(37,211,102,0.34)] transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ backgroundColor: '#25D366' }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z" />
            </svg>
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-white/60 bg-white/85 px-5 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white hover:shadow-[0_12px_32px_rgba(13,27,62,0.18)] active:scale-[0.97]"
        >
          Rückruf
        </button>
      </div>

      {/* Modal — Glass-Backdrop + glassy Sheet */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-md sm:items-center"
          style={{ background: 'rgba(13,27,62,0.45)' }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl border border-white/40 bg-white/95 p-6 shadow-[0_24px_64px_rgba(13,27,62,0.30)] sm:rounded-ios-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ WebkitBackdropFilter: 'blur(24px)' }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-claimondo-ondo transition-colors hover:bg-claimondo-bg"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" />
            </button>

            {done ? (
              <div className="py-8 text-center">
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'rgba(34,160,107,0.15)' }}
                >
                  <Check className="h-6 w-6" style={{ color: 'var(--brand-success, #22A06B)' }} />
                </div>
                <h3
                  className="text-xl font-bold text-claimondo-navy"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  Wir rufen zurück
                </h3>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  Ein Berater meldet sich bei Ihnen — meistens in unter 15 Minuten während der Geschäftszeiten.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
                >
                  Schließen
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h3
                    className="text-xl font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    Rückruf anfordern
                  </h3>
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
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
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
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
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
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:outline-none"
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
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder="Worum geht es?"
                  />
                </div>

                {error && (
                  <p className="rounded-ios-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-claimondo-navy py-3.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(13,27,62,0.22)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_32px_rgba(13,27,62,0.30)] active:scale-[0.98] disabled:opacity-50"
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
