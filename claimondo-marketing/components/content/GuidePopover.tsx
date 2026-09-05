'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import Link from 'next/link'
import { X, Download, Check, ArrowRight } from 'lucide-react'
import { fordereUnfallguideAn } from '@/app/[locale]/unfallguide/actions'
import type { GuideLeadErgebnis } from '@/app/[locale]/unfallguide/constants'

// Guide-Angebot auf den Ratgeber-Seiten.
//
// ZWEI FLAECHEN, NICHT EINE — und das ist die wichtigste Entscheidung hier:
//
//   Desktop  → Modal bei 15 % Artikeltext, mit zwei Feldern.
//   Mobil    → KEIN Overlay, sondern ein schmales Band am unteren Rand, das
//              auf /unfallguide fuehrt.
//
// Grund: Google wertet "intrusive interstitials" auf Mobilgeraeten ab —
// Inhalt, der beim Lesen von einem Overlay verdeckt wird. Die Ratgeber-Seiten
// sind die SEO-Flaeche, auf der rund 2.700 der 4.600 monatlichen Besuche
// landen. Ein zentriertes Modal wuerde dort genau die Seiten gefaehrden, die
// den Verkehr tragen. Ein dismissbares Band ist ein Banner, kein Interstitial.
//
// GEMESSEN WIRD GEGEN DEN ARTIKEL, NICHT GEGEN DAS DOKUMENT. 15 % von
// `document.scrollHeight` ist etwas anderes als 15 % des Textes: Navigation,
// Kommentare, verwandte Beitraege und Fusszeile zaehlen dort mit. Der Trigger
// haengt am `<article>`-Element.
//
// NUR BEIM RUNTERSCROLLEN. Ohne Richtungspruefung loest ein Seitenaufruf mit
// Anker (#abschnitt) sofort aus, weil die Seite bereits weit unten startet.
// Dieselbe Korrektur hat die Ads-Landeseite am 20.05.2026 bekommen.

const TRIGGER_ANTEIL = 0.15
const SITZUNG_KEY = 'claimondo:guide-popover:gezeigt'
const ABLEHNUNG_KEY = 'claimondo:guide-popover:abgelehnt-bis'
const ERLEDIGT_KEY = 'claimondo:guide-popover:erledigt'
const RUHE_TAGE = 30

function track(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('event', name, { source: 'guide-popover', ...params })
}

function darfZeigen(): boolean {
  try {
    if (localStorage.getItem(ERLEDIGT_KEY)) return false
    const bis = localStorage.getItem(ABLEHNUNG_KEY)
    if (bis && Date.now() < Number(bis)) return false
    if (sessionStorage.getItem(SITZUNG_KEY)) return false
  } catch {
    // Privates Fenster oder blockierter Speicher: dann lieber einmal zeigen
    // als gar nicht. Ein Fehler beim Lesen darf das Angebot nicht abschalten.
  }
  return true
}

export function GuidePopover({
  artikelSelector = 'article',
  mobilBand = true,
}: {
  artikelSelector?: string
  /**
   * Das Mobil-Band ist `fixed bottom-0`. Seiten, die bereits eine feste Leiste am
   * unteren Rand tragen (StickyCallBar auf den Ratgeber-Artikeln: `fixed bottom-4`),
   * schalten es ab — zwei Overlays uebereinander fressen sich gegenseitig die
   * Klicks (Fixed-Overlay-Klasse, zweimal real passiert). Der Guide bleibt dort
   * ueber Anker-Block und Fusszeile erreichbar.
   */
  mobilBand?: boolean
}) {
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<GuideLeadErgebnis | null>(null)
  const [laeuft, starte] = useTransition()
  const begonnen = useRef(false)

  useEffect(() => {
    if (!darfZeigen()) return

    const artikel = document.querySelector<HTMLElement>(artikelSelector)
    if (!artikel) return

    let letztesY = window.scrollY

    const pruefe = () => {
      const y = window.scrollY
      const runter = y > letztesY
      letztesY = y

      // Wie weit ist der Artikel am oberen Rand vorbeigelaufen?
      const box = artikel.getBoundingClientRect()
      const gelesen = -box.top / Math.max(artikel.offsetHeight, 1)
      if (!runter || gelesen < TRIGGER_ANTEIL) return

      window.removeEventListener('scroll', pruefe)
      try {
        sessionStorage.setItem(SITZUNG_KEY, '1')
      } catch {
        /* Speicher blockiert: dann eben nur fuer diesen Seitenaufruf gemerkt. */
      }
      setOffen(true)
      track('guide_popover_eingeblendet', { gelesen_prozent: Math.round(gelesen * 100) })
    }

    window.addEventListener('scroll', pruefe, { passive: true })
    return () => window.removeEventListener('scroll', pruefe)
  }, [artikelSelector])

  const schliessen = (grund: 'weggeklickt' | 'erledigt') => {
    setOffen(false)
    try {
      if (grund === 'erledigt') localStorage.setItem(ERLEDIGT_KEY, '1')
      else localStorage.setItem(ABLEHNUNG_KEY, String(Date.now() + RUHE_TAGE * 864e5))
    } catch {
      /* ohne Speicher kein Gedaechtnis — die Sitzungssperre greift trotzdem. */
    }
    if (grund === 'weggeklickt') track('guide_popover_weggeklickt')
  }

  const guidePfad = ergebnis?.ok ? ergebnis.guidePfad : (ergebnis?.guidePfad ?? null)

  return (
    <>
      {/* ── Mobil: Band, kein Overlay ──────────────────────────────── */}
      {offen && mobilBand && (
        <div
          role="region"
          aria-label="Unfallguide"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-claimondo-navy px-4 py-3 md:hidden motion-safe:animate-in motion-safe:slide-in-from-bottom-4"
        >
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm leading-snug text-white">
              <span className="font-semibold">Unfallguide, kostenlos.</span>{' '}
              <span className="text-white/70">Sechs Seiten, was Ihnen zusteht.</span>
            </p>
            <Link
              href="/unfallguide"
              onClick={() => track('guide_popover_band_geklickt')}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-claimondo-light-blue px-4 text-sm font-bold text-claimondo-navy"
            >
              Ansehen
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => schliessen('weggeklickt')}
              aria-label="Hinweis schließen"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-white/60"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* ── Desktop: Modal mit zwei Feldern ────────────────────────── */}
      <DialogPrimitive.Root
        open={offen}
        onOpenChange={(o) => {
          if (!o) schliessen('weggeklickt')
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 hidden bg-claimondo-navy/60 backdrop-blur-sm md:block" />
          <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 hidden w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-7 shadow-2xl outline-none md:block">
            <DialogPrimitive.Close
              aria-label="Schließen"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-claimondo-navy"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>

            {guidePfad ? (
              <div>
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy">
                  <Check className="h-6 w-6 text-white" aria-hidden />
                </span>
                <DialogPrimitive.Title className="font-heading text-xl font-bold text-claimondo-navy">
                  Ihr Unfallguide steht bereit.
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-base leading-relaxed text-slate-600">
                  {ergebnis?.ok
                    ? 'Wir rufen Sie zwischen 8 und 20 Uhr zurück.'
                    : ergebnis?.ok === false
                      ? ergebnis.error
                      : null}
                </DialogPrimitive.Description>
                <a
                  href={guidePfad}
                  download
                  onClick={() => {
                    track('guide_popover_heruntergeladen')
                    schliessen('erledigt')
                  }}
                  className="mt-6 inline-flex min-h-[52px] items-center gap-3 rounded-xl bg-claimondo-navy px-6 text-base font-semibold text-white hover:bg-claimondo-navy/90"
                >
                  <Download className="h-5 w-5" aria-hidden />
                  Guide öffnen (PDF, 6 Seiten)
                </a>
              </div>
            ) : (
              <form
                action={(fd) => {
                  track('guide_popover_abgeschickt')
                  starte(async () => {
                    const r = await fordereUnfallguideAn(fd)
                    if (!r.ok) track('guide_popover_fehler', { grund: r.feld ?? 'server' })
                    setErgebnis(r)
                  })
                }}
                onFocus={() => {
                  if (begonnen.current) return
                  begonnen.current = true
                  track('guide_popover_begonnen')
                }}
              >
                <DialogPrimitive.Title className="max-w-sm font-heading text-xl font-bold leading-snug text-claimondo-navy">
                  Die meisten fordern weniger, als ihnen zusteht.
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-base leading-relaxed text-slate-600">
                  Sechs Seiten mit allem, was Sie verlangen können. Kostenlos, und Sie bekommen ihn
                  sofort hier.
                </DialogPrimitive.Description>

                <div className="mt-5 space-y-3">
                  <div>
                    <label
                      htmlFor="pop-name"
                      className="block text-sm font-semibold text-claimondo-navy"
                    >
                      Ihr Name
                    </label>
                    <input
                      id="pop-name"
                      name="name"
                      required
                      autoComplete="name"
                      className="mt-1 block min-h-[48px] w-full rounded-xl border border-claimondo-border px-4 text-base text-claimondo-navy"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pop-tel"
                      className="block text-sm font-semibold text-claimondo-navy"
                    >
                      Telefonnummer
                    </label>
                    <input
                      id="pop-tel"
                      name="telefon"
                      type="tel"
                      inputMode="tel"
                      required
                      autoComplete="tel"
                      className="mt-1 block min-h-[48px] w-full rounded-xl border border-claimondo-border px-4 text-base text-claimondo-navy"
                    />
                  </div>
                </div>

                <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
                  <input
                    type="checkbox"
                    name="einwilligung"
                    value="ja"
                    required
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-claimondo-border"
                  />
                  <span>
                    Claimondo darf mich zu meinem Unfall telefonisch und per WhatsApp kontaktieren.
                  </span>
                </label>

                {ergebnis?.ok === false && !ergebnis.guidePfad && (
                  <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                    {ergebnis.error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={laeuft}
                  className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-claimondo-navy px-6 text-base font-semibold text-white hover:bg-claimondo-navy/90 disabled:opacity-70"
                >
                  <Download className="h-5 w-5" aria-hidden />
                  {laeuft ? 'Einen Moment …' : 'Guide jetzt lesen'}
                </button>

                <button
                  type="button"
                  onClick={() => schliessen('weggeklickt')}
                  className="mt-3 w-full text-sm text-slate-500 hover:text-claimondo-navy"
                >
                  Später
                </button>
              </form>
            )}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
