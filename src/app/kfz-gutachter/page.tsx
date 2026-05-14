import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, MapPin, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'
import { STAEDTE } from './staedte'

export const metadata: Metadata = {
  title: 'Kfz-Gutachter finden — Unabhängig, schnell, kostenfrei',
  description:
    'Unabhängige DAT-zertifizierte Kfz-Sachverständige für Unfallschäden bundesweit. Partner aus dem öffentlichen DAT-Verzeichnis, Termin < 48 h, 0 € für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
  keywords: [
    'Kfz-Gutachter',
    'Unfallgutachter',
    'unabhängiger Sachverständiger',
    'DAT-Experte',
    'Schadensgutachten',
    'BVSK-Honorartabelle',
    'Wertminderung berechnen',
    'Sicherungsabtretung §164 BGB',
  ],
  alternates: { canonical: '/kfz-gutachter' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter`,
    title: 'Kfz-Gutachter finden — Unabhängig, schnell, kostenfrei',
    description: 'DAT-Expert-Partner aus dem öffentlichen DAT-Verzeichnis · Termin <48h · 0 € für Geschädigte nach §249 BGB',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachter finden' }],
  },
}

const TOP_FAQ = [
  {
    frage: 'Was kostet ein Kfz-Gutachter nach einem Unfall?',
    antwort:
      'Bei einem unverschuldeten Unfall mit Schaden über 750 € haben Sie das Recht auf einen unabhängigen Kfz-Sachverständigen — die Kosten trägt die gegnerische Haftpflichtversicherung gemäß §249 BGB. Die Honorare richten sich nach der BVSK-Honorartabelle und liegen je nach Stadt zwischen 600 € und 2.400 €. Sie zahlen 0 €.',
  },
  {
    frage: 'Wie läuft eine Kfz-Schadensregulierung mit Claimondo ab?',
    antwort:
      'In drei Schritten: 1) Schaden online melden mit Fotos (5 Min), 2) Ein DAT-zertifizierter Sachverständiger besichtigt das Fahrzeug vor Ort innerhalb von 48 Stunden, 3) Unsere Partnerkanzlei setzt anschließend Reparatur, Wertminderung, Mietwagen, Nutzungsausfall und Schmerzensgeld direkt gegen die gegnerische Versicherung durch — Sie bleiben außen vor.',
  },
  {
    frage: 'Kann die Versicherung das Gutachten kürzen?',
    antwort:
      'Versicherer wie HUK, LVM und AXA beauftragen ControlExpert oder K-Expert mit automatisierten Prüfberichten und kürzen häufig UPE-Aufschläge, Verbringungskosten und Wertminderung. Der BGH stützt jedoch den Geschädigten in mehreren Urteilen (VI ZR 65/18, VI ZR 174/24, VI ZR 119/04). Mit anwaltlicher Vertretung lassen sich die Kürzungen in der Regel zurückholen.',
  },
  {
    frage: 'Was ist eine Sicherungsabtretung beim Gutachter?',
    antwort:
      'Eine Sicherungsabtretung nach §164 BGB überträgt Ihren Anspruch gegen die Versicherung in Höhe des Gutachterhonorars direkt auf den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet danach direkt mit der Haftpflichtversicherung der Gegenseite ab. Sie zahlen nichts und tragen kein Insolvenzrisiko.',
  },
  {
    frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?',
    antwort:
      'Die merkantile Wertminderung liegt nach der Sanden/Danner-Formel typischerweise zwischen 500 € und 2.500 €, abhängig von Fahrzeugalter, Laufleistung und Reparaturkosten. Faustregel: 1. Jahr nach Erstzulassung = 25% der Reparaturkosten als Wertminderung, 2. Jahr 20%, 3. Jahr 15%, 4. Jahr 10%. BGH VI ZR 357/03 lehnt eine starre Altersgrenze ab.',
  },
]

export default function KfzGutachterPillarPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung Deutschland',
            description:
              'Vermittlung an unabhängige, DAT-zertifizierte Kfz-Sachverständige in ganz Deutschland — kostenfrei für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer). Partner-Gutachter aus dem öffentlichen DAT-Verzeichnis, Termin in unter 48 Stunden.',
            url: `${SITE_URL}/kfz-gutachter`,
          }),
          faqPageSchema(TOP_FAQ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero — Navy mit Spotlights für Tiefe */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              Unabhängige Kfz-Sachverständige
            </p>
            <h1
              className="mt-4 text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Kfz-Gutachter finden —<br />
              <span className="text-claimondo-light-blue">unabhängig & kostenfrei.</span>
            </h1>
            <p className="mt-6 text-lg text-white/75 leading-relaxed">
              DAT-zertifizierte Partner-Sachverständige aus dem öffentlichen DAT-Verzeichnis
              (dat.de/sachverstaendige), bundesweit erreichbar. Termin vor Ort in unter 48 Stunden.
              Für unverschuldet Geschädigte 0 € Eigenanteil — die gegnerische Haftpflichtversicherung
              trägt alle Kosten nach §249 BGB (vorbehaltlich Anerkenntnis).
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/gutachter-finden"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
              >
                <MapPin className="h-4 w-4 text-claimondo-ondo" />
                Auf der Karte ansehen
              </Link>
              <Link
                href="/schaden-melden"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
                Schaden melden
              </Link>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-ios-lg shadow-2xl">
            <Image
              src="/brand/hero-unfall-frau.png"
              alt="Geschädigte nach Verkehrsunfall ruft Claimondo an, beschädigtes Fahrzeug im Hintergrund"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Trust-Strip — Glass */}
      <section className="border-y border-white/50 bg-white/65 backdrop-blur-md">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-white/40 px-5 sm:grid-cols-4">
          {[
            { kpi: 'DAT', label: 'zertifiziertes Netzwerk' },
            { kpi: '<48h', label: 'Termin' },
            { kpi: '0 €', label: 'Eigenanteil¹' },
            { kpi: '§249 BGB', label: 'Rechtsgrundlage' },
          ].map((s) => (
            <div key={s.label} className="py-6 text-center">
              <div className="text-xl font-extrabold text-claimondo-navy sm:text-2xl">{s.kpi}</div>
              <div className="mt-1 text-xs text-claimondo-ondo">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-6xl px-5 pb-3 text-center text-[11px] leading-relaxed text-claimondo-shield/70">
          ¹ Bei unverschuldetem Unfall nach §249 BGB, vorbehaltlich Anerkenntnis durch den
          gegnerischen Haftpflichtversicherer.
        </p>
      </section>

      {/* Antwort-Blöcke (Answer Capsules — Princeton GEO) */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Wann brauchen Sie einen Kfz-Gutachter?
          </h2>
          <AnswerCapsule quelle="§249 BGB · BGH VI ZR 119/04">
            <strong>Bei einem unverschuldeten Unfall mit Schaden über 750 €</strong> haben
            Sie nach §249 BGB das Recht auf einen unabhängigen Kfz-Sachverständigen Ihrer
            Wahl. Die Kosten trägt vollständig die gegnerische Haftpflichtversicherung.
            Sie müssen den Gutachter der Gegenseite nicht akzeptieren. Bei Bagatellschäden
            unter 750 € reicht in der Regel ein Kostenvoranschlag der Werkstatt.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Was kostet ein unabhängiger Sachverständiger?
          </h2>
          <AnswerCapsule quelle="BVSK-Honorartabelle">
            Das Honorar richtet sich nach dem Wiederbeschaffungswert des Fahrzeugs und
            folgt der <strong>BVSK-Honorartabelle</strong> — typischerweise zwischen 600 € und
            2.400 € je nach Schadenshöhe und Region. Bei Fremdverschulden zahlen Sie
            nichts: Ihr Gutachter rechnet via Sicherungsabtretung (§164 BGB) direkt mit
            der gegnerischen Versicherung ab.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Warum nicht den Versicherungs-Gutachter?
          </h2>
          <AnswerCapsule quelle="BGH VI ZR 65/18 · VI ZR 174/24 · NDR-Reportage 2022">
            Versicherungs-Gutachter wie ControlExpert oder K-Expert arbeiten im Auftrag
            der gegnerischen Versicherung und kürzen systematisch — UPE-Aufschläge,
            Verbringungskosten, Beilackierung, Wertminderung. Versicherer-Prüfdienste
            kürzen <strong>typischerweise 30–40 % der Ansprüche</strong> (NDR-Reportage
            „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen). Der BGH stützt
            in den Leitentscheidungen VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24 die
            Geschädigten — mit einem unabhängigen DAT-zertifizierten Sachverständigen
            werden alle BGH-konformen Positionen sauber aufgenommen.
          </AnswerCapsule>
        </div>
      </section>

      {/* Themen-Pillars */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Vertiefen
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Themen rund um Ihren Kfz-Schaden
            </h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { href: '/kfz-gutachter/kosten', titel: 'Kosten', lead: 'Was kostet ein Kfz-Gutachter? BVSK-Tabelle, Sicherungsabtretung, 750-€-Bagatellgrenze.' },
              { href: '/kfz-gutachter/ablauf', titel: 'Ablauf', lead: 'Schritt für Schritt vom Unfall bis zur Auszahlung — durchschnittlich 6–8 Wochen.' },
              { href: '/kfz-gutachter/wertminderung', titel: 'Wertminderung', lead: 'Sanden/Danner-Formel, Faustregel nach Alter, BGH-Linie. Typisch 500–2.500 €.' },
              { href: '/schadensreport-2026', titel: 'Schadensreport 2026', lead: 'Welche Positionen kürzen Versicherungen am häufigsten? BGH-Urteile, BVSK-Honorare, NRW-Daten.' },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group rounded-ios-md border border-white/60 bg-white/70 p-6 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-[0_8px_24px_rgba(13,27,62,0.10)]"
              >
                <h3 className="text-xl font-extrabold text-claimondo-navy">{t.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{t.lead}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo group-hover:text-claimondo-navy">
                  Mehr erfahren
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Stadt-Auswahl */}
      <section className="bg-claimondo-bg py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Lokal verfügbar
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Gutachter in Ihrer Stadt
            </h2>
            <p className="mt-3 text-base text-claimondo-ondo">
              Wählen Sie Ihre Stadt für regionale Informationen, Honorar-Spannen und das zuständige Landgericht.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAEDTE.map((s) => (
              <Link
                key={s.slug}
                href={`/kfz-gutachter/${s.slug}`}
                className="group flex items-center justify-between rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-md"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-claimondo-ondo" />
                    <h3 className="text-lg font-extrabold text-claimondo-navy">{s.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-claimondo-ondo">
                    DAT-Partner-Netzwerk · PLZ {s.plzPrefix}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-claimondo-ondo transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
            <div className="flex items-center justify-center rounded-ios-md border-2 border-dashed border-claimondo-border bg-claimondo-bg/50 p-5 text-center text-xs text-claimondo-ondo">
              Weitere Städte folgen — bundesweit verfügbar
            </div>
          </div>
        </div>
      </section>

      {/* Top-FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Häufige Fragen</h2>
          <div className="mt-8 space-y-3">
            {TOP_FAQ.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-white/60 bg-white/70 p-5 backdrop-blur-md shadow-glass-card transition-all hover:bg-white/85"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between">
                    {f.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link
              href="/faq"
              className="inline-flex items-center gap-1 text-sm font-semibold text-claimondo-ondo hover:text-claimondo-navy"
            >
              Alle FAQ ansehen
              <ChevronRight className="h-4 w-4" />
            </Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Jetzt Gutachter in Ihrer Region finden
          </h2>
          <p className="mt-4 text-white/70">
            Karte ansehen, Stadt wählen oder direkt anrufen — wir sind bundesweit erreichbar.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <MapPin className="h-5 w-5 text-claimondo-ondo" />
              Karte ansehen
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum="2026-05-13" />

      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Pillar" />
    </div>
  )
}
