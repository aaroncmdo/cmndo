import type { Metadata } from 'next'
import Link from 'next/link'
import { Truck, LayoutDashboard, QrCode, Shield, Handshake, CheckCircle2, ChevronRight, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, FLOTTE_LANDING_URL, WERKSTATT_LANDING_URL, PHONE_DISPLAY } from '@/lib/seo/jsonld'

// Seit #5010 live: oeffentliche Flotten-Selbstregistrierung in der App —
// die CTAs zeigen direkt auf den Self-Signup (sofort aktives Flotten-Portal).
const REGISTRIEREN_URL = 'https://app.claimondo.de/flotte/registrieren'

export const metadata: Metadata = {
  // 72 Zeichen mit dem " | Claimondo", das das Layout anhaengt — Google zeigt
  // rund 60. "Fuhrpark" bleibt als Keyword drin, gekuerzt wird der Nachsatz.
  // openGraph.title unten behaelt die ausfuehrliche Fassung, dort ist mehr Platz.
  title: 'Flottenpartner werden — Fuhrpark-Schäden regeln',
  description:
    'Schadenmanagement für Firmen-Flotten: Fahrzeuge zentral verwalten, Schäden direkt am Fahrzeug melden lassen, unabhängige Gutachten und Regulierung über die gegnerische Haftpflicht. Kostenlos registrieren.',
  keywords: [
    'Flottenpartner werden',
    'Fuhrpark Schadenmanagement',
    'Flottenmanagement Unfall',
    'Firmenwagen Unfallabwicklung',
    'Flotte Schadenabwicklung',
    'Fuhrparkmanagement Kfz-Schaden',
    'Schadenmanagement Firmenflotte',
    'Poolfahrzeuge Schaden melden',
  ],
  alternates: {
    canonical: `${FLOTTE_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${FLOTTE_LANDING_URL}/`,
    title: 'Flottenpartner werden — Schadenmanagement für Ihren Fuhrpark',
    description: 'Fahrzeuge zentral verwalten, Schäden direkt am Fahrzeug melden, Regulierung über die gegnerische Haftpflicht.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo Flotten-Partnerschaft' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flottenpartner werden — Claimondo',
    description: 'Schadenmanagement für Firmen-Flotten. Kostenlos registrieren, Schäden ohne Aufwand abwickeln.',
    images: ['/og-default.png'],
  },
}

const VORTEILE = [
  {
    icon: LayoutDashboard,
    title: 'Alle Fahrzeuge und Schäden an einem Ort',
    text: 'Im Flotten-Portal verwalten Sie Ihren Fuhrpark zentral: jedes Fahrzeug, jeder Schaden, jeder Status auf einen Blick — statt E-Mail-Pingpong zwischen Fahrern, Werkstatt und Versicherung.',
  },
  {
    icon: QrCode,
    title: 'Schadenmeldung direkt am Fahrzeug',
    text: 'Jedes Fahrzeug erhält eine Claimondo-Netzwerkkarte. Ihre Fahrer melden einen Schaden direkt vor Ort — ohne Umweg über die Zentrale landet der Fall sofort im Portal und in der Abwicklung.',
  },
  {
    icon: Shield,
    title: 'Rechtssichere Haftpflicht-Abwicklung',
    text: 'Bei unverschuldeten Unfällen koordiniert Claimondo das unabhängige Gutachten und reguliert mit der gegnerischen Haftpflichtversicherung nach §249 BGB — die Kosten trägt die Gegenseite.',
  },
  {
    icon: Handshake,
    title: 'Kostenlos — mit persönlichem Ansprechpartner',
    text: 'Registrierung und Flotten-Portal sind kostenlos. Kein Ticketsystem, kein Callcenter: Sie erreichen direkt das Claimondo-Team — für Ihren Fuhrpark und Ihre Fahrer.',
  },
]

const ABLAUF = [
  {
    nr: '01',
    title: 'Kostenlos als Flotte registrieren',
    text: 'Firma und Ansprechpartner eintragen — in zwei Minuten erledigt. Sie erhalten sofort Zugang zum Flotten-Portal, kostenlos und unverbindlich.',
  },
  {
    nr: '02',
    title: 'Fahrzeuge anlegen und Netzwerkkarten binden',
    text: 'Sie hinterlegen Ihre Fahrzeuge im Portal und binden je Fahrzeug eine Netzwerkkarte. Ab dann kann jeder Fahrer einen Schaden direkt am Fahrzeug melden.',
  },
  {
    nr: '03',
    title: 'Schaden melden — Claimondo wickelt ab',
    text: 'Im Schadenfall koordiniert Claimondo den unabhängigen Gutachter, die Reparatur im Partner-Netzwerk und die Regulierung mit der gegnerischen Haftpflichtversicherung. Sie verfolgen alles live im Portal.',
  },
]

const ZAHLEN = [
  { wert: '0 €', label: 'Registrierung & Flotten-Portal' },
  { wert: '§249', label: 'BGB-konforme Regulierung' },
  { wert: '< 48h', label: 'Ø Gutachten-Termin' },
  { wert: 'BVSK', label: 'geprüftes Gutachter-Netzwerk' },
]

export default function FlottePartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Claimondo Flotten-Partnerschaft',
            description:
              'Schadenmanagement für Firmen-Flotten: Fuhrparks verwalten ihre Fahrzeuge zentral im Claimondo Flotten-Portal, Fahrer melden Schäden über Netzwerkkarten direkt am Fahrzeug, Claimondo koordiniert unabhängige Gutachten und die Regulierung mit der gegnerischen Haftpflichtversicherung. Registrierung und Portal sind kostenlos.',
            url: `${FLOTTE_LANDING_URL}/`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Flottenpartner werden', url: `${FLOTTE_LANDING_URL}/` },
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
            <Truck className="h-3.5 w-3.5" />
            Kostenloses Flotten-Portal · Schadenmeldung am Fahrzeug · Regulierung inklusive
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Schadenmanagement für Ihre Flotte. Ohne Aufwand.
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            Jeder Unfall im Fuhrpark kostet Zeit: Fahrer, Werkstatt, Gutachter, Versicherung. Als Claimondo-Flottenpartner verwalten Sie Fahrzeuge und Schäden zentral im Portal — und Claimondo übernimmt Gutachten und Regulierung über die gegnerische Haftpflicht.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={REGISTRIEREN_URL}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              Jetzt kostenlos registrieren
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
          <AnswerCapsule quelle="Flotten-Partnerschaft · 0 € Registrierung · Regulierung über die gegnerische Haftpflicht">
            <strong>Die Claimondo Flotten-Partnerschaft</strong> nimmt Fuhrparks das
            Schadenmanagement ab: Firmen verwalten ihre Fahrzeuge zentral im kostenlosen
            Flotten-Portal, Fahrer melden Schäden über Netzwerkkarten direkt am Fahrzeug, und
            Claimondo koordiniert das unabhängige Gutachten sowie die Regulierung mit der
            gegnerischen Haftpflichtversicherung nach §249 BGB. Registrierung in zwei Minuten,
            Kontakt per E-Mail oder Telefon.
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
                className="flex flex-col items-center rounded-3xl border border-white/60 bg-white/70 p-5 text-center shadow-glass-card backdrop-blur-md"
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
            Was die Partnerschaft Ihrem Fuhrpark bringt
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {VORTEILE.map((v) => {
              const Icon = v.icon
              return (
                <div
                  key={v.title}
                  className="flex gap-5 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md"
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
            So funktioniert das Flotten-Portal
          </h2>
          <div className="space-y-5">
            {ABLAUF.map((s) => (
              <div
                key={s.nr}
                className="flex items-start gap-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md sm:p-7"
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

      {/* Für wen */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-3xl p-8">
            <h2
              className="mb-6 text-xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Für wen sich das Flotten-Portal lohnt
            </h2>
            <ul className="space-y-4">
              {[
                'Handwerks- und Servicebetriebe mit Firmenwagen',
                'Pflege-, Liefer- und Logistikflotten im täglichen Einsatz',
                'Taxi-, Mietwagen- und Poolfahrzeug-Flotten',
                'Fuhrparks jeder Größe — geleast oder gekauft',
              ].map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-ios-xl bg-claimondo-ondo/10">
                    <CheckCircle2 className="h-4 w-4 text-claimondo-ondo" />
                  </div>
                  <span className="text-sm leading-relaxed text-claimondo-shield">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Alternativ: Werkstatt werden */}
      <section className="py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-3xl border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              Sie sind eine Kfz-Werkstatt und suchen Reparaturaufträge?
            </p>
            <Link
              href={WERKSTATT_LANDING_URL}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Als Werkstatt Partner werden
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
            Flottenpartner werden.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kostenlos. Unverbindlich. In zwei Minuten startklar.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={REGISTRIEREN_URL}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Truck className="h-5 w-5" />
              Kostenlos registrieren
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
      <StickyCallBar quelle="Flotte Partner werden" />
    </div>
  )
}
