import type { Metadata } from 'next'
import Link from 'next/link'
import { Camera, Brain, UserCheck, FileText, ChevronRight, Clock, Shield, Star, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { serviceSchema, howToSchema, breadcrumbsSchema, jsonLdScript, SITE_URL } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Wie es funktioniert — In 3 Schritten zum vollen Schadensersatz',
  description:
    'Foto, KI-Einschätzung, Gutachter vor Ort: In 3 Schritten zum vollen Anspruch. Erste Bewertung in unter 15 Minuten, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte.',
  keywords: [
    'Kfz-Schaden melden',
    'Unfallschaden online',
    'KI-Schadensbewertung',
    'Gutachter Termin online',
    'Schaden Foto hochladen',
    'Sachverständiger vor Ort',
    'digitale Schadensregulierung',
  ],
  alternates: {
    canonical: '/wie-es-funktioniert',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/wie-es-funktioniert`,
    title: 'Wie es funktioniert — In 3 Schritten zum vollen Schadensersatz',
    description:
      'Foto · KI-Einschätzung · Gutachter vor Ort. Antwort unter 15 Min, Termin unter 48 h.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'So funktioniert Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wie es funktioniert — In 3 Schritten zum vollen Schadensersatz',
    description: 'Foto · KI-Einschätzung · Gutachter vor Ort.',
    images: ['/og-default.png'],
  },
}

const SCHRITTE = [
  {
    nr: '01',
    icon: Camera,
    farbe: 'text-[#4573A2]',
    bg: 'bg-[#4573A2]/10',
    border: 'border-[#4573A2]/20',
    title: 'Schaden erfassen',
    subtitle: '5 Minuten · Keine Anmeldung nötig',
    text: 'Beschreiben Sie kurz den Unfallhergang und laden Sie Fotos hoch — oder diktieren Sie uns den Schaden per Sprache. Wir brauchen keinen Papierkram, keine Formulare, kein Fax.',
    details: [
      'Fotos vom Schaden hochladen',
      'Unfallhergang in Textform oder Sprache',
      'Fahrzeugdaten (optional, erleichtert die Einschätzung)',
      'Kontaktdaten für Rückfragen',
    ],
  },
  {
    nr: '02',
    icon: Brain,
    farbe: 'text-[#1E3A5F]',
    bg: 'bg-[#1E3A5F]/10',
    border: 'border-[#1E3A5F]/20',
    title: 'KI-Ersteinschätzung',
    subtitle: 'Sofort · Kostenlos · Unverbindlich',
    text: 'Unsere KI analysiert Fotos und Beschreibung und liefert in Sekunden eine erste Einschätzung: Reparaturkosten, Wiederbeschaffungswert und ob sich ein Gutachten lohnt.',
    details: [
      'Geschätzte Reparaturkosten',
      'Wiederbeschaffungswert des Fahrzeugs',
      'Empfehlung: Gutachten oder Kostenvoranschlag',
      'Einschätzung der Regulierungschancen',
    ],
  },
  {
    nr: '03',
    icon: UserCheck,
    farbe: 'text-[#0D1B3E]',
    bg: 'bg-[#0D1B3E]/10',
    border: 'border-[#0D1B3E]/20',
    title: 'Gutachter & Anwalt',
    subtitle: '48h Bericht · 0 € für Sie',
    text: 'Ein unabhängiger Gutachter aus Ihrem Umkreis kommt zu Ihnen. Der Bericht liegt in 48 Stunden vor. Unsere Partnerkanzlei reguliert danach Ihren vollen Anspruch gegenüber der gegnerischen Versicherung.',
    details: [
      'Terminvereinbarung am selben oder nächsten Tag',
      'Gutachter kommt zu Ihnen — kein Werkstattbesuch nötig',
      'Bericht innerhalb von 48 Stunden',
      'Anwalt übernimmt vollständige Regulierung',
    ],
  },
]

const FAKTEN = [
  { icon: Clock, label: 'Ø Regulierungsdauer', wert: '6–8 Wochen' },
  { icon: Shield, label: 'Kostenübernahme', wert: '100 % durch Gegner' },
  { icon: Star, label: 'Kundenzufriedenheit', wert: '4,8 / 5,0' },
  { icon: FileText, label: 'Erfolgreiche Regulierungen', wert: '2.400+' },
]

export default function WieEsFunktioniertPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Digitale Kfz-Schadensregulierung',
            description:
              '3-Schritt-Prozess: 1) Online Schaden melden mit Foto und KI-Vorbewertung, 2) Sachverständiger erstellt Gutachten vor Ort, 3) Anwalt setzt vollen Anspruch durch. Antwort unter 15 Min, Termin unter 48 h.',
            url: `${SITE_URL}/wie-es-funktioniert`,
          }),
          howToSchema({
            name: 'Kfz-Schaden in 3 Schritten regulieren',
            description:
              'Vom Unfallfoto bis zur Auszahlung: So holen unverschuldet Geschädigte mit Claimondo den vollen Schadensersatz ohne Eigenanteil.',
            totalTime: 'PT15M',
            estimatedCost: { currency: 'EUR', value: '0' },
            schritte: [
              {
                name: 'Schaden erfassen',
                text: 'Beschreiben Sie kurz den Unfallhergang und laden Fotos hoch, oder diktieren Sie uns den Schaden per Sprache. Kein Papierkram, keine Formulare. Dauer: ca. 5 Minuten ohne Anmeldung.',
              },
              {
                name: 'KI-Ersteinschätzung',
                text: 'Unsere KI bewertet die hochgeladenen Fotos sofort: Schweregrad, mutmaßlicher Reparaturaufwand, voraussichtliche Wertminderung. Sie erhalten in unter 15 Minuten eine erste Indikation.',
              },
              {
                name: 'Gutachter vor Ort + Anwalt durchsetzen',
                text: 'Wir vermitteln einen unabhängigen DAT-Sachverständigen in Ihrer Region — Termin in unter 48 Stunden. Unsere Partnerkanzlei setzt anschließend den vollen Anspruch gegen die gegnerische Versicherung durch (§249 BGB).',
              },
            ],
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Wie es funktioniert', url: '/wie-es-funktioniert' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />

      {/* Header — Glass-Pass mit Spotlights */}
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
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-xs font-semibold text-[#4573A2] shadow-[0_2px_12px_rgba(13,27,62,0.06)] backdrop-blur-md sm:text-sm">
            So einfach geht&apos;s
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-[#0D1B3E] sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Ihr Unfall. Unser Problem.
          </h1>
          <p className="mt-5 text-balance text-base text-[#4573A2] sm:text-lg">
            In 3 Schritten zum vollen Schadensersatz — wir übernehmen alles.
          </p>
        </div>
      </section>

      {/* Fakten-Strip — Glass */}
      <div className="border-y border-white/50 bg-white/60 backdrop-blur-md">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-white/40 md:grid-cols-4">
          {FAKTEN.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.label} className="flex flex-col items-center py-6 text-center">
                <Icon className="mb-2 h-5 w-5 text-[#4573A2]" />
                <div className="text-xl font-extrabold text-[#0D1B3E]">{f.wert}</div>
                <div className="mt-0.5 text-xs text-[#4573A2]">{f.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Schritte */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl space-y-12 px-4 sm:px-6">
          {SCHRITTE.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={s.nr}
                className={`flex flex-col gap-8 rounded-3xl border border-white/60 bg-white/70 p-8 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md transition-all duration-200 hover:bg-white/85 hover:shadow-[0_8px_28px_rgba(13,27,62,0.10)] md:flex-row md:items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <div className="flex-shrink-0">
                  <div className={`flex h-20 w-20 items-center justify-center rounded-3xl border ${s.border} ${s.bg}`}>
                    <Icon className={`h-10 w-10 ${s.farbe}`} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-black text-[#e4e7ef]">{s.nr}</span>
                    <div>
                      <h2
                        className="text-2xl font-bold text-[#0D1B3E]"
                        style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                      >{s.title}</h2>
                      <div className="mt-0.5 text-sm font-semibold text-[#4573A2]">{s.subtitle}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-base leading-relaxed text-[#1E3A5F]">{s.text}</p>
                  <ul className="mt-6 space-y-2">
                    {s.details.map((d) => (
                      <li key={d} className="flex items-center gap-2 text-sm text-[#4573A2]">
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#4573A2]" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-[#0D1B3E] py-20 text-center">
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
            Bereit? Schaden jetzt melden.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kostenlos, unverbindlich, in 5 Minuten erledigt.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-[#4573A2] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-[#7BA3CC] active:scale-[0.98]"
            >
              Schaden melden
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

      <LandingFooter />
      <StickyCallBar quelle="Wie es funktioniert" />
    </div>
  )
}
