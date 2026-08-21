'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Ersetzt die 80px-Linkleiste unter der Karte (Aaron 21.08.: „so eine Bar passt
// mir nicht… freischwebende kleine Knöpfe… mobil ein Bottom-Sheet").
//
// ZWEI ZIELE, DIE SICH SONST WIDERSPRECHEN:
//
// 1. SEO — /gutachter-finden war eine Crawl-Sackgasse (#5402): sie nimmt
//    Link-Equity auf (Sitemap-priority 0.95) und gab nichts weiter. Die Leiste
//    war der Fix, verlinkte aber nur 7 von 173 Städten.
// 2. Conversion — jeder dieser Links zieht den Kunden aus dem Finder heraus,
//    also aus genau dem Werkzeug, das ihn konvertieren soll.
//
// AUFLÖSUNG: Die Links sind echte `<a href>` und stehen IMMER im
// server-gerenderten HTML — nur per CSS verborgen, NICHT `{offen && …}`.
// Damit sieht ein Crawler alle 173 Städte, ohne dass ein Klick nötig wäre.
// Für den Menschen fängt `onClick` die Navigation ab und zentriert
// stattdessen die Karte: er bleibt im Finder und sieht dort die Gutachter
// seiner Stadt. Wer die Stadtseite wirklich will, hat den „Infos"-Pfeil —
// und Mittelklick/Cmd+Klick funktioniert wie bei jedem Link.
//
// ⚠ Das Markup NICHT bedingt rendern. `{offen && <div>…</div>}` hielte die
// Links aus dem initialen HTML heraus, und der SEO-Zweck der ganzen
// Konstruktion wäre weg — unsichtbar, weil die Seite optisch identisch aussieht.

export type SprungStadt = {
  slug: string
  name: string
  bundesland: string
  lat: number
  lng: number
}

export type SprungLink = { href: string; label: string }

type Props = {
  staedte: SprungStadt[]
  ratgeber: SprungLink[]
  labels: {
    staedte: string
    ratgeber: string
    schliessen: string
    hinweis: string
    infos: string
  }
}

export function FinderSprungPanel({ staedte, ratgeber, labels }: Props) {
  const [offen, setOffen] = useState<'staedte' | 'ratgeber' | null>(null)
  const router = useRouter()

  // Karte auf die Stadt zentrieren, statt die Seite zu verlassen. Die
  // Koordinaten sind gepflegt (staedte.ts) — kein Geocoding-Roundtrip nötig.
  // `scroll: false`, damit die Seite nicht nach oben springt.
  function zentriere(stadt: SprungStadt) {
    setOffen(null)
    router.push(`/gutachter-finden?lat=${stadt.lat}&lng=${stadt.lng}&stadt=${stadt.slug}`, {
      scroll: false,
    })
  }

  const nachBundesland = staedte.reduce<Record<string, SprungStadt[]>>((acc, s) => {
    ;(acc[s.bundesland] ??= []).push(s)
    return acc
  }, {})
  const laender = Object.keys(nachBundesland).sort((a, b) => a.localeCompare(b, 'de'))

  return (
    <>
      {/* Freischwebende Knöpfe — bewusst zurückhaltend: klein, halbtransparent,
          unten links, damit sie die Karte nicht dominieren. */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-30 flex gap-2 sm:bottom-5 sm:left-5">
        {(
          [
            ['staedte', labels.staedte],
            ['ratgeber', labels.ratgeber],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOffen(offen === key ? null : key)}
            aria-expanded={offen === key}
            aria-controls={`finder-panel-${key}`}
            className="pointer-events-auto rounded-full border border-claimondo-border/70 bg-white/80 px-3 py-1.5 text-body-xs font-medium text-claimondo-shield/90 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-claimondo-navy"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Backdrop nur, wenn offen — rein visuell, trägt keine Links. */}
      <div
        aria-hidden={offen === null}
        onClick={() => setOffen(null)}
        className={`fixed inset-0 z-40 bg-claimondo-navy/20 transition-opacity duration-200 ${
          offen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {(['staedte', 'ratgeber'] as const).map((key) => (
        <div
          key={key}
          id={`finder-panel-${key}`}
          role="dialog"
          aria-modal={offen === key}
          aria-label={key === 'staedte' ? labels.staedte : labels.ratgeber}
          // Mobil Bottom-Sheet über die volle Breite, ab sm ein Panel unten
          // links. Sichtbarkeit über translate/opacity — das Markup bleibt im
          // DOM (s. Kopfkommentar).
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-ios-xl border border-claimondo-border bg-white shadow-sheet transition-transform duration-300 ease-out sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-h-[70dvh] sm:w-[24rem] sm:rounded-ios-xl ${
            offen === key ? 'translate-y-0' : 'pointer-events-none translate-y-[110%]'
          }`}
        >
          <div className="flex items-center justify-between border-b border-claimondo-border px-5 py-3">
            <p className="text-body-sm font-bold text-claimondo-navy">
              {key === 'staedte' ? labels.staedte : labels.ratgeber}
            </p>
            <button
              type="button"
              onClick={() => setOffen(null)}
              className="rounded-full px-2 py-1 text-body-xs text-claimondo-shield/70 transition hover:bg-claimondo-bg hover:text-claimondo-navy"
            >
              {labels.schliessen}
            </button>
          </div>

          <div className="overflow-y-auto overscroll-contain px-5 py-4">
            {key === 'ratgeber' ? (
              <ul className="space-y-1">
                {ratgeber.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block rounded-ios-sm px-2 py-2 text-body-sm text-claimondo-shield transition hover:bg-claimondo-bg hover:text-claimondo-navy"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mb-3 text-body-xs leading-relaxed text-claimondo-shield/70">
                  {labels.hinweis}
                </p>
                {laender.map((land) => (
                  <div key={land} className="mb-4 last:mb-0">
                    <p className="mb-1 text-body-xs font-bold uppercase tracking-[0.1em] text-claimondo-shield/50">
                      {land}
                    </p>
                    <ul>
                      {nachBundesland[land].map((s) => (
                        <li key={s.slug} className="flex items-center justify-between gap-2">
                          {/* Echter Link (Crawler folgen ihm, Mittelklick öffnet
                              die Seite) — der Klick zentriert stattdessen die
                              Karte, damit der Kunde im Finder bleibt. */}
                          <a
                            href={`/kfz-gutachter/${s.slug}`}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                              e.preventDefault()
                              zentriere(s)
                            }}
                            className="flex-1 rounded-ios-sm px-2 py-1.5 text-body-sm text-claimondo-shield transition hover:bg-claimondo-bg hover:text-claimondo-navy"
                          >
                            {s.name}
                          </a>
                          <Link
                            href={`/kfz-gutachter/${s.slug}`}
                            aria-label={`${labels.infos} ${s.name}`}
                            className="shrink-0 rounded-ios-sm px-2 py-1.5 text-body-xs text-claimondo-shield/45 transition hover:text-claimondo-ondo"
                          >
                            ↗
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
