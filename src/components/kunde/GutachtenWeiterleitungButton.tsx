// AAR-432: Opt-in Button für den Kunden, sich das Gutachten per E-Mail an eine
// beliebige Adresse (eigene, Werkstatt, Vertrauensperson) schicken zu lassen.
// Öffnet ein schlankes Modal für Email-Input, POSTed an
// /api/kunde/gutachten/weiterleiten. 48h Magic-Link + Rate-Limit 3x/24h.

'use client'

import { useState, useTransition } from 'react'

type Props = {
  fallId: string
  /** Default für die E-Mail-Adresse (üblicherweise user.email) — wird vorgefüllt. */
  defaultEmail?: string | null
}

export default function GutachtenWeiterleitungButton({ fallId, defaultEmail }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [fehlerText, setFehlerText] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onClose() {
    setOpen(false)
    setStatus('idle')
    setFehlerText(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFehlerText(null)
    setStatus('idle')
    startTransition(async () => {
      try {
        const res = await fetch('/api/kunde/gutachten/weiterleiten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fall_id: fallId, empfaenger_email: email.trim() }),
        })
        const body = await res.json().catch(() => ({ success: false, error: 'Ungültige Antwort' }))
        if (body?.success) {
          setStatus('success')
        } else {
          setStatus('error')
          setFehlerText(body?.error ?? 'Unbekannter Fehler.')
        }
      } catch (err) {
        console.error('[GutachtenWeiterleitung] fetch error:', err)
        setStatus('error')
        setFehlerText('Netzwerkfehler. Bitte erneut versuchen.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-medium rounded-md px-3 py-1.5 border transition-colors"
        style={{
          borderColor: 'var(--brand-border-strong, #d1d5db)',
          color: 'var(--brand-text-primary, #0D1B3E)',
          background: 'var(--brand-surface, #ffffff)',
        }}
      >
        Gutachten per E-Mail zusenden
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Gutachten per E-Mail zusenden"
          onClick={onClose}
        >
          <div
            className="w-full max-w-md rounded-xl shadow-lg p-5"
            style={{ background: 'var(--brand-surface, #ffffff)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-base font-semibold mb-1"
              style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
            >
              Gutachten per E-Mail zusenden
            </h2>
            <p
              className="text-xs mb-4"
              style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
            >
              Sie erhalten einen geschützten Download-Link, der 48 Stunden gültig ist.
              Maximal 3 Anfragen pro Fall und Tag.
            </p>

            {status === 'success' ? (
              <div
                className="rounded-md p-3 text-sm"
                style={{
                  background: 'var(--brand-success-soft, #ecfdf5)',
                  color: 'var(--brand-success, #065f46)',
                }}
              >
                E-Mail wurde versendet. Bitte prüfen Sie auch den Spam-Ordner.
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium underline"
                    onClick={onClose}
                  >
                    Schließen
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <label className="block">
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
                  >
                    Empfänger-E-Mail
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ihre-email@beispiel.de"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    style={{
                      borderColor: 'var(--brand-border, #d1d5db)',
                      background: 'var(--brand-surface, #ffffff)',
                      color: 'var(--brand-text-primary, #0D1B3E)',
                    }}
                  />
                </label>

                {fehlerText && (
                  <p
                    className="text-xs"
                    style={{ color: 'var(--brand-danger, #dc2626)' }}
                  >
                    {fehlerText}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-sm px-3 py-1.5 rounded-md"
                    style={{ color: 'var(--brand-text-secondary, #4b5563)' }}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !email}
                    className="text-sm font-medium px-3 py-1.5 rounded-md disabled:opacity-60"
                    style={{
                      background: 'var(--brand-primary, #0D1B3E)',
                      color: 'var(--brand-text-on-primary, #ffffff)',
                    }}
                  >
                    {isPending ? 'Wird versendet…' : 'Link senden'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
