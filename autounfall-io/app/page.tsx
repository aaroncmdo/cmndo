import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllRestPages } from '@/lib/rest'
import { JsonLd } from '@/components/JsonLd'
import { siteGraph } from '@/lib/jsonld'

// Hub-Home (WP-7) — Cluster-Übersicht. Ersetzt den WP-0-Platzhalter. Verlinkt die
// 7 Themenfeld-Pillars (data-driven aus den WP-7-Seiten), die interaktiven
// Werkzeuge (WP-4) und den Versicherer-Decoder (WP-3). STANDALONE, kein Claimondo.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

const TOOLS = [
  { href: '/unfall-assistance', title: 'Unfall-Assistance', desc: 'In 60 Sekunden zum persönlichen Plan — was jetzt zu tun ist.' },
  { href: '/rechner', title: 'Schaden-Rechner', desc: 'Nutzungsausfall, Schmerzensgeld, Totalschaden, Wertminderung & mehr.' },
  { href: '/kuerzungs-checker', title: 'Kürzungs-Checker', desc: 'Gekürzt? Wir zeigen, was Ihnen nach BGH zusteht.' },
  { href: '/unfallbericht', title: 'Unfallbericht', desc: 'Europäischer Unfallbericht — ausfüllen, drucken, als PDF.' },
  { href: '/schadenfreiheitsklasse/rechner', title: 'SF-Rückstufungs-Rechner', desc: 'Selbst zahlen oder melden? Versicherer-spezifisch geschätzt.' },
]

const PILLAR_ORDER = [
  '/unfall-was-tun',
  '/wer-hat-schuld',
  '/anspruch',
  '/reparatur',
  '/personenschaden',
  '/spezialfaelle',
  '/gutachter-ratgeber',
]

export default function HomePage() {
  const pillars = getAllRestPages().filter((p) => p.kind === 'pillar')
  const ordered = PILLAR_ORDER.map((r) => pillars.find((p) => p.route === r)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  )

  return (
    <>
      <JsonLd data={siteGraph()} />

      {/* Hero */}
      <section className="bg-au-paper-warm">
        <div className="container-narrow mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
            Unabhängige Unfall-Assistance
          </p>
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-5xl lg:text-6xl">
            Nach dem Unfall —{' '}
            <span className="font-medium italic text-au-amber">Schritt für Schritt zu Ihrem Recht.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-au-ink-soft">
            Versicherer kürzen Schadensersatz regelmäßig um 2.400 € und mehr. Wir zeigen Ihnen
            quellenbasiert, wann § 249 BGB greift und welche Fehler Sie in den ersten 24 Stunden
            vermeiden müssen.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90"
            >
              Sachverständigen anfragen
            </Link>
            <Link
              href="/unfall-assistance"
              className="inline-flex items-center gap-2 rounded-ios-md border-[1.5px] border-au-sand-dark bg-au-surface px-7 py-3.5 font-semibold text-au-ink transition-colors hover:border-au-amber hover:text-au-amber"
            >
              Unfall-Assistance starten
            </Link>
          </div>
        </div>
      </section>

      {/* Themenfelder (Pillars) */}
      <section className="container-narrow mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="mb-8">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-au-ink">
            Sieben Themenfelder. Ein Hub.
          </h2>
          <p className="mt-2 text-au-ink-soft">
            Von der Akutphase bis zum Gutachter-Ratgeber — der ganze Weg durch die Schadensregulierung.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((p) => (
            <Link
              key={p.route}
              href={p.route}
              className="group rounded-ios-md border border-au-sand-dark bg-au-surface p-6 transition-colors hover:border-au-amber"
            >
              <h3 className="font-display text-xl font-bold text-au-ink group-hover:text-au-amber-dark">
                {p.h1}
              </h3>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-au-ink-soft">
                {p.description}
              </p>
              <span className="mt-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
                Mehr erfahren →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Werkzeuge */}
      <section className="bg-au-paper-warm">
        <div className="container-narrow mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-au-ink">Werkzeuge</h2>
            <p className="mt-2 text-au-ink-soft">
              Kostenlose Rechner und Checker — ehrliche Orientierung, ohne Anmeldung.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-ios-md border border-au-sand-dark bg-au-surface p-6 transition-colors hover:border-au-amber"
              >
                <h3 className="font-display text-lg font-bold text-au-ink group-hover:text-au-amber-dark">
                  {t.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-au-ink-soft">{t.desc}</p>
              </Link>
            ))}
            <Link
              href="/versicherer-decoder"
              className="group rounded-ios-md border border-au-sand-dark bg-au-surface p-6 transition-colors hover:border-au-amber"
            >
              <h3 className="font-display text-lg font-bold text-au-ink group-hover:text-au-amber-dark">
                Versicherer-Decoder
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-au-ink-soft">
                Was Versicherer-Formulierungen wirklich bedeuten — und wie Sie reagieren.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-au-ink py-14 text-au-surface sm:py-20">
        <div className="container-narrow mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Unverschuldet verunfallt?{' '}
            <span className="font-medium italic text-au-amber-soft">Beweise sichern lassen</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-au-surface/80">
            Ein unabhängiges Gutachten dokumentiert Schaden und Hergang — die Grundlage Ihrer
            Forderung. Bei Fremdverschulden kostenfrei nach § 249 BGB.
          </p>
          <div className="mt-7">
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90"
            >
              Sachverständigen anfragen
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
