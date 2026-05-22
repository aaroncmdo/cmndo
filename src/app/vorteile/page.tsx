import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Phone, CheckCircle2, MessageCircle, ChevronRight, Euro, Scale,
  ShieldCheck, Zap, Clock, Users,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { VersichererTaktikenSection } from '@/components/landing/VersichererTaktikenSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { WertminderungSandenDannerSection } from '@/components/landing/sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from '@/components/landing/sections/TeslaEAutoSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'

// /vorteile — Premium-Layout. Conversion-Page mit Fokus auf USPs + BGH-
// Authority + Versicherer-Kürzungs-Konter + Wissensdatenbank-Tiefe.
// Folgt der Köln-Handoff-Prototype-Design-Philosophie.

export const metadata: Metadata = {
  title: 'Vorteile — Versicherer-Kürzungen zurückgeholt · Claimondo',
  description:
    '0 € Eigenanteil bei unverschuldetem Unfall nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer). Unabhängiger DAT-Sachverständiger statt Prüfdienst-Kürzung (30–40 % typisch laut NDR/Verbraucherzentrale/BGH). Sehen Sie, was Ihnen zusteht.',
  keywords: [
    'Vorteile Kfz-Schaden', 'unabhängiger Gutachter', 'Wertminderung sichern',
    'UPE-Aufschläge', 'Mehrwertsteuer §249 BGB', 'Anwalt Verkehrsunfall',
    'HIS-Datei Schaden', 'volle Schadensregulierung', 'Quotenvorrecht',
  ],
  alternates: { canonical: '/vorteile' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/vorteile`,
    title: 'Vorteile — Versicherer-Kürzungen zurückgeholt · Claimondo',
    description:
      '0 € Eigenanteil bei unverschuldetem Unfall nach §249 BGB. Unabhängiger Gutachter, voller Anspruch. Prüfdienst-Kürzungen (typischerweise 30–40 % laut NDR/BGH) holen wir zurück.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Vorteile Claimondo' }],
  },
}

// AAR-UWG-Fix 14.05.2026: '+33 %' war nicht belegt. Ersetzt durch
// belegbare NDR/Verbraucherzentrale/BGH-Quotenangabe.
const KPIS = [
  { wert: '30–40 %', label: 'Versicherer-Kürzung zurückgeholt¹' },
  { wert: '8 Mio. €+', label: 'durchgesetzte Ansprüche (Aggregat)' },
  { wert: '0 €', label: 'Eigenanteil nach §249 BGB²' },
  { wert: '32 Tage', label: 'Ø bis zur Auszahlung' },
] as const

const KPI_METHODIK =
  '¹ Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen, ' +
  'BGH VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24. ² Vorbehaltlich Anerkenntnis ' +
  'durch den gegnerischen Haftpflichtversicherer.'

const VORTEILE = [
  {
    icon: Euro,
    titel: '0 € Kosten für Sie',
    sub: 'Der Verursacher zahlt alles',
    text: 'Bei unverschuldetem Unfall trägt die gegnerische Haftpflicht alle Kosten — Gutachten, Anwalt, Mietwagen, Abschleppung. Kein Vorschuss, kein Risiko, kein Eigenanteil.',
    punkte: [
      'Gutachterkosten: 100 % übernommen (§249 BGB)',
      'Anwaltskosten: komplett durch Gegnerseite',
      'Mietwagen für die gesamte Reparaturdauer',
      'Keine Vorleistung. Keine Bindung. Keine Kosten.',
    ],
  },
  {
    icon: Scale,
    titel: 'Unabhängige DAT-Gutachter',
    sub: 'Nur Ihrem Interesse verpflichtet',
    text: 'Unsere Partner-Gutachter arbeiten unabhängig — nicht im Dienst einer Versicherung. Ihr Schaden wird vollständig und nach DAT-Standard bewertet, nicht über ControlExpert oder K-Expert kleingerechnet.',
    punkte: [
      'Zertifizierte Partner-Gutachter aus dem öffentlichen DAT-Verzeichnis',
      'Keine Schadensteuerung — keine Versicherungsbindung',
      'Vollständige Schadensbewertung inkl. Wertminderung',
      'Gutachten in 5 Werktagen, Besichtigung in 48 h',
    ],
  },
  {
    icon: ShieldCheck,
    titel: 'Anwalt Partnerkanzlei für Verkehrsrecht inklusive',
    sub: 'Volle rechtliche Vertretung',
    text: 'Unsere Partnerkanzlei für Verkehrsrecht übernimmt die gesamte Korrespondenz mit der gegnerischen Versicherung und setzt jeden Anspruch durch — auch gegen Prüfberichte und Kürzungen.',
    punkte: [
      'Fachanwälte für Verkehrsrecht',
      'Direkter Ansprechpartner — kein Call-Center',
      'Schriftverkehr mit Versicherung komplett übernommen',
      'Gerichtliche Durchsetzung wenn nötig — Gegenseite zahlt',
    ],
  },
  {
    icon: Zap,
    titel: 'Alles aus einer Hand',
    sub: 'Ein Ansprechpartner für alles',
    text: 'Kein Pingpong zwischen Gutachter, Werkstatt, Anwalt und Versicherung. Claimondo orchestriert den gesamten Ablauf — Sie bekommen Status-Updates per WhatsApp und im Live-Portal.',
    punkte: [
      'Persönlicher Schaden-Begleiter — 1 Nummer, 1 Mail',
      'Live-Status im Browser & Push in der App',
      'Koordination aller Beteiligten (SV, Anwalt, Werkstatt)',
      'Digitale Fallakte jederzeit einsehbar',
    ],
  },
  {
    icon: Clock,
    titel: 'Digital & schnell',
    sub: 'Ohne Papierkram, ohne Wartezeit',
    text: 'Schaden melden in 5 Minuten per Handy — keine Formulare, keine Anmeldung. Erster Rückruf unter 15 Minuten. Gutachter-Termin in der Regel am Folgetag.',
    punkte: [
      'Schadenmeldung in unter 5 Minuten',
      'Berater-Rückruf in <15 Min',
      'Besichtigung in <48 h',
      'Digitale Vollmacht — keine Unterschriften per Post',
    ],
  },
  {
    icon: Users,
    titel: 'Deutschlandweit verfügbar',
    sub: 'Schwerpunkt NRW · bundesweit',
    text: 'Egal ob Köln, München, Berlin oder Schwerin: das Partner-Netzwerk deckt deutsche Großstädte ab. Der nächste DAT-Gutachter aus dem Netzwerk ist meist wenige Kilometer entfernt.',
    punkte: [
      'DAT-Sachverständige aus dem öffentlichen DAT-Verzeichnis',
      'Indexierte Stadt-Pages für lokales SEO',
      'Standortbasierte Zuweisung',
      'Ortskundige Experten in jeder Region',
    ],
  },
] as const

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?',
    antwort:
      'Versicherer kürzen über Prüfdienstleister (ControlExpert, K-Expert, DEKRA) typischerweise UPE-Aufschläge, Verbringung, Beilackierung und Wertminderung. BGH-fest sind diese Positionen erstattungsfähig (VI ZR 65/18, VI ZR 174/24, VI ZR 38/22 ff.). Partnerkanzlei für Verkehrsrecht holt die Kürzungen vollständig zurück — auch gerichtlich.',
  },
  {
    frage: 'Was bringt mir das Quotenvorrecht bei Mithaftung?',
    antwort:
      'Bei 50:50-Mithaftung zahlt die gegnerische Versicherung nur 50 %. Ihre eigene Kasko springt über das Quotenvorrecht ein und übernimmt bis zu 100 % der bevorrechtigten Positionen: Reparaturkosten, Wertminderung, Sachverständigenkosten, Abschleppkosten. Der Höherstufungsschaden kann anteilig bei der Gegenseite zurückgefordert werden.',
  },
  {
    frage: 'Was ist die merkantile Wertminderung?',
    antwort:
      'Auch nach perfekter Reparatur sinkt der Marktwert eines Unfallfahrzeugs — das ist die merkantile Wertminderung. Sie zahlt die gegnerische Versicherung nach Sanden/Danner-Formel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. BGH VI ZR 357/03 lehnt eine starre Altersgrenze ab.',
  },
  {
    frage: 'Sind UPE-Aufschläge und Verbringungskosten wirklich erstattungsfähig?',
    antwort:
      'Ja — auch bei fiktiver Abrechnung. BGH VI ZR 65/18 hat UPE-Aufschläge bestätigt, BGH VI ZR 174/24 die Beilackierung. Versicherer kürzen trotzdem über Prüfberichte ohne Fahrzeugbesichtigung. Wir holen die Positionen anwaltlich zurück.',
  },
  {
    frage: 'Warum sollte ich nicht direkt mit der gegnerischen Versicherung sprechen?',
    antwort:
      'Weil sie ihren eigenen Gutachter (ControlExpert, K-Expert) ansetzt und systematisch kürzt — Prüfdienste kürzen typischerweise 30–40 % der Ansprüche (NDR-Reportage 2022, Verbraucherzentrale, BGH VI ZR 38/22 ff.). Sagen Sie höflich: „Vielen Dank, ich mache von meinem Recht Gebrauch, einen unabhängigen Sachverständigen und Fachanwalt meiner Wahl einzuschalten." — und melden den Schaden bei uns.',
  },
]

export default function VorteilePage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Vollständige Kfz-Schadensregulierung mit unabhängigem Sachverständigen',
            description:
              'Versicherer-Prüfdienste kürzen typischerweise 30–40 % der Ansprüche (NDR/Verbraucherzentrale/BGH VI ZR 38/22 ff.). Claimondo holt sie zurück: 0 € Eigenanteil nach §249 BGB, DAT-Gutachter + Partnerkanzlei für Verkehrsrecht inklusive. Vollständige BGH-konforme Durchsetzung.',
            url: `${SITE_URL}/vorteile`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Vorteile', url: '/vorteile' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero (kein Lead-Form, dual-CTA) */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="vorteile-hero">
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
        <div className="relative mx-auto max-w-5xl px-5 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
            §249 BGB · BVSK · BGH-Rechtsprechung
          </div>
          <h1 id="vorteile-hero" className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
            Prüfdienst-<span className="text-claimondo-light-blue">Kürzungen zurückgeholt</span> — ohne Eigenanteil.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
            Versicherer-Prüfdienste kürzen typischerweise 30–40 % der Ansprüche
            (NDR-Reportage 2022, Verbraucherzentrale, BGH VI ZR 38/22 ff.). Wir holen sie zurück —
            mit unabhängigem DAT-Gutachter, Partnerkanzlei für Verkehrsrecht und BGH-Rechtsprechung im Rücken.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-vorteile-melden"
            >
              Schaden online melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-vorteile-hero"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
          <p className="mt-5 text-xs text-white/55">
            Anonyme Beratung · Antwort &lt;15 Min · DSGVO-konform
          </p>
        </div>
      </section>

      {/* 2 — Trust-Strip */}
      <TrustStripSection kpis={[...KPIS]} methodikNote={KPI_METHODIK} />

      {/* 3 — Die 6 Vorteile (Cards mit Bullets) */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="vorteile-grid">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Was Sie konkret bekommen
            </p>
            <h2 id="vorteile-grid" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Sechs Gründe, warum Claimondo Prüfdienst-Kürzungen zurückholt.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              Jeder dieser Vorteile ist durch BGH-Rechtsprechung oder Branchen-Standard
              abgesichert. Versicherer wissen das. Sie hoffen, dass Sie es nicht wissen.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {VORTEILE.map((v) => {
              const Icon = v.icon
              return (
                <article
                  key={v.titel}
                  className="flex flex-col rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:shadow-claimondo-md"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-bold leading-tight text-claimondo-navy">{v.titel}</h3>
                      <p className="text-xs font-semibold text-claimondo-ondo">{v.sub}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">{v.text}</p>
                  <ul className="mt-4 space-y-1.5">
                    {v.punkte.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs text-claimondo-shield">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* 4 — Versicherer-Taktiken */}
      <VersichererTaktikenSection />

      {/* 5 — Wertminderung-Sanden/Danner */}
      <WertminderungSandenDannerSection />

      {/* 6 — Sieben Fehler vermeiden */}
      <SiebenFehlerSection />

      {/* 7 — Tesla / E-Auto */}
      <TeslaEAutoSection />

      {/* 8 — FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="vorteile-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Häufige Fragen zu Ihren Ansprüchen
            </p>
            <h2 id="vorteile-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Antworten in unter 60 Sekunden
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-claimondo-navy">
                  <span>{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9 — Bottom CTA */}
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
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Bereit, das Drittel zurückzuholen, das Ihnen zusteht?
          </h2>
          <p className="mt-4 text-white/75">
            5 Minuten Online-Meldung. Rückruf in 15 Minuten. Geld in Ø 32 Tagen.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-vorteile-bottom"
            >
              Jetzt Schaden melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href="https://wa.me/4922125906530"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking="whatsapp-vorteile-bottom"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="Vorteile" />
    </div>
  )
}
