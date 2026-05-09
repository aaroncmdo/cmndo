import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LinkIcon, Quote, Mail, Phone, ChevronRight } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import {
  organizationSchema, personSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, CONTACT_EMAIL,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Über uns — Das Team hinter Claimondo',
  description:
    'Wer steht hinter Claimondo? Lerne Nicolas Kitta (CEO) und Aaron Sprafke (COO) kennen — die zwei Gründer, die Kfz-Schadensregulierung in Deutschland verändern wollen.',
  alternates: {
    canonical: '/ueber-uns',
  },
  openGraph: {
    type: 'profile',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/ueber-uns`,
    title: 'Über uns — Das Team hinter Claimondo',
    description:
      'Nicolas Kitta (CEO) und Aaron Sprafke (COO) — die Gründer hinter der digitalen Kfz-Schadensregulierung Claimondo.',
    images: [{ url: '/brand/team-founders.png', width: 1200, height: 600, alt: 'Claimondo Founders' }],
  },
}

const FOUNDERS = [
  {
    name: 'Nicolas Kitta',
    rolle: 'CEO & Mitgründer',
    bioKurz:
      'Nicolas führt Claimondo strategisch und ist Ansprechpartner für Versicherer, Kanzlei-Partner und Investoren.',
    bioLang:
      'Nicolas hat Claimondo aus einer simplen Beobachtung heraus mitgegründet: zu viele Unfallgeschädigte unterschreiben in Deutschland Abfindungserklärungen, ohne zu wissen, dass sie damit ein Drittel ihres gesetzlichen Anspruchs verlieren. Bei Claimondo verantwortet er den Aufbau des Partner-Netzwerks aus Sachverständigen und Fachanwälten — und sorgt dafür, dass jeder Mandant denselben Standard bekommt, den sich Versicherungen für ihre eigenen Großkunden längst aufgebaut haben.',
    quote:
      '"Es geht nicht darum wer ich bin, sondern was ich tue. Daran wird man gemessen."',
    quoteAutor: 'Bruce Wayne',
    foto: '/brand/team-founders.png',
    fotoLabel: 'rechts im Bild',
    linkedin: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
  },
  {
    name: 'Aaron Sprafke',
    rolle: 'COO & Mitgründer',
    bioKurz:
      'Aaron baut die Claimondo-Plattform und verantwortet Operations — von der Foto-Schadenerfassung bis zur Auszahlung.',
    bioLang:
      'Aaron kommt aus Sales und Account-Management bei nextright und AdvoScale, wo er gesehen hat, wie viel Geld in jeder Schadenakte zwischen Versprechen und Auszahlung verloren geht. Bei Claimondo hat er die komplette technische Plattform aufgebaut: KI-gestützte Schadenerfassung, automatisches Gutachter-Matching nach Region und Fachgebiet, digitale Schutzbrief-Unterzeichnung — und sorgt dafür, dass dispatch, Sachverständige, Anwälte und Kunde dieselben Daten in Echtzeit sehen.',
    quote:
      '"Qualität bedeutet, es richtig zu machen, wenn niemand zuschaut."',
    quoteAutor: 'Henry Ford',
    foto: '/brand/team-founders.png',
    fotoLabel: 'links im Bild',
    linkedin: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
  },
]

const ZAHLEN = [
  { kpi: '0 €', label: 'Eigenanteil für unverschuldet Geschädigte' },
  { kpi: '< 15 Min', label: 'Antwort auf Ihre Schadenmeldung' },
  { kpi: '< 48 h', label: 'Termin mit Gutachter vor Ort' },
  { kpi: '50+', label: 'Partner-Sachverständige bundesweit' },
  { kpi: '33 %', label: 'mehr Schadensersatz vs. Direktabrechnung' },
  { kpi: '§249 BGB', label: 'Rechtliche Grundlage Ihres Anspruchs' },
]

export default function UeberUnsPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          organizationSchema(),
          ...FOUNDERS.map((f) =>
            personSchema({
              name: f.name,
              jobTitle: f.rolle,
              description: f.bioKurz,
              image: `${SITE_URL}${f.foto}`,
              sameAs: [f.linkedin],
              worksFor: { name: 'Claimondo', url: SITE_URL },
            }),
          ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Über uns', url: '/ueber-uns' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="bg-claimondo-navy py-20 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            Über Claimondo
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl">
            Wir machen Schadens­regulierung<br className="hidden sm:block" />{' '}
            <span className="text-claimondo-light-blue">auf Augenhöhe.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70 leading-relaxed">
            Claimondo wurde 2025 in Köln gegründet. Wir sind ein zweiköpfiges Founder-Team
            mit einem klaren Auftrag: Verkehrsunfall-Geschädigte in Deutschland sollen den
            vollen Schadensersatz bekommen, der ihnen nach §249 BGB zusteht — nicht das,
            was die Versicherung gerade noch durchwinkt.
          </p>
        </div>
      </section>

      {/* Team-Foto */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl shadow-2xl ring-1 ring-claimondo-border">
            <Image
              src="/brand/team-founders.png"
              alt="Aaron Sprafke (COO, links) und Nicolas Kitta (CEO, rechts) — die Gründer von Claimondo im Kölner Office"
              width={1600}
              height={800}
              className="h-auto w-full"
              priority
            />
          </div>
          <p className="mt-3 text-center text-xs text-claimondo-ondo">
            Aaron Sprafke (COO, links) · Nicolas Kitta (CEO, rechts) · Kölner Office, 2026
          </p>
        </div>
      </section>

      {/* Bios */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 grid gap-8 md:grid-cols-2">
          {FOUNDERS.map((f) => (
            <article
              key={f.name}
              className="rounded-3xl border border-claimondo-border bg-white p-8 shadow-sm"
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-claimondo-navy">{f.name}</h2>
                  <p className="text-sm font-semibold text-claimondo-ondo">
                    {f.rolle} · {f.fotoLabel}
                  </p>
                </div>
                <a
                  href={f.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full p-2 text-claimondo-ondo transition-colors hover:bg-claimondo-bg hover:text-[#0A66C2]"
                  aria-label={`${f.name} auf LinkedIn`}
                >
                  <LinkIcon className="h-5 w-5" />
                </a>
              </header>

              <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">
                <strong className="text-claimondo-navy">{f.bioKurz}</strong>{' '}{f.bioLang}
              </p>

              <blockquote className="mt-6 flex gap-3 rounded-xl border-l-4 border-claimondo-ondo bg-claimondo-bg p-4">
                <Quote className="h-4 w-4 flex-shrink-0 text-claimondo-light-blue" />
                <div>
                  <p className="text-sm italic text-claimondo-shield">{f.quote}</p>
                  <p className="mt-1 text-xs font-semibold text-claimondo-ondo">— {f.quoteAutor}</p>
                </div>
              </blockquote>
            </article>
          ))}
        </div>
      </section>

      {/* Zahlen / Trust */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <h2 className="text-center text-3xl font-extrabold text-claimondo-navy">
            Was wir versprechen
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
            {ZAHLEN.map((z) => (
              <div
                key={z.label}
                className="rounded-2xl border border-claimondo-border bg-claimondo-bg p-5 text-center"
              >
                <div className="text-2xl font-extrabold text-claimondo-navy sm:text-3xl">
                  {z.kpi}
                </div>
                <div className="mt-1 text-xs text-claimondo-ondo leading-tight">
                  {z.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kontakt-CTA */}
      <section className="bg-claimondo-navy py-20 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Direkt reden — schneller als jede Versicherung</h2>
          <p className="mt-4 text-white/70">
            Kein Callcenter, keine Bandansage. Wir sind ein Team in Köln und nehmen ab.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={`tel:+4922125906530`}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy shadow-xl hover:bg-claimondo-light-blue/90"
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" />
              {PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white"
            >
              <Mail className="h-5 w-5" />
              {CONTACT_EMAIL}
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-claimondo-ondo px-8 py-4 text-base font-bold text-white hover:bg-claimondo-light-blue"
            >
              Schaden melden
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Über uns" />
    </div>
  )
}
