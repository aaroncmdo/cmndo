import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, Mail, MessageCircle, ChevronRight, Clock, Shield, Users, CheckCircle2 } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, PHONE_DISPLAY, CONTACT_EMAIL } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Kostenlose Beratung anfragen — Kfz-Unfallschaden · Claimondo',
  description:
    'Kostenlose Erstberatung zu Ihrem Kfz-Unfallschaden. Kein Callcenter — ein Fachmann meldet sich innerhalb von 15 Minuten. Telefon, WhatsApp oder E-Mail.',
  keywords: [
    'Kfz-Schaden Beratung kostenlos',
    'Unfallschaden Beratung',
    'Schadensberatung anfragen',
    'Verkehrsunfall Beratung',
    'kostenloses Erstgespräch',
    'Kfz-Anwalt Beratung',
    'Sachverständiger Beratung',
  ],
  alternates: {
    canonical: '/beratung-anfragen',
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/beratung-anfragen`,
    title: 'Kostenlose Beratung anfragen — Kfz-Unfallschaden',
    description: 'Kein Callcenter — ein Fachmann meldet sich innerhalb von 15 Minuten. 0 € Kosten.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Beratung anfragen Claimondo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kostenlose Beratung anfragen — Claimondo',
    description: 'Kein Callcenter — ein Fachmann in unter 15 Minuten.',
    images: ['/og-default.png'],
  },
}

const KONTAKT_OPTIONEN = [
  {
    icon: Phone,
    title: 'Direkt anrufen',
    subtitle: 'Mo–Fr 8–18 Uhr · Sofort',
    text: 'Kein Warteschleifensystem, kein Callcenter. Sie sprechen direkt mit einem Schadensberater aus unserem Kölner Team.',
    action: { label: `${PHONE_DISPLAY} anrufen`, href: 'tel:+4922125906530' },
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp-Nachricht',
    subtitle: 'Antwort < 15 Min · Ganztags',
    text: 'Schicken Sie Fotos und Unfallbeschreibung direkt per WhatsApp. Wir antworten in unter 15 Minuten während der Geschäftszeiten.',
    action: { label: 'WhatsApp öffnen', href: 'https://wa.me/4922125906530' },
  },
  {
    icon: Mail,
    title: 'Per E-Mail',
    subtitle: 'Antwort gleicher Tag',
    text: 'Für ausführliche Fragen oder wenn Sie Dokumente anhängen möchten. Antwort noch am gleichen Werktag.',
    action: { label: `${CONTACT_EMAIL}`, href: `mailto:${CONTACT_EMAIL}` },
  },
]

const VERTRAUENS_PUNKTE = [
  { icon: Clock, text: 'Antwort in unter 15 Minuten während der Geschäftszeiten' },
  { icon: Shield, text: 'Erstberatung komplett kostenlos — kein Risiko' },
  { icon: Users, text: 'Direkter Kontakt zum Claimondo-Team in Köln' },
  { icon: CheckCircle2, text: 'Keine Bindung — Sie entscheiden nach dem Gespräch' },
]

export default function BeratungAnfragenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kostenlose Kfz-Schadensberatung',
            description:
              'Unverbindliche Erstberatung zu Kfz-Unfallschäden durch das Claimondo-Team. Erreichbar per Telefon, WhatsApp und E-Mail. Antwort in unter 15 Minuten.',
            url: `${SITE_URL}/beratung-anfragen`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Beratung anfragen', url: '/beratung-anfragen' },
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
            0 € · Kein Callcenter · Direkter Kontakt
          </div>
          <h1
            className="text-balance text-[2.25rem] font-bold leading-[1.05] tracking-[-0.02em] text-claimondo-navy sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Kostenlose Beratung. Direkt. Persönlich.
          </h1>
          <p className="mt-5 text-balance text-base text-claimondo-ondo sm:text-lg">
            Kein Warteschleifensystem. Ein Fachmann aus Köln meldet sich in unter 15 Minuten.
          </p>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="pb-4 pt-2 sm:pb-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <AnswerCapsule quelle="Erstberatung · < 15 Min · 0 € Kosten">
            <strong>Die kostenlose Beratung bei Claimondo</strong> ist unverbindlich und ohne
            Risiko. Ein Schadensberater aus unserem Kölner Team klärt mit Ihnen ob und wie
            wir helfen können: Haftungsfrage, Schadenshöhe, ob ein Gutachten sinnvoll ist,
            und welche Positionen die gegnerische Versicherung erstatten muss. Sie können
            per Telefon (Mo–Fr 8–18 Uhr), WhatsApp oder E-Mail Kontakt aufnehmen.
            Kein Callcenter — direkter Draht zum Team.
          </AnswerCapsule>
        </div>
      </section>

      {/* Kontakt-Optionen */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2
            className="mb-8 text-center text-2xl font-bold text-claimondo-navy sm:text-3xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            So erreichen Sie uns
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {KONTAKT_OPTIONEN.map((o) => {
              const Icon = o.icon
              return (
                <div
                  key={o.title}
                  className="flex flex-col rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                    <Icon className="h-6 w-6 text-claimondo-ondo" />
                  </div>
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {o.title}
                  </h3>
                  <p className="mt-0.5 text-sm font-semibold text-claimondo-ondo">{o.subtitle}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-claimondo-shield">{o.text}</p>
                  <a
                    href={o.action.href}
                    {...(o.action.href.startsWith('https') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-claimondo-ondo px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-claimondo-light-blue"
                  >
                    {o.action.label}
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Vertrauen */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="glass-card rounded-3xl p-8">
            <h2
              className="mb-6 text-xl font-bold text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Was Sie von der Beratung erwarten können
            </h2>
            <ul className="space-y-4">
              {VERTRAUENS_PUNKTE.map((p) => {
                const Icon = p.icon
                return (
                  <li key={p.text} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-claimondo-ondo/10">
                      <Icon className="h-4 w-4 text-claimondo-ondo" />
                    </div>
                    <span className="text-sm leading-relaxed text-claimondo-shield">{p.text}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* Alternativ: direkt melden */}
      <section className="py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="rounded-3xl border border-claimondo-ondo/20 bg-claimondo-ondo/5 p-6 text-center">
            <p className="text-sm text-claimondo-shield">
              Oder direkt starten — ohne Telefonat:
            </p>
            <Link
              href="/schaden-melden"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-claimondo-navy px-6 py-3 text-sm font-bold text-white transition-all hover:bg-claimondo-shield"
            >
              Schaden online melden — 5 Minuten
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
            Jetzt kostenlos beraten lassen.
          </h2>
          <p className="mt-3 text-lg text-white/65">
            Kein Risiko. Kein Callcenter. Kein Papierkram.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_28px_rgba(69,115,162,0.45)] transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY} anrufen
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              Online melden
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Beratung anfragen" />
    </div>
  )
}
