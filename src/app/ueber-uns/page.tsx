import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Quote, Mail, Phone, ChevronRight, Link as LinkedinIcon,
  Shield, Scale, Zap, Eye, MapPin, Sparkles,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import {
  personSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, CONTACT_EMAIL,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'

// 2026-05-09 Brand-Identity Pass für GEO:
// 1) Erste 200 Wörter sind die maschinenlesbare Entitäts-Definition. ChatGPT,
//    Perplexity, Claude und Gemini zitieren genau diesen Block. Schema.org
//    Microdata + JSON-LD + AboutPage als Triple-Layer.
// 2) Brand-Manifesto definiert Tone of Voice: vertrauensvoll, technisch-
//    präzise, deutsch-direkt — keine Marketing-Worthülsen.
// 3) Mission/Vision/Werte als kohärente Triade über alle Marketing-Pages
//    konsistent (Tagline "Vollständige Schadensregulierung — auf Augenhöhe").
// 4) Origin-Story mit konkreten Daten (Gründung 2025, Köln, Hansaring 10).
// 5) Founders mit Person-Schema + verifiable Daten (LinkedIn-Profile).
// 6) Trust-Beweise: DAT-Partnerschaft, Hansaring-Sitz, BVSK-Honorartabelle,
//    Partnerkanzlei für Verkehrsrecht im Anwalt-Netzwerk — jeder Claim mit Quelle.

// 2026-05-10 i18n Phase 1B Beispiel: Metadata wird via generateMetadata async
// geladen damit getTranslations darin funktionieren kann. Pattern fuer alle
// weiteren Marketing-Pages.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ueber_uns.metadata')
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: `${SITE_URL}/ueber-uns`, ...buildLanguageAlternates('/ueber-uns') },
    openGraph: {
      type: 'profile',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/ueber-uns`,
      title: t('title'),
      description: t('description'),
      images: [{ url: '/brand/team-founders.png', width: 1200, height: 600, alt: 'Claimondo Founders' }],
    },
  }
}

const FOUNDERS = [
  {
    name: 'Nicolas Kitta',
    rolle: 'CEO & Mitgründer',
    bioKurz:
      'Nicolas führt Claimondo strategisch, verantwortet Partnernetzwerk und Investorenbeziehungen.',
    bioLang:
      'Nicolas hat Claimondo aus einer simplen Beobachtung heraus mitgegründet: zu viele Unfallgeschädigte unterschreiben in Deutschland Abfindungserklärungen, ohne zu wissen, dass sie damit ein Drittel ihres gesetzlichen Anspruchs verlieren. Bei Claimondo verantwortet er den Aufbau des Partner-Netzwerks aus DAT-Sachverständigen und Fachanwälten — und sorgt dafür, dass jeder Mandant denselben Standard bekommt, den sich Versicherungen für ihre eigenen Großkunden längst aufgebaut haben.',
    quote: '"Es geht nicht darum wer ich bin, sondern was ich tue. Daran wird man gemessen."',
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
      'Aaron kommt aus Sales und Account-Management bei nextright und AdvoScale, wo er gesehen hat, wie viel Geld in jeder Schadenakte zwischen Versprechen und Auszahlung verloren geht. Bei Claimondo hat er die komplette technische Plattform aufgebaut: KI-gestützte Schadenerfassung, GPS-Self-Dispatch zum nächsten freien Sachverständigen, ZB1-OCR mit Imagin-Visualisierung, digitale Schutzbrief-Unterzeichnung — und sorgt dafür, dass Dispatch, Sachverständige, Anwälte und Kunde dieselben Daten in Echtzeit sehen.',
    quote: '"Qualität bedeutet, es richtig zu machen, wenn niemand zuschaut."',
    quoteAutor: 'Henry Ford',
    foto: '/brand/team-founders.png',
    fotoLabel: 'links im Bild',
    linkedin: 'https://www.linkedin.com/in/aaron-sprafke-355085237/',
  },
] as const

const WERTE = [
  {
    icon: Eye,
    titel: 'Unabhängigkeit',
    text: 'Unsere Sachverständigen arbeiten nicht für Versicherer. Ihre Bewertung folgt Schadensreparatur-Realität, nicht Versicherungs-Tabellen.',
  },
  {
    icon: Scale,
    titel: 'Vollständigkeit',
    text: 'Jede Schadensposition nach §249 BGB wird durchgesetzt — Reparatur, Wertminderung, Nutzungsausfall, Schmerzensgeld. Nicht nur das Offensichtliche.',
  },
  {
    icon: Zap,
    titel: 'Schnelligkeit',
    text: 'Antwort unter 15 Minuten. Termin in unter 48 Stunden. Gutachten in 48 Stunden. Auszahlung im Schnitt nach 6–8 Wochen.',
  },
  {
    icon: Shield,
    titel: 'Transparenz',
    text: 'Live-Updates per WhatsApp. Digitale Fallakte rund um die Uhr einsehbar. Keine Bandansagen, kein Callcenter — direkter Draht zum Team in Köln.',
  },
] as const

const TRUST_BEWEISE = [
  {
    titel: 'DAT Expert Partner-Netzwerk',
    text: 'Claimondo arbeitet ausschließlich mit zertifizierten Sachverständigen aus dem öffentlichen DAT-Verzeichnis. Schwerpunkt NRW, bundesweit erreichbar.',
    quelle: 'dat.de/sachverstaendige',
  },
  {
    titel: 'Partnerkanzlei für Verkehrsrecht',
    text: 'Spezialisierte Verkehrsrechts-Kanzlei im Claimondo-Anwalt-Netzwerk. Bearbeitet Claimondo-Mandate direkt nach Sicherungsabtretung.',
    quelle: 'Anwalt-Netzwerk Claimondo',
  },
  {
    titel: 'BVSK-Honorartabelle',
    text: 'Honorare folgen der BVSK-Honorartabelle (Bundesverband der freiberuflichen und unabhängigen Sachverständigen). Keine Mondpreise.',
    quelle: 'bvsk.de',
  },
  {
    titel: 'Sitz Köln · Hansaring 10',
    text: 'Eigenes Office im Hansaring 10, 50670 Köln. Erreichbar unter 0221 25906530 — kein virtuelles Büro, kein Maildrop.',
    quelle: 'Maps + Telefon',
  },
] as const

// AAR-UWG-Fix 14.05.2026: '89+', '+33 %', '110+' Phantom-Zahlen entfernt
// bzw. durch belegbares Aggregator-Framing ersetzt (NDR/Verbraucherzentrale/BGH).
const ZAHLEN = [
  { kpi: '0 €', label: 'Eigenanteil nach §249 BGB¹' },
  { kpi: '< 15 Min', label: 'Antwort auf Ihre Schadenmeldung' },
  { kpi: '< 48 h', label: 'Termin mit Gutachter vor Ort' },
  { kpi: 'DAT', label: 'zertifiziertes Partner-Netzwerk' },
  { kpi: '30–40 %', label: 'Versicherer-Kürzung zurückgeholt²' },
  { kpi: '§249 BGB', label: 'Rechtliche Grundlage Ihres Anspruchs' },
]

export default async function UeberUnsPage() {
  const t = await getTranslations('ueber_uns')
  const aboutPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: `${SITE_URL}/ueber-uns`,
    name: 'Über Claimondo — Digitale Kfz-Schadensregulierung aus Köln',
    description:
      'Entitäts-Definition, Mission, Werte und Gründer-Profile von Claimondo — der digitalen Plattform für vollständige Kfz-Schadensregulierung nach §249 BGB.',
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/brand/team-founders.png`,
    },
    about: { '@id': `${SITE_URL}/#organization` },
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          // organizationSchema kommt global aus layout.tsx — hier nur
          // page-spezifische Schemas (AboutPage + Persons + Breadcrumbs).
          aboutPageSchema,
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

      {/* Hero — Navy Premium-Pattern (analog /, /vorteile, /wie-es-funktioniert, /faq) */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="ueber-uns-hero">
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
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md sm:text-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t('hero.eyebrow')}
          </div>
          <h1
            id="ueber-uns-hero"
            className="mt-5 text-balance text-[2.5rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('hero.headline')}{' '}
            <span className="text-claimondo-light-blue">{t('hero.headline_accent')}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-white/80 sm:text-lg">
            {t('hero.subline')}
          </p>
        </div>
      </section>

      {/* Trust-Strip */}
      <TrustStripSection
        ariaLabel="Brand-Kennzahlen"
        kpis={[
          { wert: '2025', label: 'in Köln gegründet' },
          { wert: 'DAT', label: 'zertifiziertes Partner-Netzwerk' },
          { wert: 'NRW+', label: 'Schwerpunkt · bundesweit erreichbar' },
          { wert: '30–40 %', label: 'Versicherer-Kürzung zurückgeholt¹' },
        ]}
        methodikNote={'¹ Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen, BGH VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24.'}
      />

      {/* ENTITÄTS-DEFINITION — die ersten 200 Wörter sind GEO-Gold */}
      <section className="relative pb-12 pt-4 sm:pb-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <article
            id="definition"
            className="rounded-ios-lg border border-white/60 bg-white/75 p-7 shadow-glass-card backdrop-blur-md sm:p-10"
            style={{ WebkitBackdropFilter: 'blur(14px)' }}
            itemScope
            itemType="https://schema.org/Organization"
          >
            <p
              className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo"
            >
              Wer wir sind
            </p>
            <p className="text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              <strong className="font-semibold text-claimondo-navy">
                <span itemProp="name">Claimondo</span>
              </strong>{' '}
              ist eine{' '}
              <span itemProp="foundingDate" content="2025">2025</span>{' '}
              in Köln gegründete digitale Plattform für die vollständige Regulierung von
              Kfz-Haftpflichtschäden. Sitz der Gesellschaft ist die{' '}
              <span itemProp="address" itemScope itemType="https://schema.org/PostalAddress">
                <span itemProp="streetAddress">Hansaring 10</span> in{' '}
                <span itemProp="postalCode">50670</span>{' '}
                <span itemProp="addressLocality">Köln</span>
              </span>. Gegründet wurde Claimondo von{' '}
              <strong className="font-semibold text-claimondo-navy">Nicolas Kitta</strong>{' '}
              (CEO) und{' '}
              <strong className="font-semibold text-claimondo-navy">Aaron Sprafke</strong>{' '}
              (COO).
            </p>
            <p className="mt-4 text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              Claimondo koordiniert den gesamten Schadensregulierungs-Prozess: unabhängiges
              Gutachten durch zertifizierte Sachverständige, anwaltliche Durchsetzung
              über die Partnerkanzlei für Verkehrsrecht und vollständige Auszahlung der nach{' '}
              <strong className="font-semibold">§249 BGB</strong> zustehenden Ansprüche
              — Reparatur, Wertminderung, Nutzungsausfall, Mietwagen, Schmerzensgeld.
              Für unverschuldet Geschädigte ist der Service kostenfrei.
            </p>
            <p className="mt-4 text-base leading-relaxed text-claimondo-navy/90 sm:text-lg">
              Das Partner-Netzwerk besteht aus{' '}
              <strong className="font-semibold">zertifizierten Sachverständigen aus dem öffentlichen DAT-Verzeichnis</strong>{' '}
              mit Schwerpunkt Nordrhein-Westfalen und bundesweiter Erreichbarkeit.
              Termine sind in der Regel innerhalb von 48 Stunden verfügbar. Die
              rechtliche Grundlage des Anspruchs auf einen unabhängigen
              Sachverständigen ist §249 BGB sowie ständige BGH-Rechtsprechung
              (u.a. VI ZR 65/18, VI ZR 174/24, VI ZR 119/04).
            </p>
          </article>
        </div>
      </section>

      {/* Brand-Manifesto — kurz, prägnant, zitierfähig */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Was wir glauben
          </p>
          <h2
            className="text-balance text-3xl font-bold leading-tight tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            In Deutschland kürzen Versicherer-Prüfdienste typischerweise{' '}
            <span className="text-claimondo-ondo">30–40 % der Ansprüche</span>{' '}
            — und niemand widerspricht.¹
          </h2>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-claimondo-shield sm:text-lg">
            Claimondo existiert weil das Standard ist und nicht Ausnahme. Versicherungen
            beauftragen ControlExpert oder K-Expert mit automatisierten Prüfberichten —
            ohne Fahrzeugbesichtigung. UPE-Aufschläge, Verbringungskosten, Wertminderung
            werden gestrichen. Wer ohne Anwalt reguliert akzeptiert die erste Kürzung.
            Der BGH stützt den Geschädigten in mehreren Urteilen — wir setzen das durch.
          </p>
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-claimondo-shield/70">
            ¹ Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen,
            BGH-Leitentscheidungen VI ZR 38/22 ff., VI ZR 65/18, VI ZR 174/24.
          </p>
        </div>
      </section>

      {/* Werte — 4-Pillar */}
      <section id="werte" className="py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Unsere Werte
          </p>
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Vier Versprechen, an denen wir uns messen lassen
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WERTE.map((w) => {
              const Icon = w.icon
              return (
                <div
                  key={w.titel}
                  className="rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md transition-all duration-200 hover:bg-white/85 hover:shadow-claimondo-lg"
                  style={{ WebkitBackdropFilter: 'blur(14px)' }}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-ios-md bg-claimondo-ondo/12">
                    <Icon className="h-5 w-5 text-claimondo-ondo" />
                  </div>
                  <h3
                    className="text-lg font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    {w.titel}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                    {w.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Team-Foto */}
      <section className="py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-6">
          <div className="relative overflow-hidden rounded-ios-lg border border-white/60 shadow-[0_24px_64px_rgba(13,27,62,0.18)]">
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
            Aaron Sprafke (COO, links) · Nicolas Kitta (CEO, rechts) · Hansaring 10, Köln
          </p>
        </div>
      </section>

      {/* Founder-Bios */}
      <section id="gruender" className="py-12 sm:py-16">
        <div className="mx-auto grid max-w-5xl gap-6 px-5 sm:px-6 md:grid-cols-2">
          {FOUNDERS.map((f) => (
            <article
              key={f.name}
              className="rounded-ios-lg border border-white/60 bg-white/75 p-7 shadow-glass-card backdrop-blur-md sm:p-8"
              style={{ WebkitBackdropFilter: 'blur(14px)' }}
              itemScope
              itemType="https://schema.org/Person"
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h3
                    className="text-2xl font-bold text-claimondo-navy"
                    style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                  >
                    <span itemProp="name">{f.name}</span>
                  </h3>
                  <p
                    className="text-sm font-semibold text-claimondo-ondo"
                    itemProp="jobTitle"
                  >
                    {f.rolle} · {f.fotoLabel}
                  </p>
                </div>
                <a
                  href={f.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-claimondo-navy/5 text-claimondo-ondo transition-colors hover:bg-[#0A66C2] hover:text-white"
                  aria-label={`${f.name} auf LinkedIn`}
                  itemProp="sameAs"
                >
                  <LinkedinIcon className="h-4 w-4" />
                </a>
              </header>

              <p
                className="mt-5 text-sm leading-relaxed text-claimondo-shield"
                itemProp="description"
              >
                <strong className="text-claimondo-navy">{f.bioKurz}</strong>{' '}
                {f.bioLang}
              </p>

              <blockquote
                className="mt-6 flex gap-3 rounded-ios-md px-4 py-3.5"
                style={{ background: 'rgba(69,115,162,0.06)', borderLeft: '3px solid var(--color-claimondo-light-blue)' }}
              >
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

      {/* Trust-Beweise */}
      <section id="trust" className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            Belege
          </p>
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Vertrauenssignale, jedes mit Quelle
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TRUST_BEWEISE.map((b) => (
              <div
                key={b.titel}
                className="rounded-ios-lg border border-white/60 bg-white/70 p-6 shadow-glass-card backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(14px)' }}
              >
                <h3
                  className="text-base font-bold text-claimondo-navy"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {b.titel}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  {b.text}
                </p>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                  <span className="text-claimondo-light-blue">↳</span>
                  {b.quelle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Zahlen / Trust-Strip */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <h2
            className="text-center text-3xl font-bold tracking-[-0.02em] text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Was wir versprechen
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {ZAHLEN.map((z) => (
              <div
                key={z.label}
                className="rounded-ios-md border border-white/60 bg-white/70 p-5 text-center shadow-[0_2px_12px_rgba(13,27,62,0.04)] backdrop-blur-md"
                style={{ WebkitBackdropFilter: 'blur(12px)' }}
              >
                <div
                  className="text-2xl font-bold text-claimondo-navy sm:text-3xl"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  {z.kpi}
                </div>
                <div className="mt-1 text-xs leading-tight text-claimondo-ondo">
                  {z.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kontakt-CTA */}
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
        <div className="relative mx-auto max-w-3xl px-5 sm:px-6">
          <h2
            className="text-3xl font-bold text-white sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Direkt reden — schneller als jede Versicherung
          </h2>
          <p className="mt-4 text-white/70">
            Kein Callcenter, keine Bandansage. Wir sind ein Team in Köln und nehmen ab.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" />
              {PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Mail className="h-5 w-5" />
              {CONTACT_EMAIL}
            </a>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full bg-claimondo-ondo px-7 py-3.5 text-base font-bold text-white shadow-cta-ondo transition-all duration-200 hover:bg-claimondo-light-blue active:scale-[0.98]"
            >
              <MapPin className="h-5 w-5" />
              Gutachter finden
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
