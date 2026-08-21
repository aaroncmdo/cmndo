import type { Metadata } from 'next'
import Link from 'next/link'
import { Wrench, Search, Euro, Shield, Handshake, CheckCircle2, ChevronRight, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, WERKSTATT_LANDING_URL, GUTACHTER_LANDING_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'

// Seit #4451 live: oeffentliche Werkstatt-Selbstregistrierung in der App —
// die CTAs zeigen dorthin statt auf mailto (sofort aktives Konto statt Mail-Pingpong).
const REGISTRIEREN_URL = 'https://app.claimondo.de/werkstatt/registrieren'

export const metadata: Metadata = {
  // 71 Zeichen mit dem " | Claimondo", das das Layout anhaengt — Google zeigt
  // rund 60. Der Zusatz "über Claimondo" nannte die Marke ausserdem ein zweites
  // Mal (dieselbe Doppelung wie in #5352). openGraph.title unten behaelt die
  // ausfuehrliche Fassung, dort ist mehr Platz.
  title: 'Werkstatt Partner werden — Reparaturaufträge',
  // 202 Zeichen — Google zeigt rund 160, der Rest wird abgeschnitten. Die
  // Provisions-Aussage bleibt vollstaendig ("nur auf tatsaechlich vermittelte"),
  // weil sie ohne ihre Einschraenkung eine andere Zusage waere.
  description:
    'Als Kfz-Werkstatt Reparaturaufträge aus dem Claimondo-Netzwerk erhalten. Kostenlos gelistet, Provision nur auf tatsächlich vermittelte Aufträge.',
  keywords: [
    'Werkstatt Partner werden',
    'Kfz-Werkstatt Aufträge',
    'Reparaturaufträge Werkstatt',
    'Werkstatt-Finder',
    'Unfallschaden Werkstatt',
    'Karosserie Partner Netzwerk',
    'Werkstatt Kooperation Kfz-Schaden',
    'Partner werden Werkstatt',
  ],
  alternates: {
    canonical: `${WERKSTATT_LANDING_URL}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${WERKSTATT_LANDING_URL}/`,
    title: 'Werkstatt Partner werden — Reparaturaufträge über den Finder',
    description: 'Kostenlos gelistet, Aufträge über den Werkstatt-Finder, Provision nur auf Erfolg.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Claimondo Werkstatt-Partnerschaft' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Werkstatt Partner werden — Claimondo',
    description: 'Reparaturaufträge über den Werkstatt-Finder. Kostenlos gelistet, Provision nur auf Erfolg.',
    images: ['/og-default.png'],
  },
}

const VORTEILE = [
  {
    icon: Search,
    title: 'Aufträge über den Werkstatt-Finder',
    text: 'Unverschuldet geschädigte Autofahrer finden über den Claimondo-Werkstatt-Finder direkt Ihren Betrieb. Sie erhalten Reparaturaufträge, ohne selbst Akquise zu betreiben.',
  },
  {
    icon: Euro,
    title: 'Kostenlos gelistet — Provision nur auf Erfolg',
    text: 'Die Aufnahme ins Netzwerk und der Eintrag im Finder sind kostenlos. Eine Provision fällt ausschließlich auf tatsächlich über Claimondo vermittelte Aufträge an — keine Grundgebühr, kein Risiko.',
  },
  {
    icon: Shield,
    title: 'Rechtssichere Haftpflicht-Abwicklung',
    text: 'Claimondo koordiniert das unabhängige Gutachten und regelt mit der gegnerischen Haftpflichtversicherung nach §249 BGB. Ihr Kunde ist abgesichert — Sie konzentrieren sich auf die Reparatur.',
  },
  {
    icon: Handshake,
    title: 'Persönlicher Ansprechpartner',
    text: 'Kein Ticketsystem, kein Callcenter. Sie erreichen direkt das Claimondo-Team — für Ihren Betrieb und für Ihre Kunden.',
  },
]

const ABLAUF = [
  {
    nr: '01',
    title: 'Kostenlos als Partner-Werkstatt eintragen',
    text: 'Sie melden Ihren Betrieb bei Claimondo an — kostenlos und unverbindlich. Ihre Werkstatt erscheint im Werkstatt-Finder. Auf Wunsch senden wir Ihnen einen Claimondo-Aufsteller fürs Schaufenster.',
  },
  {
    nr: '02',
    title: 'Claimondo vermittelt geschädigte Kunden',
    text: 'Unverschuldet Geschädigte in Ihrer Nähe werden über den Finder zu Ihnen vermittelt. Wir koordinieren den unabhängigen Gutachter und die Abwicklung mit der gegnerischen Haftpflichtversicherung.',
  },
  {
    nr: '03',
    title: 'Sie reparieren, wir regulieren',
    text: 'Sie führen die Reparatur fachgerecht aus. Claimondo setzt alle Ansprüche gegen die gegnerische Versicherung durch — die Provision fällt nur auf den vermittelten Auftrag an.',
  },
]

const ZAHLEN = [
  { wert: 'BVSK', label: 'zertifiziertes Partner-Netzwerk' },
  { wert: '0 €', label: 'Aufnahme & Finder-Eintrag' },
  { wert: '§249', label: 'BGB-konforme Regulierung' },
  { wert: '< 48h', label: 'Ø Gutachten-Termin' },
]

export default function WerkstattPartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Claimondo Werkstatt-Partnerschaft',
            description:
              'Kfz-Werkstätten erhalten über den Claimondo-Werkstatt-Finder Reparaturaufträge von unverschuldet geschädigten Autofahrern. Claimondo koordiniert Gutachten und Regulierung mit der gegnerischen Haftpflichtversicherung; die Aufnahme ist kostenlos, eine Provision fällt nur auf tatsächlich vermittelte Aufträge an.',
            url: `${WERKSTATT_LANDING_URL}/`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Werkstatt Partner werden', url: `${WERKSTATT_LANDING_URL}/` },
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
            <Wrench className="h-3.5 w-3.5" />
            Kostenlos gelistet · Aufträge über den Finder · Provision nur auf Erfolg
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Mehr Reparaturaufträge. Ohne eigene Akquise.
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            Als Claimondo-Partnerwerkstatt erhalten Sie Reparaturaufträge von unverschuldet geschädigten Autofahrern — vermittelt über den Werkstatt-Finder, kostenlos gelistet, mit rechtssicherer Abwicklung über die gegnerische Haftpflicht.
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
              href={`tel:${PHONE_E164}`}
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
          <AnswerCapsule quelle="Werkstatt-Partnerschaft · 0 € Aufnahme · Provision nur auf Erfolg">
            <strong>Die Claimondo Werkstatt-Partnerschaft</strong> bringt Kfz-Werkstätten
            Reparaturaufträge: Unverschuldet geschädigte Autofahrer werden über den
            Werkstatt-Finder an Partnerbetriebe in ihrer Nähe vermittelt. Claimondo koordiniert
            das unabhängige Gutachten und die Regulierung mit der gegnerischen
            Haftpflichtversicherung. Die Aufnahme ins Netzwerk ist kostenlos — eine Provision
            fällt ausschließlich auf tatsächlich vermittelte Aufträge an. Kontakt per E-Mail
            oder Telefon.
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
            Was die Partnerschaft Ihrem Betrieb bringt
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
            So funktioniert die Kooperation
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

      {/* Checkliste */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-3xl p-8">
            <h2
              className="mb-6 text-xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Was wir von unseren Partner-Werkstätten erwarten
            </h2>
            <ul className="space-y-4">
              {[
                'Meisterbetrieb oder qualifizierte Kfz-Fachwerkstatt',
                'Fachgerechte Reparatur nach Herstellervorgaben',
                'Zusammenarbeit mit dem unabhängigen Gutachter',
                'Transparente Kommunikation mit Kunde und Claimondo',
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
            Partner-Werkstatt werden.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kostenlos. Unverbindlich. Sofort startklar.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={REGISTRIEREN_URL}
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Wrench className="h-5 w-5" />
              Kostenlos registrieren
            </a>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY} anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Werkstatt Partner werden" />
    </div>
  )
}
