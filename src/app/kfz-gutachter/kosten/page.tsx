import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Euro, ShieldCheck, FileText, AlertTriangle } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Was kostet ein Kfz-Gutachter? — 0 € bei Fremdverschulden (§249 BGB)',
  description:
    'Kfz-Gutachter-Kosten erklärt: BVSK-Honorartabelle, Sicherungsabtretung §164 BGB, Bagatellgrenze 750 €. Bei unverschuldetem Unfall trägt die gegnerische Versicherung 100 % der Kosten — Sie zahlen 0 €.',
  keywords: [
    'Kfz-Gutachter Kosten',
    'Was kostet ein Unfallgutachter',
    'BVSK-Honorartabelle',
    'Sachverständigen-Honorar',
    'Sicherungsabtretung §164 BGB',
    'Bagatellschaden Grenze',
    'Gutachter Kosten Versicherung',
  ],
  alternates: { canonical: '/kfz-gutachter/kosten' },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter/kosten`,
    title: 'Was kostet ein Kfz-Gutachter? — 0 € bei Fremdverschulden',
    description: 'Honorar nach BVSK 600–2.600 €, bei Fremdverschulden 0 € für Sie.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Kfz-Gutachter Kosten' }],
  },
}

const FAQS = [
  {
    frage: 'Wie viel kostet ein Kfz-Gutachter konkret?',
    antwort:
      'Die Honorare richten sich nach der BVSK-Honorartabelle und skalieren mit dem Wiederbeschaffungswert des Fahrzeugs. Spannen je nach Region: 550–2.600 €. Beispiele: Schaden 5.000 € → ca. 700 € Gutachterhonorar. Schaden 15.000 € → ca. 1.400 €. Schaden 30.000 € → ca. 2.200 €. Die Berechnung folgt der HB-V-Befragung des BVSK aus 2025.',
  },
  {
    frage: 'Wer zahlt den Gutachter bei einem Unfall?',
    antwort:
      'Bei unverschuldetem Unfall mit Schaden über 750 €: die gegnerische Haftpflichtversicherung zu 100 % gemäß §249 BGB. Sie zahlen 0 €. Die Abrechnung läuft direkt zwischen Gutachter und Versicherung über eine Sicherungsabtretung. Bei Selbstverschulden zahlt Ihre Vollkasko (mit Selbstbeteiligung) — ohne Vollkasko Sie selbst.',
  },
  {
    frage: 'Was ist die Bagatell-Grenze von 750 €?',
    antwort:
      'Bei Schäden unter 750 € sieht die Rechtsprechung in der Regel keinen Anspruch auf einen Sachverständigen — ein Kostenvoranschlag der Werkstatt reicht. Genaue Grenze ist vom OLG abhängig (Schwankung 700–1.000 €). Wir empfehlen: bei optisch geringen Schäden die Werkstatt prüfen lassen — oft sind verdeckte Schäden teurer als gedacht und rechtfertigen ein vollständiges Gutachten.',
  },
  {
    frage: 'Was ist eine Sicherungsabtretung?',
    antwort:
      'Bei der Sicherungsabtretung nach §164 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet danach direkt mit der Versicherung ab. Sie haben kein Insolvenzrisiko, kein Vorleistungsrisiko. BGH-Rechtsprechung: Versicherer dürfen die Abtretung nicht einseitig zurückweisen.',
  },
  {
    frage: 'Was passiert wenn die Versicherung das Gutachterhonorar kürzt?',
    antwort:
      'Häufige Versicherer-Taktik: Honorar-Kürzung mit Hinweis auf "ortsüblich". Der BGH hat dem in mehreren Urteilen widersprochen (VI ZR 50/15, VI ZR 76/16): die BVSK-Tabelle ist als Schätzungs-Grundlage zulässig. Unsere Partnerkanzlei holt gekürzte Honorare standardmäßig zurück — bei Erfolg trägt die Versicherung die Anwaltskosten.',
  },
]

export default function KostenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter Kostenübernahme',
            description:
              'Bei unverschuldetem Verkehrsunfall trägt die gegnerische Haftpflichtversicherung 100 % der Sachverständigen-Honorare gemäß §249 BGB. Honorar nach BVSK-Tabelle 550–2.600 €.',
            url: `${SITE_URL}/kfz-gutachter/kosten`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Kosten', url: '/kfz-gutachter/kosten' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Kosten</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Was kostet ein Kfz-Gutachter?
          </h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            Bei unverschuldetem Unfall: <strong className="text-white">0 € für Sie</strong> · §249 BGB · BVSK-Honorartabelle 550–2.600 €
          </p>
        </div>
      </section>

      {/* Antwort-Block direkt */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="§249 BGB · BVSK-Honorartabelle">
            <strong>Bei einem unverschuldeten Verkehrsunfall mit Schaden über 750 €</strong>{' '}
            trägt die gegnerische Haftpflichtversicherung das Gutachter-Honorar zu 100 %.
            Die Höhe richtet sich nach der BVSK-Honorartabelle (Wiederbeschaffungswert-basiert)
            und liegt zwischen 550 € und 2.600 €. Sie zahlen nichts: der Gutachter rechnet
            via Sicherungsabtretung (§164 BGB) direkt mit der gegnerischen Versicherung ab.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            BVSK-Honorartabelle — wie wird das Honorar berechnet?
          </h2>
          <AnswerCapsule>
            Die BVSK-Honorartabelle (Bundesverband der freiberuflichen und unabhängigen
            Sachverständigen für das Kraftfahrzeugwesen) staffelt das Honorar nach
            Wiederbeschaffungswert. Beispiel: Schaden 5.000 € → ca. 700 €. Schaden 15.000 €
            → ca. 1.400 €. Schaden 30.000 € → ca. 2.200 €. Plus Nebenkosten (Lichtbilder,
            Schreibgebühren, Fahrtkosten). Die Tabelle wird jährlich aktualisiert.
          </AnswerCapsule>

          {/* Konkrete Beispiele */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { schaden: '5.000 €', honorar: '~ 700 €' },
              { schaden: '15.000 €', honorar: '~ 1.400 €' },
              { schaden: '30.000 €', honorar: '~ 2.200 €' },
            ].map((b) => (
              <div
                key={b.schaden}
                className="rounded-2xl border border-claimondo-border bg-white p-5 text-center shadow-sm"
              >
                <div className="text-xs text-claimondo-ondo">Schaden</div>
                <div className="mt-1 text-2xl font-extrabold text-claimondo-navy">{b.schaden}</div>
                <div className="mt-3 text-xs text-claimondo-ondo">Honorar nach BVSK</div>
                <div className="text-lg font-bold text-claimondo-ondo">{b.honorar}</div>
              </div>
            ))}
          </div>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Müssen Sie in Vorleistung gehen?
          </h2>
          <AnswerCapsule quelle="§164 BGB Sicherungsabtretung">
            <strong>Nein.</strong> Bei der Sicherungsabtretung übertragen Sie Ihren Anspruch
            in Höhe des Honorars direkt auf den Sachverständigen — er rechnet anschließend
            mit der gegnerischen Versicherung ab. Sie unterzeichnen einmal, zahlen nichts vor,
            tragen kein Insolvenzrisiko. Standardpraxis im gesamten freien Sachverständigen-
            Markt, BGH-bestätigt.
          </AnswerCapsule>

          <h2 className="mt-12 text-3xl font-extrabold text-claimondo-navy">
            Was ist die Bagatellgrenze 750 €?
          </h2>
          <AnswerCapsule>
            Bei Schäden unter 750 € haben Sie nach herrschender Rechtsprechung in der Regel
            keinen Anspruch auf einen Sachverständigen — ein Kostenvoranschlag der Werkstatt
            reicht aus. Die genaue Grenze schwankt je nach OLG zwischen 700 € und 1.000 €.
            <strong> Vorsicht:</strong> Optisch kleine Schäden zeigen oft verdeckte Folge-
            schäden (Steuergeräte, Rahmenlängsträger). Bei jedem Zweifel: vollständiges Gutachten.
          </AnswerCapsule>
        </div>
      </section>

      {/* Selbstverschuldet vs. unverschuldet */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Wann zahlt wer?
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-700" />
                <h3 className="text-base font-bold text-green-900">Unverschuldet (typisch 95 %)</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-green-900">
                Gegnerische Haftpflichtversicherung trägt <strong>100 %</strong>: Gutachter,
                Anwalt, Werkstatt, Mietwagen, Wertminderung, Nutzungsausfall. Sie zahlen 0 €.
                Auch Anwaltskosten und Gerichtskosten bei Streit.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                <h3 className="text-base font-bold text-amber-900">Selbstverschuldet</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-amber-900">
                Nur Vollkasko ersetzt — und zwar mit Selbstbeteiligung (typisch 300–1.000 €).
                Anwalt + Gutachter werden in der Regel nicht erstattet. Wertminderung +
                Nutzungsausfall entfallen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Häufige Fragen zu Kosten</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.frage}
                className="group rounded-2xl border border-claimondo-border bg-white p-5"
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
        </div>
      </section>

      {/* Cross-Links */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">Mehr zum Thema Kfz-Gutachter</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/kfz-gutachter/ablauf" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Ablauf der Schadensregulierung
            </Link>
            <Link href="/kfz-gutachter/wertminderung" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Wertminderung berechnen
            </Link>
            <Link href="/kfz-gutachter" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              Gutachter finden →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Konkrete Frage zu Ihrem Fall?</h2>
          <p className="mt-4 text-white/70">Kostenlose Erstberatung — ohne Verpflichtung.</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              Schaden melden — 0 € Kosten
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a href="tel:+4922125906530" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white">
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Kosten" />
    </div>
  )
}
