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
   * Notausschalter fuer das Mobil-Band. Seit 06.09.2026 normalerweise NICHT noetig:
   * das Band legt sich zur Laufzeit UEBER eine bereits vorhandene Leiste am unteren
   * Rand (siehe `bandAbstand` unten), statt sich mit ihr zu stapeln. Vorher galt hier
   * "abschalten, wenn die Seite eine StickyCallBar traegt" — und weil das beim
   * Aufmachen des Bands niemand tat, lag es auf ALLEN Ratgeber-Artikeln unter der
   * Kontaktleiste: "Ansehen" und "Schliessen" waren auf dem Handy nicht anklickbar
   * (auf prod gemessen, 3 von 8 Bedienelementen verdeckt).
   */
  mobilBand?: boolean
}) {
  const istDesktop = useSyncExternalStore(desktopAbonnieren, desktopLesen, () => false)
  const [offen, setOffen] = useState(false)
  const [ergebnis, setErgebnis] = useState<GuideLeadErgebnis | null>(null)
  const [laeuft, starte] = useTransition()
  const begonnen = useRef(false)
  /**
   * Abstand des Mobil-Bands zum unteren Rand, in Pixeln.
   *
   * WARUM ZUR LAUFZEIT GEMESSEN UND NICHT FEST VERDRAHTET: das Band ist `fixed`,
   * und die Seiten, auf denen es laeuft, tragen bereits die `StickyCallBar` —
   * ebenfalls `fixed`, ebenfalls `z-40`. Bei gleichem z-Index gewinnt das spaeter
   * im DOM stehende Element, und das ist die Kontaktleiste. Ergebnis auf prod
   * (390x844, Ratgeber-Artikel): das Band lag DARUNTER, "Ansehen" und
   * "Hinweis schliessen" waren nicht anklickbar.
   *
   * Ein hoeherer z-Index waere der falsche Fix — dann fraesse das Band die Klicks
   * der Kontaktleiste, also "Sofort anrufen". Beide sollen bedienbar sein, also
   * setzt sich das Band UEBER die vorhandene Leiste, statt sie zu ueberdecken.
   *
   * Gemessen wird generisch (jede fixe Leiste am unteren Rand zaehlt), damit der
   * Vertrag auch haelt, wenn eine Seite eine andere Leiste mitbringt.
   */
  const [bandAbstand, setBandAbstand] = useState(0)

  useEffect(() => {
    if (!darfZeigen()) return

    // Messgrundlage: der Artikel, sonst der Seiteninhalt.
    //
    // WARUM DER RUECKFALL: `artikelSelector` steht per Default auf 'article' —
    // das passt fuer Ratgeber, Wissen und Decoder. Die uebrigen Marketing-Seiten
    // sind aber aus <section>-Bloecken gebaute Landingpages OHNE <article> und
    // ohne <main>; dort fand der Selektor nichts, und die Funktion kehrte hier
    // zurueck: das Popover erschien NIE — still, ohne Fehler, ohne Log. Genau so
    // waere jede neue Seite stillschweigend leer ausgegangen.
    //
    // Der Rueckfall macht die Einbindung wieder zu dem, wonach sie aussieht:
    // <GuidePopover /> genuegt. Wer praeziser messen will, gibt weiterhin einen
    // eigenen Selektor mit (die Stadtseite tut das ueber #stadtseite-inhalt).
    // ⚠ Als letzte Stufe das HOECHSTE direkte Kind von <body>, nicht das erste:
    // auf mehreren Seiten ist `body.firstElementChild` ein leeres <div> (Portal-
    // bzw. Script-Container) mit **offsetHeight 0**. Damit bleibt `gelesen`
    // rechnerisch 0, die Schwelle wird nie erreicht und das Popover erscheint
    // nie — gemessen auf /kfz-gutachter/ablauf: h=0px, gelesen=0.000 nach
    // 2.980px Scroll, waehrend /e-auto-gutachter ueber <main> (h=2353px) bei
    // 0.278 sauber ausloest.
    const hoechstesKind = () => {
      let beste: HTMLElement | null = null
      for (const kind of Array.from(document.body.children) as HTMLElement[]) {
        if (!beste || kind.offsetHeight > beste.offsetHeight) beste = kind
      }
      return beste && beste.offsetHeight > 0 ? beste : null
    }
    const artikel =
      document.querySelector<HTMLElement>(artikelSelector) ??
      document.querySelector<HTMLElement>('main') ??
      hoechstesKind()
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

      // Hier stand bis 06.09.2026 ein zweiter Mobil-Riegel (`if (!matchMedia(DESKTOP)) return`).
      // Er ist ENTFERNT, und zwar bewusst: gegen den unsichtbaren Vollbild-Layer schuetzt der
      // Riegel im RENDER (`{istDesktop && <DialogPrimitive.Root …>}`, s. u.) — dort montiert der
      // Portal auf Mobil gar nicht erst. Der Riegel hier verhinderte zusaetzlich das mobile BAND,
      // und das ist kein Overlay, sondern eine Leiste am unteren Rand mit `md:hidden`; sie kann
      // den Klickfresser gar nicht ausloesen. Folge des alten Zustands: auf dem Handy kam nie
      // etwas — gemessen auf prod, bis 84 % Lese-Anteil gescrollt (Schwelle 15 %), nichts.
      // Aaron 06.09.: mobiles Band aufmachen.
      window.removeEventListener('scroll', pruefe)
      try {
        sessionStorage.setItem(SITZUNG_KEY, '1')
      } catch {
        /* Speicher blockiert: dann eben nur fuer diesen Seitenaufruf gemerkt. */
      }
      setOffen(true)
      // `variante` trennt die beiden Oberflaechen in der Messung — Band und Dialog sind
      // verschiedene Dinge und duerfen nicht in einer Zahl verschwimmen.
      track('guide_popover_eingeblendet', {
        gelesen_prozent: Math.round(gelesen * 100),
        cluster: cluster ?? 'allgemein',
        variante: window.matchMedia(DESKTOP).matches ? 'desktop-dialog' : 'mobil-band',
      })
    }

    window.addEventListener('scroll', pruefe, { passive: true })
    return () => window.removeEventListener('scroll', pruefe)
  }, [artikelSelector, cluster])

  // Platz fuer eine bereits vorhandene Leiste am unteren Rand freimessen.
  // Laeuft erst, wenn das Band wirklich sichtbar ist — vorher gibt es nichts zu
  // positionieren, und der Beobachter soll nicht auf jeder Seite mitlaufen.
  useEffect(() => {
    if (!offen || !mobilBand) return

    // Die Leisten, die wir zuletzt gefunden haben — der Beobachter haengt an
    // IHNEN, nicht an <body>: eine `fixed` Leiste, die ein- oder ausklappt,
    // aendert die Body-Hoehe NICHT. Ein Beobachter auf <body> bekaeme davon
    // nichts mit, und das Band bliebe in der Luft haengen.
    let beobachtet: HTMLElement[] = []

    const messen = () => {
      const viewport = window.innerHeight
      const mindestBreite = window.innerWidth * 0.5
      const gefunden: HTMLElement[] = []
      let hoechste = 0
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        // Sich selbst nie mitmessen, sonst schiebt sich das Band Schritt fuer
        // Schritt aus dem Bild.
        if (el.dataset.guideBand === '1') continue
        // Geometrie ZUERST: `getBoundingClientRect` ist deutlich billiger als
        // `getComputedStyle`, und die Form schliesst die grosse Mehrheit der
        // Knoten sofort aus. Nur echte Leisten bleiben uebrig: breit, am unteren
        // Rand, und nicht die Vollflaeche eines Modal-Hintergrunds (die wuerde
        // das Band sonst ans Seitenende schieben).
        const box = el.getBoundingClientRect()
        if (box.height < 24 || box.height > 320) continue
        if (box.width < mindestBreite) continue
        if (box.bottom < viewport - 24 || box.top > viewport) continue
        const stil = getComputedStyle(el)
        if (stil.position !== 'fixed' || stil.display === 'none' || stil.visibility === 'hidden') continue
        if (el.closest('[data-guide-band="1"]')) continue
        gefunden.push(el)
        hoechste = Math.max(hoechste, viewport - box.top)
      }

      // Beobachtung auf die gerade gefundenen Leisten umhaengen. Der Vergleich
      // verhindert, dass jedes Messen den Beobachter neu verdrahtet — sonst
      // loeste er sich selbst wieder aus.
      if (
        beobachter &&
        (gefunden.length !== beobachtet.length || gefunden.some((el, i) => el !== beobachtet[i]))
      ) {
        beobachter.disconnect()
        for (const el of gefunden) beobachter.observe(el)
        beobachtet = gefunden
      }

      // Kein Rand, wenn nichts da ist: dann sitzt das Band wie bisher unten.
      setBandAbstand(hoechste > 0 ? Math.round(hoechste) : 0)
    }

    // Auf einen Frame zusammenfassen: eine Hoehenaenderung der Leiste kann
    // mehrere Beobachter-Aufrufe ausloesen. Ohne Drosselung liefe die Schleife
    // dabei mehrfach pro Frame.
    let angefordert = 0
    const messenGedrosselt = () => {
      if (angefordert) return
      angefordert = requestAnimationFrame(() => {
        angefordert = 0
        messen()
      })
    }

    const beobachter =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(messenGedrosselt) : null
    messen()
    window.addEventListener('resize', messenGedrosselt)
    // BEWUSST KEIN MutationObserver auf <body>: mit `subtree: true` feuerte er
    // bei jedem React-Render und triebe die Schleife dauernd an. Die
    // Kontaktleiste ist montiert, lange bevor das Band bei 15 % Lesetiefe
    // erscheint — nachtraeglich auftauchende Leisten sind kein reales Szenario.
    return () => {
      if (angefordert) cancelAnimationFrame(angefordert)
      beobachter?.disconnect()
      window.removeEventListener('resize', messenGedrosselt)
    }
  }, [offen, mobilBand])

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
          data-guide-band="1"
          // `bottom` kommt aus der Messung oben, nicht aus einer Utility-Klasse:
          // die vorhandene Leiste ist unterschiedlich hoch (ein-/ausgeklappt).
          style={{ bottom: bandAbstand }}
          className="fixed inset-x-0 z-40 border-t border-white/15 bg-claimondo-navy px-4 py-3 md:hidden motion-safe:animate-in motion-safe:slide-in-from-bottom-4"
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
