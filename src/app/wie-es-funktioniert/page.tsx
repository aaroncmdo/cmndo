import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  Phone, MessageCircle, ChevronRight, Quote,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { FounderSection } from '@/components/landing/FounderSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { PortalMockupSection } from '@/components/landing/sections/PortalMockupSection'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'

// /wie-es-funktioniert — Premium-Layout. Conversion-Page mit Fokus auf
// Prozess + Portal + Berater + Trust-Anker. Folgt der Köln-Handoff-
// Prototype-Design-Philosophie.

export const metadata: Metadata = {
  title: 'Wie es funktioniert — Vom Unfall zur Auszahlung in 5 Schritten · Claimondo',
  description:
    'In 5 Schritten von der Unfallmeldung zur Auszahlung — Ø 32 Tage. Berater-Rückruf <15 Min, DAT-Gutachter <48 h vor Ort, LexDrive-Anwalt setzt Ansprüche durch, live im Portal verfolgbar.',
  keywords: [
    'Kfz-Schaden melden', 'Unfallschaden online', 'Schadensregulierung Ablauf',
    'Gutachter Termin online', 'digitale Schadensregulierung', 'Schadenakte Portal',
    'Sachverständiger 48 Stunden', 'Anwalt Verkehrsunfall Ablauf',
  ],
  alternates: { canonical: '/wie-es-funktioniert' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/wie-es-funktioniert`,
    title: 'Wie es funktioniert — Vom Unfall zur Auszahlung in 5 Schritten · Claimondo',
    description:
      'In 5 Schritten zum vollen Schadensersatz — Ø 32 Tage. Berater-Rückruf <15 Min, DAT-Gutachter <48 h.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'So funktioniert Claimondo' }],
  },
}

const KPIS = [
  { wert: '< 15 Min', label: 'bis zum ersten Rückruf' },
  { wert: '< 48 h',   label: 'bis zum Gutachter vor Ort' },
  { wert: '5 Werktage', label: 'bis das Gutachten steht' },
  { wert: '32 Tage',  label: 'Ø bis zur Auszahlung' },
] as const

const SCHRITTE = [
  {
    nr: 1,
    titel: 'Sie melden den Schaden',
    text: 'Online in 5 Minuten — Name, Telefon, Stadt. Ohne Anmeldung, ohne Formulare. Oder direkt am Telefon.',
    detail: 'Sie laden 1–3 Fotos hoch (optional), beschreiben den Unfall in einem Satz, fertig. Keine Dokumente, keine Versicherungs-Nummer. Wir kümmern uns um den Rest.',
  },
  {
    nr: 2,
    titel: 'Ihr Berater meldet sich',
    text: 'Persönlicher Rückruf in unter 15 Minuten. Ein fester Ansprechpartner für den gesamten Fall — kein Call-Center.',
    detail: 'Er klärt mit Ihnen Ihre Ansprüche: Reparatur, Wertminderung, Mietwagen, Nutzungsausfall, Anwaltskosten. Sie sprechen NICHT direkt mit der gegnerischen Versicherung — das vermeidet 33 % Verlust.',
  },
  {
    nr: 3,
    titel: 'DAT-Gutachter besichtigt Ihr Fahrzeug',
    text: 'Vor Ort in unter 48 Stunden — meist am Folgetag. Unabhängig, DAT-zertifiziert, vollständige Beweissicherung.',
    detail: 'Termin bei Ihnen, in der Werkstatt oder beim Berater. Gutachten in 5 Werktagen — inklusive merkantiler Wertminderung nach Sanden/Danner, Restwert (regional), und Reparaturkalkulation nach BGH-Markenwerkstatt-Linie.',
  },
  {
    nr: 4,
    titel: 'LexDrive setzt Ansprüche durch',
    text: 'Unsere Partnerkanzlei übernimmt die gesamte Korrespondenz mit der gegnerischen Versicherung — auch gegen Prüfberichte und Kürzungen.',
    detail: 'Gegen ControlExpert-/K-Expert-Kürzungen schreibt LexDrive zurück mit Verweis auf BGH VI ZR 65/18 (UPE), VI ZR 174/24 (Beilackierung), VI ZR 38/22 ff. (Werkstattrisiko). Notfalls Klage vor dem zuständigen Landgericht — Gegenseite zahlt.',
  },
  {
    nr: 5,
    titel: 'Geld auf dem Konto',
    text: 'Ø 32 Tage von der Meldung bis zur Auszahlung. Jeden Schritt sehen Sie live im Claimondo-Portal.',
    detail: 'Bei Kürzungen oder Streitfällen kann es länger dauern — Sie sehen den Status jederzeit, der Berater bleibt im Loop. Eigenkasko-Reparaturen können bei unverschuldetem Unfall via Sicherungsabtretung (§164 BGB) direkt zwischen Gutachter/Werkstatt und Versicherung abgerechnet werden — Sie zahlen keinen Cent vor.',
  },
] as const

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Wie schnell ist der erste Rückruf?',
    antwort:
      'Innerhalb von 15 Minuten zu Geschäftszeiten — von 08:00 bis 20:00 Uhr. Außerhalb der Zeiten am nächsten Werktag morgens. Per WhatsApp können Sie jederzeit schreiben.',
  },
  {
    frage: 'Muss ich mit der gegnerischen Versicherung sprechen?',
    antwort:
      'Nein, und Sie sollten es auch nicht. Sobald Sie den Schaden bei uns melden, übernimmt LexDrive die gesamte Kommunikation. Falls die gegnerische Versicherung Sie kontaktiert: einfach an uns weiterleiten.',
  },
  {
    frage: 'Was passiert, wenn die Versicherung mein Gutachten ablehnt?',
    antwort:
      'Das kommt häufig vor. ControlExpert / K-Expert erstellen Prüfberichte ohne Fahrzeugbesichtigung und kürzen systematisch UPE, Verbringung und Wertminderung. LexDrive antwortet mit BGH-Refs (VI ZR 65/18, VI ZR 174/24, VI ZR 38/22 ff.) und holt die Kürzungen vollständig zurück. Bei Bedarf gerichtlich — Gegenseite zahlt auch die Anwalts- und Prozesskosten.',
  },
  {
    frage: 'Kann ich den Fortschritt selbst verfolgen?',
    antwort:
      'Ja, live im Claimondo-Portal: Standort des Gutachters, Status der Reparaturkalkulation, eingegangene Versicherungs-Antworten, prognostizierter Auszahlungs-Termin. Auch Mobile-App mit Push-Benachrichtigungen bei jedem Status-Wechsel.',
  },
  {
    frage: 'Muss ich in Vorleistung gehen?',
    antwort:
      'Nein. Sicherungsabtretung gemäß §164 BGB überträgt den Anspruch in Höhe des Gutachterhonorars direkt an den Sachverständigen — der rechnet mit der Versicherung ab. Reparatur über die Werkstatt läuft analog. Bei unverschuldetem Unfall zahlen Sie 0 € Eigenanteil.',
  },
  {
    frage: 'Was, wenn ich nicht in NRW wohne?',
    antwort:
      'Kein Problem. Schwerpunkt ist NRW, aber das Partner-Netzwerk deckt 72 deutsche Großstädte ab — Berlin, Hamburg, München, Frankfurt, Stuttgart, Hannover, Leipzig, Dresden, Bremen, Kiel und mehr. Stadt-Pages mit lokalem Landgericht/Anwaltskammer/BVSK-Spanne unter /kfz-gutachter/<stadt>.',
  },
]

export default function WieEsFunktioniertPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Vollständige Kfz-Schadensregulierung in 5 Schritten',
            description:
              'Vom unverschuldeten Unfall zur Auszahlung in durchschnittlich 32 Tagen. Berater-Rückruf <15 Min, DAT-Gutachter <48 h, LexDrive-Anwalt setzt Ansprüche durch. Live verfolgbar im Portal.',
            url: `${SITE_URL}/wie-es-funktioniert`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Kfz-Schaden vollständig regulieren — vom Unfall bis zur Auszahlung',
            description:
              'In fünf Schritten vom unverschuldeten Unfall zur vollständigen Auszahlung. Durchschnittlich 32 Tage, ohne Eigenanteil.',
            totalTime: 'P32D',
            step: SCHRITTE.map((s) => ({
              '@type': 'HowToStep',
              position: s.nr,
              name: s.titel,
              text: s.text,
            })),
          },
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Wie es funktioniert', url: '/wie-es-funktioniert' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="wef-hero">
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
            In 32 Tagen zum Geld · Live im Portal
          </div>
          <h1 id="wef-hero" className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
            Vom Unfall zur Auszahlung —<br />
            <span className="text-claimondo-light-blue">in 5 Schritten.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
            Sie machen Schritt 1. Wir machen den Rest. Berater-Rückruf in unter 15 Minuten,
            DAT-Gutachter vor Ort in unter 48 Stunden, Anwalt setzt jeden Anspruch durch.
            Live verfolgbar im Portal.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-wef-melden"
            >
              Schaden online melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
              data-tracking="call-wef-hero"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* 2 — Trust-Strip (Zeit-KPIs) */}
      <section className="border-y border-claimondo-border/60 bg-white" aria-label="Zeit-Kennzahlen">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-claimondo-border/60 px-5 sm:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className="py-6 text-center">
              <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">{k.wert}</div>
              <div className="mt-1 text-xs text-claimondo-ondo">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — Die 5 Schritte (ausführlich, alternierend) */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="wef-schritte">
        <div className="mx-auto max-w-5xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Der konkrete Ablauf
            </p>
            <h2 id="wef-schritte" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Die 5 Schritte im Detail
            </h2>
          </div>
          <ol className="mt-12 space-y-6" role="list">
            {SCHRITTE.map((s) => (
              <li
                key={s.nr}
                className="relative grid gap-4 rounded-ios-lg border border-claimondo-border bg-white p-7 shadow-claimondo-sm sm:grid-cols-[auto_1fr] sm:gap-7"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-ios-md bg-claimondo-navy text-2xl font-extrabold text-white">
                  {s.nr}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-claimondo-navy">{s.titel}</h3>
                  <p className="mt-2 text-base leading-relaxed text-claimondo-shield">{s.text}</p>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield/85">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Portal-Mockup */}
      <PortalMockupSection />

      {/* 5 — Berater-Quote */}
      <section className="bg-claimondo-navy py-16 text-white sm:py-20" aria-labelledby="wef-berater">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-ios-lg border border-white/10 shadow-claimondo-lg">
            <Image
              src="/marketing-landing-koeln/berater.png"
              alt="Persönlicher Claimondo-Berater am Telefon"
              fill sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              Persönliche Begleitung
            </p>
            <h2 id="wef-berater" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Ein Berater. Eine Nummer. Die ganze Strecke.
            </h2>
            <Quote className="mt-6 h-8 w-8 text-claimondo-light-blue/60" aria-hidden />
            <blockquote className="mt-3 text-lg leading-relaxed text-white/85">
              „Sobald wir Ihre Meldung haben, übernehmen wir alles. Sie hören in 15 Minuten
              von mir, der Gutachter ist am nächsten Tag bei Ihnen, und ich melde mich
              persönlich bei jedem Meilenstein. Sie müssen mit der gegnerischen
              Versicherung kein einziges Mal sprechen."
            </blockquote>
            <p className="mt-4 text-sm font-semibold text-claimondo-light-blue">
              — Claimondo-Schadenbegleitung
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking="call-wef-berater"
              >
                <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
                {PHONE_DISPLAY}
              </a>
              <a
                href="https://wa.me/4922125906530"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
                data-tracking="whatsapp-wef-berater"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6 — Sieben Fehler */}
      <SiebenFehlerSection />

      {/* 7 — Gründer */}
      <FounderSection />

      {/* 8 — FAQ */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="wef-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Häufige Fragen zum Ablauf
            </p>
            <h2 id="wef-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Antworten in unter 60 Sekunden
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
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
            5 Minuten Online. 15 Minuten Rückruf. 32 Tage zum Geld.
          </h2>
          <p className="mt-4 text-white/75">
            Schritt 1 machen Sie. Den Rest übernehmen wir.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-wef-bottom"
            >
              Jetzt Schritt 1 machen
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/vorteile"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              Vorteile im Detail
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="Wie es funktioniert" />
    </div>
  )
}
