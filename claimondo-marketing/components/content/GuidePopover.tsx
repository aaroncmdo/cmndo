'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
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

// Ansprache je Themencluster des Artikels. Ein Gegenwert, der zum gerade
// gelesenen Thema passt, konvertiert erfahrungsgemaess ein Vielfaches eines
// allgemeinen (lead-magnets: "content upgrades 2-5x"). Variiert wird NUR dort,
// wo der Guide wirklich eine passende Seite hat — die Zeilen spiegeln den
// Guide-Inhalt, sie behaupten nichts Neues. Alle anderen Cluster (H1, H2, H7)
// bekommen die allgemeine Ansprache.
const ANSPRACHE: Record<string, { titel: string; text: string; band: string }> = {
  // Schadenspositionen — 21 Artikel, Guide-Seiten 2 + 5
  H3: {
    titel: 'Nutzungsausfall und Wertminderung werden am seltensten geltend gemacht.',
    text: 'Seite 2 des Guides listet jede Position mit typischer Spanne, Seite 5 die drei Wege beim Totalschaden. Kostenlos, sofort hier.',
    band: 'Jede Schadensposition mit Betrag.',
  },
  // Standard-Unfall-Szenarien — 12 Artikel, Guide-Seite 4
  H6: {
    titel: 'Am Unfallort entscheidet sich, was Sie später bekommen.',
    text: 'Die Checkliste auf Seite 4: sofort, am selben Tag, in der ersten Woche. Kostenlos, sofort hier.',
    band: 'Die Checkliste zum Abhaken.',
  },
  // Fristen — 5 Artikel, Guide-Seite 6
  H4: {
    titel: 'Fast jede Abrechnung kommt zuerst gekürzt zurück.',
    text: 'Seite 6 nimmt den vier häufigsten Textbausteinen der Versicherer die Wirkung. Kostenlos, sofort hier.',
    band: 'Was gegen Kürzungen hilft.',
  },
}
const ALLGEMEIN = {
  titel: 'Die meisten fordern weniger, als ihnen zusteht.',
  text: 'Sechs Seiten mit allem, was Sie verlangen können. Kostenlos, und Sie bekommen ihn sofort hier.',
  band: 'Sechs Seiten, was Ihnen zusteht.',
}

// Ist das ein Desktop-Schirm? Als externer Store statt useState+useEffect: der Wert
// steht damit schon beim ERSTEN Client-Render fest (kein Aufblitzen), und die
// react-hooks-Regel gegen setState im Effect wird nicht verletzt. SSR-Schnappschuss
// ist `false` — auf dem Server gibt es keinen Schirm, und "kein Dialog" ist die
// sichere Annahme.
const DESKTOP = '(min-width: 768px)'   // deckungsgleich mit Tailwinds `md:`

function desktopAbonnieren(melden: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener('change', melden)
  return () => mq.removeEventListener('change', melden)
}

function desktopLesen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches
}

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
  cluster,
}: {
  artikelSelector?: string
  /** Themencluster des Artikels (H1–H7). Steuert die Ansprache, siehe ANSPRACHE. */
  cluster?: string | null
  /**
   * Das Mobil-Band ist `fixed bottom-0`. Seiten, die bereits eine feste Leiste am
   * unteren Rand tragen (StickyCallBar auf den Ratgeber-Artikeln: `fixed bottom-4`),
   * schalten es ab — zwei Overlays uebereinander fressen sich gegenseitig die
   * Klicks (Fixed-Overlay-Klasse, zweimal real passiert). Der Guide bleibt dort
   * ueber Anker-Block und Fusszeile erreichbar.
   */
  mobilBand?: boolean
}) {
  const istDesktop = useSyncExternalStore(desktopAbonnieren, desktopLesen, () => false)
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

      // ⚠ AUF MOBIL NICHT OEFFNEN. Frueher entschied allein das CSS (`hidden md:block`)
      // darueber, ob man den Dialog SIEHT — montiert wurde er trotzdem. Der
      // Portal-Container traegt diese Klassen nicht und legte sich als
      // bildschirmfuellendes, unsichtbares `fixed`-Element ueber den Artikel: jeder
      // Klick auf den Text landete dort. Gefunden im ersten echten Prod-Smoke
      // (390x844, pointer-events: auto, ueber der H1). Live gelesen statt aus dem
      // Store, damit eine Groessenaenderung waehrend des Lesens sofort zaehlt.
      if (!window.matchMedia(DESKTOP).matches) return

      window.removeEventListener('scroll', pruefe)
      try {
        sessionStorage.setItem(SITZUNG_KEY, '1')
      } catch {
        /* Speicher blockiert: dann eben nur fuer diesen Seitenaufruf gemerkt. */
      }
      setOffen(true)
      track('guide_popover_eingeblendet', { gelesen_prozent: Math.round(gelesen * 100), cluster: cluster ?? 'allgemein' })
    }

    window.addEventListener('scroll', pruefe, { passive: true })
    return () => window.removeEventListener('scroll', pruefe)
  }, [artikelSelector, cluster])

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
  const ansprache = (cluster && ANSPRACHE[cluster]) || ALLGEMEIN

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
              <span className="text-white/70">{ansprache.band}</span>
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

      {/* ── Desktop: Modal mit zwei Feldern ──────────────────────────
          `istDesktop` statt nur CSS: sonst montiert der Portal auf Mobil einen
          unsichtbaren Vollbild-Layer, der die Klicks des Lesers frisst. Zweiter
          Riegel neben der Pruefung im Ausloeser — der Dialog darf auf Mobil weder
          geoeffnet NOCH montiert werden. */}
      {istDesktop && (
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
                  {ansprache.titel}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-base leading-relaxed text-slate-600">
                  {ansprache.text}
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
      )}
    </>
  )
}

/**
 * DER EINSTIEG AUF DEM HANDY — als Karte IM TEXTFLUSS, nicht als Overlay.
 *
 * Warum es sie braucht: das Modal oben ist `md:block`, also Desktop-only
 * (Interstitial-Risiko auf den SEO-Seiten), und das Mobil-Band ist auf genau
 * diesen Artikelseiten abgeschaltet, weil es mit der StickyCallBar um dieselbe
 * Bildschirmkante konkurriert. Damit hatte die mobile Mehrheit der Leser aus dem
 * Artikel heraus GAR KEINEN Weg zum Guide — nur Anker-Block und Fusszeile.
 *
 * Warum diese Form: eine Karte im Fluss hat keine feste Position, kollidiert
 * also mit nichts, und sie verdeckt keinen Inhalt — das Interstitial-Kriterium
 * greift nicht. Sie wird geklickt statt eingeblendet; ein klick-ausgeloester
 * Einstieg ist Selbstauswahl und konvertiert erfahrungsgemaess deutlich besser
 * als ein aufgedraengtes Formular (lead-magnets/popup-cro).
 *
 * Warum ein Link statt eines Formulars: /unfallguide traegt den vollen Pitch
 * (Inhalt, Kostenfrage, Stimmen, Fragen) und liefert den Guide sofort nach dem
 * Absenden. Das Mobil-Band geht denselben Weg — eine zweite Formular-Kopie
 * waere Duplikat ohne Gewinn.
 *
 * `guide_inline_gesehen` feuert einmal beim Sichtbarwerden. Ohne diesen Nenner
 * gaebe es spaeter nur Klicks, aber keine Rate.
 */
export function GuideInlineCta({ cluster }: { cluster?: string | null }) {
  const ansprache = (cluster && ANSPRACHE[cluster]) || ALLGEMEIN
  const karte = useRef<HTMLElement | null>(null)
  const gemeldet = useRef(false)

  useEffect(() => {
    const el = karte.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (gemeldet.current || !eintraege.some((e) => e.isIntersecting)) return
        gemeldet.current = true
        track('guide_inline_gesehen', { cluster: cluster ?? 'allgemein' })
        beobachter.disconnect()
      },
      { threshold: 0.5 },
    )
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [cluster])

  return (
    <aside
      ref={karte}
      aria-label="Unfallguide"
      className="mt-10 rounded-2xl border border-claimondo-border bg-claimondo-bg p-5 md:hidden"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">
        Kostenlos · PDF, 6 Seiten
      </p>
      <p className="mt-2 font-heading text-lg font-bold leading-snug text-claimondo-navy">
        {ansprache.titel}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{ansprache.band}</p>
      <Link
        href="/unfallguide"
        onClick={() => track('guide_inline_geklickt', { cluster: cluster ?? 'allgemein' })}
        className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-claimondo-navy px-6 text-base font-semibold text-white"
      >
        <Download className="h-5 w-5" aria-hidden />
        Unfallguide ansehen
      </Link>
    </aside>
  )
}
