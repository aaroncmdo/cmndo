import type { Metadata } from 'next'
import Link from 'next/link'
import { Handshake, TrendingUp, Users, ChevronRight, Euro, Clock, Shield, CheckCircle2, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, MAKLER_LANDING_URL, GUTACHTER_LANDING_URL, PHONE_DISPLAY, CONTACT_EMAIL } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Makler Partner werden — Kfz-Schäden direkt vermitteln | Claimondo',
  description:
    'Als Versicherungsmakler Ihren Kunden bei Kfz-Unfallschäden helfen. Claimondo übernimmt Gutachter-Koordination, Schadensabwicklung und Regulierung. Kostenlose Kooperation — Mehrwert für Ihre Kunden.',
  keywords: [
    'Versicherungsmakler Partner',
    'Makler Kooperation Kfz-Schaden',
    'Kfz-Schadensvermittlung Makler',
    'Schadensabwicklung Partner',
    'Makler Mehrwert Kunden',
    'Unfallschaden Kooperation',
    'Kfz-Sachverständiger Netzwerk Makler',
    'Partner werden Versicherung',
  ],
  alternates: {
    canonical: `${MAKLER_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${MAKLER_LANDING_URL}/`,
    title: 'Makler Partner werden — Kfz-Schäden professionell abwickeln',
    description: 'Kooperation ohne Kosten. Ihre Kunden bekommen Top-Service, Sie stärken die Kundenbindung.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo Makler-Partnerschaft' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Makler Partner werden — Claimondo',
    description: 'Kfz-Schadensabwicklung für Ihre Kunden. Ohne Aufwand, ohne Kosten.',
    images: ['/og-default.png'],
  },
}

const VORTEILE = [
  {
    icon: TrendingUp,
    title: 'Mehr Kundenbindung',
    text: 'Sie begleiten Ihre Kunden durch den gesamten Schadensfall. Vom Gutachten bis zur Auszahlung — als verlässlicher Partner an ihrer Seite.',
  },
  {
    icon: Euro,
    title: 'Keine Kosten für Sie',
    text: 'Die Kooperation ist für Makler vollständig kostenlos. Claimondo rechnet direkt mit der gegnerischen Haftpflichtversicherung ab.',
  },
  {
    icon: Users,
    title: 'Persönlicher Ansprechpartner',
    text: 'Kein Ticketsystem, kein Callcenter. Sie erreichen direkt das Claimondo-Team — für Sie und für Ihre Kunden.',
  },
  {
    icon: Shield,
    title: 'Rechtssichere Abwicklung',
    text: 'Unabhängige Sachverständige, vollständige Dokumentation, Durchsetzung aller Ansprüche nach §249 BGB. Ihre Kunden sind in guten Händen.',
  },
]

const ABLAUF = [
  {
    nr: '01',
    title: 'Kunde meldet Schaden bei Ihnen',
    text: 'Ihr Kunde hat einen Unfall. Er wendet sich an Sie — wie gewohnt. Sie reichen den Fall an Claimondo weiter: per Telefon, WhatsApp oder Online-Formular.',
  },
  {
    nr: '02',
    title: 'Claimondo koordiniert alles',
    text: 'Wir beauftragen einen unabhängigen Sachverständigen in der Nähe, holen das Gutachten ein und kümmern uns um die Schadensabwicklung mit der Versicherung.',
  },
  {
    nr: '03',
    title: 'Ihr Kunde bekommt sein Geld',
    text: 'Voller Schadensersatz — inklusive Wertminderung, Nutzungsausfall und UPE-Aufschlägen. Sie sehen den Status jederzeit in Ihrem Partner-Portal.',
  },
]

const ZAHLEN = [
  { wert: '89+', label: 'Sachverständige bundesweit' },
  { wert: '< 48h', label: 'Ø Gutachten-Termin' },
  { wert: '97%', label: 'Regulierungsquote' },
  { wert: '0 €', label: 'Kosten für Makler' },
]

export default function MaklerPartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Claimondo Makler-Partnerschaft',
            description:
              'Versicherungsmakler kooperieren mit Claimondo, um ihren Kunden bei Kfz-Unfallschäden eine vollständige Schadensabwicklung zu bieten — inklusive Gutachter, Regulierung und Durchsetzung aller Ansprüche.',
            url: `${MAKLER_LANDING_URL}/`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Makler Partner werden', url: `${MAKLER_LANDING_URL}/` },
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-claimondo-ondo shadow-[0_2px_12px_rgba(13,27,62,0.06)] backdrop-blur-md sm:text-sm">
            <Handshake className="h-3.5 w-3.5" />
            Kostenlose Kooperation · Kein Aufwand · Mehr Kundenbindung
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Mehr Service für Ihre Kunden. Ohne Mehraufwand.
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            Als Claimondo-Maklerpartner bieten Sie Ihren Kunden bei Kfz-Unfallschäden eine vollständige Schadensabwicklung — wir koordinieren Gutachter und Regulierung, Sie stärken die Kundenbindung.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Makler-Partnerschaft%20anfragen`}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              Partnerschaft anfragen
              <ChevronRight className="h-5 w-5" />
            </a>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-claimondo-border bg-white/70 px-7 py-3.5 text-base font-semibold text-claimondo-navy backdrop-blur-sm transition-all hover:bg-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle="Makler-Kooperation · 0 € Kosten · Bundesweit">
            <strong>Die Claimondo Makler-Partnerschaft</strong> ermöglicht Versicherungsmaklern,
            ihren Kunden bei Kfz-Unfallschäden echten Mehrwert zu bieten: Claimondo koordiniert
            den unabhängigen Sachverständigen, holt das Gutachten ein und übernimmt die gesamte
            Regulierung mit der gegnerischen Haftpflichtversicherung. Der Makler bleibt
            Ansprechpartner des Kunden — ohne eigenen Aufwand. Die Kooperation ist kostenlos,
            da Claimondo direkt mit der Versicherung abrechnet. Kontakt per E-Mail oder Telefon.
          </AnswerCapsule>
        </div>
      </section>

      {/* Zahlen */}
      <section className="py-10">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {ZAHLEN.map((z) => (
              <div
                key={z.label}
                className="flex flex-col items-center rounded-3xl border border-white/60 bg-white/70 p-5 text-center shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <span
                  className="text-3xl font-black text-claimondo-navy"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {z.wert}
                </span>
                <span className="mt-1 text-xs text-claimondo-shield">{z.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vorteile */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-8 text-center text-2xl font-bold text-claimondo-navy sm:text-3xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Was die Partnerschaft Ihnen bringt
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {VORTEILE.map((v) => {
              const Icon = v.icon
              return (
                <div
                  key={v.title}
                  className="flex gap-5 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                    <Icon className="h-5 w-5 text-claimondo-ondo" />
                  </div>
                  <div>
                    <h3
                      className="font-bold text-claimondo-navy"
                      style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                    >
                      {v.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">{v.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Ablauf */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-10 text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            So funktioniert die Kooperation
          </h2>
          <div className="space-y-5">
            {ABLAUF.map((s) => (
              <div
                key={s.nr}
                className="flex items-start gap-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md sm:p-7"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <span
                  className="flex-shrink-0 text-4xl font-black text-claimondo-border"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {s.nr}
                </span>
                <div>
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Checkliste */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-3xl p-8">
            <h2
              className="mb-6 text-xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Was wir von unseren Maklerpartnern erwarten
            </h2>
            <ul className="space-y-4">
              {[
                'Zugelassener Versicherungsvermittler (§34d GewO)',
                'Bereitschaft, Schadenfälle aktiv an Claimondo zu vermitteln',
                'Direkte Kommunikation mit Ihren Kunden — wir koordinieren den Rest',
                'Einverständnis des Kunden zur Datenweitergabe (DSGVO-konform)',
              ].map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-claimondo-ondo/10">
                    <CheckCircle2 className="h-4 w-4 text-claimondo-ondo" />
                  </div>
                  <span className="text-sm leading-relaxed text-claimondo-shield">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Alternativ: Gutachter werden */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-3xl border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              Sie sind Kfz-Sachverständiger und suchen Aufträge?
            </p>
            <Link
              href={GUTACHTER_LANDING_URL}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Als Gutachter Partner werden
              <ChevronRight className="h-4 w-4" />
            </Link>
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
            Partnerschaft anfragen.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kostenlos. Unverbindlich. In 24 Stunden Rückmeldung.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Makler-Partnerschaft%20anfragen`}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Handshake className="h-5 w-5" />
              {CONTACT_EMAIL}
            </a>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY} anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Makler Partner werden" />
    </div>
  )
}
