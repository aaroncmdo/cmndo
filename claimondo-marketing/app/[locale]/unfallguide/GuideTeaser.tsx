'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// Die zweite Seite des Guides als Vorschau, mit Freischaltung.
//
// VORBILD: bundesmann-invest.de (Aaron, 06.09.: „der Freischalt-Mechanismus mit
// dem verschwommenen Guide ist super"). Uebernommen ist die Idee — zwei
// deckungsgleiche Bilder, eine gerechnete Schnittkante, eine Zieh-Geste.
//
// ⭐ BEWUSST NICHT UEBERNOMMEN: das Overlay.
// Die Referenz oeffnet einen Dialog. Hier tauscht der Teaser AN ORT UND STELLE
// gegen das Formular. Drei Gruende, alle belegbar:
//
//   1. `impeccable` fuehrt „Modal as first thought" unter den absoluten
//      Verboten und verlangt, vorher die Offenlegung im Fluss auszuschoepfen.
//   2. PRODUCT.md: „eine Entscheidung pro Bildschirm" und „erst ordnen, dann
//      fordern". Ein Tausch an derselben Stelle erfuellt beides woertlich.
//   3. Am 06.09. hat in genau dieser Lane ein Portal-Container auf 63 Artikeln
//      die Klicks gefressen. Eine Bauform ohne Overlay kann diese Klasse nicht
//      haben — und sie braucht weder Fokusfalle noch Scroll-Sperre.
//
// ⭐ NUR AUF DEM TELEFON (Aaron 06.09.2026: „das soll nur fuer die mobile
// Version gelten, weil die Anordnung auf der Desktop-Version noch nicht gut
// ist"). Ab lg entfaellt der Teaser, das Formular steht direkt in der
// Heldenzeile. Die Weiche liegt als Media-Query in globals.css — NICHT als
// gemessene Fensterbreite: die ist beim Serverrendern unbekannt, und ein
// nachtraegliches Umschalten im Browser ist genau der Hydrations-Fehler #418,
// der den Nachtlauf vom 06.08. bis 27.08. rot gehalten hat. Sie steht dort und
// nicht als `lg:hidden` am Knopf, weil `.guide-teaser` ausserhalb jedes @layer
// liegt und ungeschichtetes CSS in Tailwind v4 IMMER die utilities-Schicht
// schlaegt — ein `lg:hidden` waere wirkungslos geblieben.
//
// Deshalb haengt `children` IMMER genau einmal im Baum — auf dem Telefon bis
// zur Freischaltung nur `display:none`, statt zwei Fassungen nebeneinander.
// Zwei gemountete Formulare waeren doppelte Felder und ein zweites Ziel fuer
// die automatische Ausfuellhilfe.
//
// Die Geste ist ein ANGEBOT, keine Bedingung: ein Tipp irgendwo auf das Cover
// oeffnet ebenfalls, und in der klebenden Leiste liegt ein zweiter Weg. Wer die
// Geste nicht sieht oder mit der Tastatur arbeitet, bleibt nicht haengen.

/** Ab wo die Geste zaehlt. Nicht 1: wer zwei Drittel gezogen hat, hat sie gemacht. */
const SCHWELLE = 0.62

export function GuideTeaser({ children }: { children: React.ReactNode }) {
  const t = useTranslations('unfallguide_formular')
  const [offen, setOffen] = useState(false)
  const [zug, setZug] = useState(0)
  const ziehen = useRef<{ start: number; breite: number; bewegt: boolean; rtl: boolean } | null>(null)
  const formularRef = useRef<HTMLDivElement>(null)

  // Nach dem Tausch gehoert der Fokus dorthin, wo es weitergeht. Sonst steht ein
  // Tastatur- oder Screenreader-Nutzer weiter auf einem Knopf, den es nicht mehr gibt.
  useEffect(() => {
    if (!offen) return
    const feld = formularRef.current?.querySelector<HTMLElement>('input:not([type="hidden"])')
    feld?.focus()
  }, [offen])

  function oeffne(weg: 'geste' | 'tipp') {
    setOffen(true)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'guide_teaser_freigeschaltet', { source: 'unfallguide-lp', weg })
    }
  }

  function beginn(e: React.PointerEvent<HTMLSpanElement>) {
    const bahn = e.currentTarget.parentElement
    if (!bahn) return
    const r = bahn.getBoundingClientRect()
    ziehen.current = {
      start: e.clientX,
      breite: Math.max(1, r.width - 56),
      bewegt: false,
      // Live gelesen statt aus einem Zustand: rechtslaeufig zieht man nach links,
      // und die Richtung kann sich waehrend der Sitzung aendern (Sprachwechsel).
      rtl: document.documentElement.dir === 'rtl',
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function bewegung(e: React.PointerEvent<HTMLSpanElement>) {
    const z = ziehen.current
    if (!z) return
    const weg = z.rtl ? z.start - e.clientX : e.clientX - z.start
    if (weg > 4) z.bewegt = true
    setZug(Math.min(1, Math.max(0, weg) / z.breite))
  }

  function ende(e: React.PointerEvent<HTMLSpanElement>) {
    const z = ziehen.current
    ziehen.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* Zeiger schon weg — egal */
    }
    if (!z) return
    const weg = z.rtl ? z.start - e.clientX : e.clientX - z.start
    if (Math.max(0, weg) / z.breite >= SCHWELLE) {
      setZug(1)
      oeffne('geste')
    } else {
      setZug(0) // federt zurueck
    }
  }

  return (
    <>
      {!offen && (
        <button
          type="button"
          onClick={() => {
            // Nach einem echten Zug nicht noch einmal oeffnen.
            if (ziehen.current?.bewegt) return
            oeffne('tipp')
          }}
          aria-label={t('teaser_aria')}
          className="guide-teaser"
        >
          <span className="guide-teaser-stack">
            {/* Bewusst <img> statt next/image: beide Ebenen muessen pixelgenau
                deckungsgleich liegen, und die Dateien sind bereits von Hand
                optimiert (scharf q92, unscharf q70). Der Optimizer wuerde sie neu
                codieren und die Deckung ist dann nicht mehr garantiert. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/guide-teaser-unscharf.webp"
              alt=""
              aria-hidden="true"
              className="guide-teaser-layer"
              width={1000}
              height={1415}
              loading="lazy"
              decoding="async"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/guide-teaser-scharf.webp"
              alt=""
              aria-hidden="true"
              className="guide-teaser-layer guide-teaser-sharp"
              width={1000}
              height={1415}
              loading="lazy"
              decoding="async"
            />

            <span aria-hidden="true" className="guide-teaser-veil" />

            <span aria-hidden="true" className="guide-teaser-unlock">
              <span className="guide-teaser-hint">{t('teaser_hinweis')}</span>
              {/* `--zug` steht auf der BAHN, damit Knopf UND Beschriftung ihn
                  erben. Auf dem Knopf allein saehe die Beschriftung ihn nie. */}
              <span className="guide-teaser-rail" style={{ ['--zug' as string]: String(zug) }}>
                <span
                  className="guide-teaser-knob"
                  onPointerDown={beginn}
                  onPointerMove={bewegung}
                  onPointerUp={ende}
                  onPointerCancel={ende}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
                  </svg>
                </span>
                <span className="guide-teaser-label">{t('teaser_regler')}</span>
              </span>
            </span>
          </span>
        </button>
      )}

      {/* Immer genau einmal gemountet. Auf dem Telefon bis zur Freischaltung
          `display:none`, ab lg dauerhaft sichtbar — dort gibt es den Teaser
          nicht. */}
      <div ref={formularRef} className={offen ? undefined : 'hidden lg:block'}>
        {children}
      </div>
    </>
  )
}
