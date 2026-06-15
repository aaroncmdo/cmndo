'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SITE } from '@/lib/site'
import { CLUSTER, type City } from '@/lib/cluster'
import { trackEvent, readAttribution, toE164 } from '@/lib/tracking'

// Rueckruf-Popover (AAR-939) — Bottom-Sheet, getriggert aus der mobilen Sticky-Bottom-Bar
// (#mobileStickyCall). Mobile-only (Desktop/iPad: kein Trigger, kein Render). Submit geht an
// die bestehende Embed-Anfrage-Pipeline (claimondo.de/api/anfrage-from-lp, source=kfz_gutachter_lp):
// Insert in gutachter_finder_anfragen + WhatsApp an KFZ_LP_BAILEYS_TARGET (uns) + Dispatch-Email
// + WhatsApp-Bestaetigung an den Anrufer. Kein eigenes Backend. Tracking: tool_open feuert im
// FabStack beim Oeffnen, monika_callback_request (value 25, Doc-11) hier bei Erfolg.
export function RueckrufPopover({
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
  const firstRef = useRef<HTMLInputElement>(null)

  // Oeffnen: ESC schliesst, Body-Scroll sperren, erstes Feld fokussieren (nach der Slide-Animation).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => firstRef.current?.focus(), 300)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(t)
    }
  }, [open, onClose])

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
      // Doc-11: reine Rueckrufbitte -> monika_callback_request (value 25) mit lead_id
      // (Server-Anfrage-ID = Dedupe-Transaction-ID) + phone + gclid fuer Google Ads
      // (value-based Bidding + Enhanced Conversions). lead_id nur wenn vorhanden.
      const data = (await res.json().catch(() => ({}))) as { anfrage_id?: string | null }
      const attribution = readAttribution()
      // Phone nur wenn E.164-normalisierbar in den dataLayer — identisch zum Haupt-Embed
      // (value-model.ts): kein leeres phone, sonst inkonsistente dataLayer-Bags. AAR-939.
      const phoneE164 = toE164(telefon.trim())
      const ev: Record<string, string | number | undefined> = {
        value: 25,
        currency: 'EUR',
        gclid: attribution.gclid,
        cluster: CLUSTER.key,
        stadt: city.slug,
      }
      if (phoneE164) ev.phone = phoneE164
      if (data.anfrage_id) ev.lead_id = data.anfrage_id
      trackEvent('monika_callback_request', ev)
      setDone(true)
    } catch {
      setError('Verbindungsfehler. Bitte erneut versuchen.')
    }
    setSending(false)
  }

  return (
    // z über dem Monika-Launcher (z-9999); sm:hidden = nur Mobile (Desktop/iPad ohne Rückruf).
    <div className={`fixed inset-0 z-[10000] sm:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-ink/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-3xl border-t-2 border-[var(--amber)] bg-surface px-5 pb-7 pt-3 shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Rückruf anfordern"
      >
        <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-border" />
        {done ? (
          <div className="py-3 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green">
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
            <p className="mt-1.5 text-[15px] text-muted">
              Wir rufen Sie in unter 15 Minuten zurück. Sie bekommen gleich eine kurze Bestätigung per WhatsApp.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-petrol py-3.5 font-display font-bold text-white active:scale-[.99]"
            >
              Schließen
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Rückruf anfordern</h2>
                <p className="mt-1 text-[13.5px] text-muted">
                  Wir rufen in unter 15 Min zurück — kostenlos &amp; unverbindlich.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="-mr-1 -mt-1 grid h-9 w-9 place-items-center rounded-full text-muted active:bg-paper"
              >
                <svg className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 flex flex-col gap-2.5">
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
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  ref={firstRef}
                  type="text"
                  required
                  autoComplete="given-name"
                  aria-label="Vorname"
                  placeholder="Vorname"
                  value={vorname}
                  onChange={(e) => setVorname(e.target.value)}
                  className="rounded-xl border border-border bg-paper px-3.5 py-3 text-[16px] text-ink outline-none transition focus:border-petrol focus:ring-2 focus:ring-[var(--petrol)]"
                />
                <input
                  type="text"
                  autoComplete="family-name"
                  aria-label="Nachname"
                  placeholder="Nachname"
                  value={nachname}
                  onChange={(e) => setNachname(e.target.value)}
                  className="rounded-xl border border-border bg-paper px-3.5 py-3 text-[16px] text-ink outline-none transition focus:border-petrol focus:ring-2 focus:ring-[var(--petrol)]"
                />
              </div>
              <input
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                aria-label="Telefonnummer"
                placeholder="Telefonnummer"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                className="rounded-xl border border-border bg-paper px-3.5 py-3 text-[16px] text-ink outline-none transition focus:border-petrol focus:ring-2 focus:ring-[var(--petrol)]"
              />
              {error ? (
                <p className="text-sm text-cta" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-1 w-full rounded-xl bg-cta py-3.5 font-display text-[16px] font-bold text-white transition active:scale-[.99] disabled:opacity-50"
              >
                {sending ? 'Wird gesendet…' : 'Rückruf anfordern'}
              </button>
              <p className="text-center text-[11px] text-muted">Mit dem Absenden stimmen Sie der Kontaktaufnahme zu.</p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
