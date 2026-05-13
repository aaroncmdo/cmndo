import type { Metadata } from 'next'
import Link from 'next/link'
import { Brain, Camera, FileText, ChevronRight, Clock, Shield, Euro, CheckCircle2, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { serviceSchema, howToSchema, breadcrumbsSchema, jsonLdScript, SITE_URL } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'KI-Ersteinschätzung — Ihr Kfz-Schaden in Sekunden bewertet',
  description:
    'Laden Sie Fotos Ihres Unfallschadens hoch. Unsere KI liefert in unter 15 Minuten eine kostenlose Ersteinschätzung: Reparaturkosten, Wiederbeschaffungswert und ob ein Gutachten lohnt.',
  keywords: [
    'KI-Schadensbewertung',
    'Kfz-Schaden Ersteinschätzung',
    'Unfallschaden kostenlos prüfen',
    'Reparaturkosten berechnen',
    'Wiederbeschaffungswert',
    'Gutachten lohnt sich',
    'kostenlose Schadensbewertung',
    'KFZ Schaden Foto hochladen',
  ],
  alternates: {
    canonical: '/ersteinschaetzung',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/ersteinschaetzung`,
    title: 'KI-Ersteinschätzung — Kfz-Schaden kostenlos bewerten lassen',
    description: 'Foto hochladen, KI analysiert sofort. Reparaturkosten, Wiederbeschaffungswert, Gutachten-Empfehlung — in unter 15 Minuten.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'KI-Ersteinschätzung Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KI-Ersteinschätzung — Ihr Kfz-Schaden in Sekunden bewertet',
    description: 'Kostenlos, sofort, unverbindlich.',
    images: ['/og-default.png'],
  },
}

const ERGEBNIS_PUNKTE = [
  { icon: Euro, text: 'Geschätzte Reparaturkosten auf Basis Ihrer Fotos' },
  { icon: FileText, text: 'Wiederbeschaffungswert des Fahrzeugs' },
  { icon: Shield, text: 'Empfehlung: Gutachten oder Kostenvoranschlag' },
  { icon: CheckCircle2, text: 'Einschätzung der Regulierungschancen' },
  { icon: Clock, text: 'Ergebnis in unter 15 Minuten' },
]

const SCHRITTE = [
  {
    nr: '01',
    icon: Camera,
    title: 'Fotos hochladen',
    subtitle: '5 Minuten · Keine Anmeldung',
    text: 'Fotografieren Sie Ihren Schaden aus verschiedenen Winkeln und beschreiben Sie kurz den Unfallhergang. Kein Papierkram, keine Formulare.',
  },
  {
    nr: '02',
    icon: Brain,
    title: 'KI analysiert sofort',
    subtitle: 'In Sekunden · Kostenlos',
    text: 'Unsere KI wurde auf tausenden Kfz-Schadensfällen trainiert. Sie erkennt Schadensart, -umfang und berechnet eine erste Kostenindikation.',
  },
  {
    nr: '03',
    icon: FileText,
    title: 'Ergebnis + nächster Schritt',
    subtitle: 'Sofort · Unverbindlich',
    text: 'Sie sehen Ihre Ersteinschätzung und erhalten die Empfehlung: Reicht ein Kostenvoranschlag oder brauchen Sie ein unabhängiges Gutachten?',
  },
]

export default function ErsteinschaetzungPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kostenlose KI-Ersteinschätzung Kfz-Schaden',
            description:
              'KI-basierte Sofortbewertung von Kfz-Unfallschäden. Fotos hochladen, in unter 15 Minuten erhalten Sie Reparaturkosten-Schätzung, Wiederbeschaffungswert und Gutachten-Empfehlung.',
            url: `${SITE_URL}/ersteinschaetzung`,
          }),
          howToSchema({
            name: 'Kfz-Schaden kostenlos ersteinschätzen lassen',
            description:
              'In 3 Schritten zur kostenlosen KI-Ersteinschätzung Ihres Kfz-Schadens.',
            totalTime: 'PT5M',
            estimatedCost: { currency: 'EUR', value: '0' },
            schritte: [
              {
                name: 'Fotos und Unfallbeschreibung hochladen',
                text: 'Fotografieren Sie den Schaden aus verschiedenen Winkeln. Beschreiben Sie Unfallhergang und Fahrzeug in wenigen Sätzen. Dauer: ca. 5 Minuten, keine Anmeldung erforderlich.',
              },
              {
                name: 'KI analysiert den Schaden',
                text: 'Unsere KI analysiert Fotos und Beschreibung und liefert in Sekunden eine Kostenindikation sowie die Einschätzung ob ein DAT-Gutachten sinnvoll ist.',
              },
              {
                name: 'Ersteinschätzung und Handlungsempfehlung erhalten',
                text: 'Sie erhalten geschätzte Reparaturkosten, Wiederbeschaffungswert und die Empfehlung: Kostenvoranschlag oder unabhängiges Gutachten. Bei Bedarf vermitteln wir sofort einen Sachverständigen.',
              },
            ],
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'KI-Ersteinschätzung', url: '/ersteinschaetzung' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden py-16 text-center sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 20% 15%, rgba(123,163,204,0.22), transparent 50%)',
              'radial-gradient(circle at 85% 35%, rgba(69,115,162,0.14), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-glass-pill backdrop-blur-md sm:text-sm">
            <Brain className="h-3.5 w-3.5" />
            Kostenlos · Sofort · Unverbindlich
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Ihr Schaden. In Sekunden bewertet.
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            KI analysiert Ihre Fotos — Reparaturkosten, Wiederbeschaffungswert und Gutachten-Empfehlung in unter 15 Minuten.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              Jetzt kostenlos einschätzen lassen
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle="KI-Analyse · < 15 Min · 0 € Kosten">
            <strong>Die kostenlose KI-Ersteinschätzung von Claimondo</strong> analysiert Fotos
            und Beschreibung Ihres Kfz-Schadens und liefert in unter 15 Minuten: eine Schätzung
            der Reparaturkosten, den voraussichtlichen Wiederbeschaffungswert und die Empfehlung
            ob ein unabhängiges DAT-Gutachten sinnvoll ist (ab ca. 750 € Schaden haben Sie nach
            §249 BGB Anspruch darauf). Die Ersteinschätzung ist kostenlos und unverbindlich —
            sie ersetzt kein offizielles Gutachten, hilft Ihnen aber sofort den nächsten
            richtigen Schritt zu entscheiden.
          </AnswerCapsule>
        </div>
      </section>

      {/* Was Sie bekommen */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-ios-lg p-8">
            <h2
              className="mb-6 text-2xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Das bekommen Sie — kostenlos
            </h2>
            <ul className="space-y-4">
              {ERGEBNIS_PUNKTE.map((p) => {
                const Icon = p.icon
                return (
                  <li key={p.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-4 w-4 text-claimondo-ondo" />
                    </div>
                    <span className="text-base text-claimondo-shield">{p.text}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* Wie es funktioniert */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-10 text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            In 3 Schritten zur Ersteinschätzung
          </h2>
          <div className="space-y-6">
            {SCHRITTE.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.nr}
                  className="flex items-start gap-6 rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md sm:p-7"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="flex-shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
                      <Icon className="h-7 w-7 text-claimondo-ondo" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black text-claimondo-border">{s.nr}</span>
                      <div>
                        <h3 className="text-lg font-bold text-claimondo-navy">{s.title}</h3>
                        <p className="text-sm font-semibold text-claimondo-ondo">{s.subtitle}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Ab 750 € Info-Box */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-ios-lg border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6">
            <h3 className="mb-2 font-bold text-claimondo-navy">
              Ab ca. 750 € Schaden: Gutachten statt Kostenvoranschlag
            </h3>
            <p className="text-sm leading-relaxed text-claimondo-shield">
              Ab einem Schadenswert von ca. 750 € haben Sie nach §249 BGB und ständiger
              BGH-Rechtsprechung Anspruch auf ein unabhängiges Sachverständigengutachten —
              das der Gegner bezahlen muss. Ein Gutachten sichert deutlich mehr Positionen
              als ein Werkstatt-Kostenvoranschlag (Wertminderung, UPE-Aufschläge,
              Verbringungskosten). Unsere KI-Ersteinschätzung zeigt Ihnen sofort ob das für
              Sie gilt.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 25% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 75% 80%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2
            className="text-3xl font-bold text-white sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Jetzt kostenlos einschätzen lassen.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            5 Minuten. Keine Anmeldung. 0 € Kosten.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              Ersteinschätzung starten
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              0221 25906530
            </a>
          </div>
        </div>
      </section>

      <TrustBlock
        stats={[
          { wert: '< 15 Min', label: 'Ergebnis-Zeit' },
          { wert: '0 €', label: 'KI-Check' },
          { wert: '§249 BGB', label: 'Anspruchs-Basis' },
          { wert: '89+', label: 'Sachverständige' },
        ]}
      />

      <LandingFooter />
      <StickyCallBar quelle="Ersteinschätzung" />
    </div>
  )
}
