'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SITE } from '@/lib/site'
import { CLUSTER, type City } from '@/lib/cluster'
import { trackEvent } from '@/lib/tracking'

// Rueckruf-Formular (AAR-939) — schlanke Lead-Erfassung als Modal, getriggert vom
// FabStack-Button. Submit geht an die bestehende Embed-Anfrage-Pipeline
// (claimondo.de/api/anfrage-from-lp, source=kfz_gutachter_lp): Insert in
// gutachter_finder_anfragen + WhatsApp an KFZ_LP_BAILEYS_TARGET (uns) + Email an
// Dispatch + WhatsApp-Bestaetigung an den Anrufer. Kein eigenes Backend hier.
// Tracking: tool_open feuert im FabStack beim Oeffnen, form_submit hier bei Erfolg.
export function RueckrufModal({
  open,
  onClose,
  city,
}: {
  open: boolean
  onClose: () => void
  city: City
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Oeffnen: ESC schliesst, Body-Scroll sperren, erstes Feld fokussieren.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    firstFieldRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const canSubmit = vorname.trim().length >= 2 && telefon.trim().length >= 8 && !sending

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`${SITE.embedBase}/api/anfrage-from-lp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${vorname.trim()} ${nachname.trim()}`.trim(),
          telefon: telefon.trim(),
          source: 'kfz_gutachter_lp',
          cluster: CLUSTER.key,
          stadt_slug: city.slug,
          page_url: window.location.href,
          honeypot,
        }),
        keepalive: true,
      })
      if (!res.ok) {
        setError(
          res.status === 429
            ? 'Zu viele Anfragen. Bitte später erneut versuchen.'
            : 'Senden fehlgeschlagen. Bitte erneut versuchen.',
        )
        setSending(false)
        return
      }
      trackEvent('form_submit', { cluster: CLUSTER.key, city_slug: city.slug, tool: 'rueckruf' })
      setDone(true)
    } catch {
      setError('Verbindungsfehler. Bitte erneut versuchen.')
    }
    setSending(false)
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Rückruf anfordern"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green">
              <svg
                className="h-7 w-7 fill-none stroke-current"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Danke, {vorname.trim() || 'alles klar'}!</h2>
            <p className="mt-2 text-muted">
              Wir rufen Sie schnellstmöglich zurück. Sie bekommen gleich eine kurze Bestätigung per WhatsApp.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-petrol py-3 font-display font-bold text-white transition hover:-translate-y-px"
            >
              Schließen
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Rückruf anfordern</h2>
                <p className="mt-1 text-sm text-muted">
                  Wir melden uns schnellstmöglich bei Ihnen — kostenlos &amp; unverbindlich.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="-mr-2 -mt-2 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-paper"
              >
                <svg
                  className="h-5 w-5 fill-none stroke-current"
                  strokeWidth="2"
                  strokeLinecap="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              {/* Honeypot — fuer Menschen unsichtbar; fuellt ein Bot es aus, wird die Anfrage still verworfen. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                  Vorname
                  <input
                    ref={firstFieldRef}
                    type="text"
                    required
                    autoComplete="given-name"
                    value={vorname}
                    onChange={(e) => setVorname(e.target.value)}
                    className="rounded-lg border border-border bg-paper px-3 py-2.5 text-ink outline-none transition focus:border-petrol focus:ring-1 focus:ring-petrol"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                  Nachname
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={nachname}
                    onChange={(e) => setNachname(e.target.value)}
                    className="rounded-lg border border-border bg-paper px-3 py-2.5 text-ink outline-none transition focus:border-petrol focus:ring-1 focus:ring-petrol"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Telefonnummer
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="z. B. 0170 1234567"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  className="rounded-lg border border-border bg-paper px-3 py-2.5 text-ink outline-none transition focus:border-petrol focus:ring-1 focus:ring-petrol"
                />
              </label>

              {error ? (
                <p className="text-sm text-cta" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-1 w-full rounded-xl bg-cta py-3 font-display font-bold text-white transition hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {sending ? 'Wird gesendet…' : 'Rückruf anfordern'}
              </button>
              <p className="text-center text-xs text-muted">
                Mit dem Absenden stimmen Sie der Kontaktaufnahme zu.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
