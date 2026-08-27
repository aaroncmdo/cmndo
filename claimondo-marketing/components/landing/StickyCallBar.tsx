'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Phone, X, Send, Check, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { erstelleOeffentlichenRueckruf } from '@/lib/actions/public-rueckruf'
import { trackEvent } from '@/lib/analytics/track-event'
import { setUserData } from '@/lib/analytics/user-data'
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

const PHONE_TEL = PHONE_E164

type Props = {
  /** Quellen-Tag damit Dispatch sieht von welcher Seite der Rückruf kam */
  quelle?: string
  /** Wenn gesetzt: persistenter WhatsApp-Button in der Sticky-Bar (Content-Pages). */
  whatsappHref?: string
  /**
   * Ziel des mobilen "Gutachter finden"-Primaer-CTAs. Default = generischer Finder.
   * Der Makler-Hub (/m/[code]) uebergibt den ATTRIBUIERTEN Einstieg (/start/makler/<id>).
   * Ohne das klaut der auffaelligste Mobile-CTA die Makler-Attribution.
   */
  finderHref?: string
}

// 2026-05-09 Frontend-Audit: iOS-Glass-Pass — Sticky-Pill mit backdrop-blur,
// rounded-full Buttons, weichen 28-32px Schatten, active:scale Tap-Feedback.
// Modal mit Glass-Backdrop + rounded-Inputs.
export function StickyCallBar({ quelle = 'Hauptseite', whatsappHref, finderHref = '/gutachter-finden' }: Props) {
  const t = useTranslations('home')
  const tNav = useTranslations('nav')

  const zeitfensterOptions = t.raw('sticky_call.zeitfenster_options') as string[]

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [zeitfenster, setZeitfenster] = useState(zeitfensterOptions[0] ?? 'Schnellstmöglich')
  const [nachricht, setNachricht] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Am Seitenende ausblenden. Die Leiste ist `fixed` und verdeckte dort
  // Footer-Inhalt — gemessen 24.08.2026 auf vier Seiten und zwei Breiten je
  // 1 bis 6 Elemente, darunter die TELEFONNUMMER und die E-Mail-Adresse.
  // Also ausgerechnet die Kontaktwege, zu denen sie selbst führen will.
  //
  // ⚠ Platz am Seitenende zu reservieren löst das NICHT (erst versucht, wieder
  // verworfen): der Footer ist auf manchen Seiten höher als der Viewport
  // (1128 px bei 664 px Bildschirm auf /kfz-haftpflicht-schaden). Am Seitenende
  // füllt er den Bildschirm, und zusätzlicher Platz verschiebt nur, WELCHER
  // Teil des Footers unter der Leiste liegt. Auf zwei von vier Seiten wurde es
  // dadurch schlechter statt besser.
  //
  // Wer den Footer erreicht hat, braucht die schwebende CTA ohnehin nicht mehr:
  // dort stehen Telefon und E-Mail im Klartext.
  const [footerSichtbar, setFooterSichtbar] = useState(false)
  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer || typeof IntersectionObserver === 'undefined') return
    const beobachter = new IntersectionObserver(
      ([eintrag]) => setFooterSichtbar(eintrag.isIntersecting),
      { threshold: 0.01 },
    )
    beobachter.observe(footer)
    return () => beobachter.disconnect()
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await erstelleOeffentlichenRueckruf({ name, telefon, zeitfenster, nachricht, quelle })
      if (r.ok) {
        setDone(true)
        // Conversion-Event: Rückruf-Anfrage = Lead (claimondo_rueckruf). Kein
        // Server-Event in public-rueckruf → client-seitig; Consent-Mode-Modeling.
        setUserData({ name, phone: telefon })
        trackEvent('generate_lead', { currency: 'EUR', value: 0, source: 'sticky-rueckruf' })
      } else setError(r.error)
    })
  }

  return (
    <>
      {/* Sticky Bar – Floating-Pill mit Glass-Backdrop */}
      <div
        aria-hidden={footerSichtbar}
        className={`fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2 transition-opacity duration-200 sm:left-auto sm:right-6 sm:translate-x-0 ${
          footerSichtbar ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        {/* ZEILE 1 — Anruf als Primaeraktion, daneben WhatsApp.
            Aaron 25.08.: "mobil soll der Anruf primaer sein". Das dreht die
            Entscheidung vom 15.06. um, nach der "Gutachter finden" der mobile
            Primaer-CTA war (eigener navy-Button ueber der Leiste).
            Messbarer Anlass: bei 390x844 hatten "Gutachter finden" und
            "Sofort anrufen" am 24.08. EXAKT denselben Kontrast (16,03) und
            damit dieselbe wahrgenommene Prominenz — mobil gab es also gar
            keine erkennbare Primaeraktion. Jetzt traegt der Anruf die Leiste
            (navy, volle Breite, groessere Schrift), der Finder rutscht in
            Zeile 2 auf Weiss. */}
        <div className="flex items-stretch gap-2">
        <a
          href={`tel:${PHONE_TEL}`}
          data-tracking="call-sticky"
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-claimondo-navy px-5 py-4 text-base font-bold text-white shadow-[0_8px_28px_rgba(13,27,62,0.34)] transition-all duration-200 hover:bg-claimondo-shield hover:shadow-[0_12px_36px_rgba(13,27,62,0.40)] active:scale-[0.97]"
        >
          <Phone className="h-4 w-4" />
          <span>{t('sticky_call.btn_anrufen')}</span>
          <span className="font-normal opacity-75">{PHONE_DISPLAY}</span>
        </a>
        {/* Dunkle Schrift auf dem WhatsApp-Gruen, nicht weisse: weiss auf
            #25D366 ergibt 1,98:1 und verfehlt die 4,5:1 fuer normalen Text
            deutlich (am gerenderten Output gemessen, 14 von 32 Messungen).
            Navy darauf sind 8,29:1. Die Kanalfarbe bleibt unangetastet —
            WhatsApp setzt in den eigenen Chat-Bubbles ebenfalls dunkle Schrift
            auf helles Gruen; die Wiedererkennung haengt an der Flaeche, nicht
            an der Schriftfarbe. */}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_24px_rgba(37,211,102,0.34)] transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ backgroundColor: '#25D366' }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24z" />
            </svg>
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}
        </div>
        {/* ZEILE 2 — die beiden Nebenwege, sichtbar untergeordnet (Weiss statt Navy).
            Der Finder bleibt bewusst STEHEN und wird nur zurueckgestuft: ueber
            `finderHref` laeuft die Makler-Attribution (/start/makler/<id>) und
            der Ortsbezug der Stadtseiten. Ihn ganz zu entfernen haette beides
            gekappt. */}
        <div className="flex items-stretch gap-2">
        <Link
          href={finderHref}
          data-tracking="finder-sticky"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/60 bg-white/85 px-5 py-3 text-sm font-semibold text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white active:scale-[0.97] md:hidden"
        >
          <Search className="h-4 w-4" aria-hidden />
          {tNav('gutachter_finden')}
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 rounded-full border border-white/60 bg-white/85 px-5 py-3 text-sm font-semibold text-claimondo-navy shadow-[0_8px_24px_rgba(13,27,62,0.12)] backdrop-blur-md transition-all duration-200 hover:bg-white hover:shadow-[0_12px_32px_rgba(13,27,62,0.18)] active:scale-[0.97]"
        >
          {t('sticky_call.btn_rueckruf')}
        </button>
        </div>
      </div>

      {/* Modal – Glass-Backdrop + glassy Sheet */}
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
              aria-label={t('sticky_call.close_aria')}
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
                  {t('sticky_call.success_heading')}
                </h3>
                <p className="mt-2 text-sm text-claimondo-ondo">
                  {t('sticky_call.success_sub')}
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex rounded-full bg-claimondo-navy px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
                >
                  {t('sticky_call.btn_schliessen')}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h3
                    className="text-xl font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {t('sticky_call.modal_heading')}
                  </h3>
                  <p className="mt-1 text-sm text-claimondo-ondo">
                    {t('sticky_call.modal_sub')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_name')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_telefon')}
                  </label>
                  <input
                    type="tel"
                    required
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    autoComplete="tel"
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_telefon')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_zeitfenster')}
                  </label>
                  <select
                    value={zeitfenster}
                    onChange={(e) => setZeitfenster(e.target.value)}
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:outline-none"
                  >
                    {zeitfensterOptions.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                    {t('sticky_call.label_nachricht')}
                  </label>
                  <textarea
                    value={nachricht}
                    onChange={(e) => setNachricht(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg/80 px-4 py-2.5 text-sm transition-colors focus:border-claimondo-ondo focus:bg-white focus:outline-none"
                    placeholder={t('sticky_call.placeholder_nachricht')}
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
                  {pending ? t('sticky_call.btn_submit_pending') : t('sticky_call.btn_submit')}
                </button>

                <p className="text-center text-[11px] text-claimondo-ondo/70">
                  {t('sticky_call.datenschutz_note')}
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
