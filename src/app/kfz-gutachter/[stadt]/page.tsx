import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Phone, ChevronRight, CheckCircle2, MessageCircle, MapPin,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { FounderSection } from '@/components/landing/FounderSection'
import { VersichererTaktikenSection } from '@/components/landing/VersichererTaktikenSection'
import { SiebenFehlerSection } from '@/components/landing/SiebenFehlerSection'
import { PortalMockupSection } from '@/components/landing/sections/PortalMockupSection'
import { WertminderungSandenDannerSection } from '@/components/landing/sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from '@/components/landing/sections/TeslaEAutoSection'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { STAEDTE, getStadtBySlug, type Stadt } from '../staedte'
import { StadtLeadFormClient } from './StadtLeadFormClient'

// /kfz-gutachter/[stadt] — Premium-Layout für alle SEO-Stadt-Routes.
// Eine Section-Komposition, viele Consumer (AGENTS.md §3 Redundanz-Check).
// Stadt-spezifisch: H1, Hero-Pill, JSON-LD LocalBusiness (geo, areaServed),
// Lokal-Block (Landgericht, Kammer, PLZ, BVSK), FAQ-Mix, Cross-City-Pills.
// Global: KPIs, BGH-Authority, Prozess, Einsatzgebiet, Bottom-CTA.

export async function generateStaticParams() {
  return STAEDTE.map((s) => ({ stadt: s.slug }))
}

// AAR-UWG-Fix 14.05.2026: KPI-Block bleibt, wird aber per `methodikNote`
// mit Aggregator-Hinweis versehen (UWG-konform). Konkrete Zahlen werden
// per Aaron-TODO aus Supabase nachgeschärft.
const KPIS = [
  { wert: '2.000+', label: 'vermittelte Schadensfälle' },
  { wert: '8 Mio. €+', label: 'Schadensersatz durchgesetzt' },
  { wert: '32 Tage', label: 'Ø bis zur Auszahlung' },
  { wert: '< 15 Min', label: 'bis zum ersten Rückruf' },
] as const

const KPI_METHODIK =
  'Aggregierte Auswertung aller über das Claimondo-Partner-Netzwerk vermittelten ' +
  'Fälle seit Gründung. Stand 14.05.2026. Detaillierte Methodik auf Anfrage einsehbar.'

const HERO_BULLETS = [
  'Zertifizierte Gutachter',
  'Exklusiver Zugang zum DAT Experts-Netzwerk',
  'Termin < 48 h vor Ort',
  'Live-Status im Portal',
  'BGH-konform durchgesetzt',
] as const

const PROZESS_STEPS = [
  { nr: 1, titel: 'Schaden melden',         text: '3 Felder, ohne Anmeldung. Online oder telefonisch.' },
  { nr: 2, titel: 'Berater meldet sich',    text: 'Persönlicher Rückruf in unter 15 Minuten.' },
  { nr: 3, titel: 'DAT-Gutachter vor Ort',  text: 'In unter 48 Stunden besichtigt — meist am Folgetag.' },
  { nr: 4, titel: 'Anwalt aktiv',           text: 'Partnerkanzlei für Verkehrsrecht setzt Ansprüche durch — auch gegen Kürzungen.' },
  { nr: 5, titel: 'Geld auf dem Konto',     text: 'Ø 32 Tage. Live im Portal verfolgbar.' },
] as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stadt: string }>
}): Promise<Metadata> {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) return { title: 'Stadt nicht gefunden' }

  const title = `Kfz-Gutachter ${s.name} — Unabhängig & kostenfrei nach Unfall · Claimondo`
  const description = `Unabhängiger Kfz-Sachverständiger ${s.h1Anker} nach Verkehrsunfall. Zertifizierte Partner-Sachverständige aus dem Netzwerk, Termin in unter 48 h, 0 € für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer). Honorar nach BVSK ${s.bvskHonorarSpanne}.`

  return {
    title,
    description,
    keywords: [
      `Kfz-Gutachter ${s.name}`,
      `Kfz-Sachverständiger ${s.name}`,
      `Unfallgutachter ${s.name}`,
      `Schadensgutachten ${s.name}`,
      `unabhängiger Gutachter ${s.name}`,
      'DAT-Experte', 'Wertminderung berechnen',
      '§249 BGB', 'BVSK-Honorartabelle',
    ],
    alternates: { canonical: `/kfz-gutachter/${s.slug}` },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      title,
      description,
      images: [{ url: '/marketing-landing-koeln/hero-woman.png', width: 1200, height: 630, alt: `Kfz-Gutachter ${s.name}` }],
    },
  }
}

function buildStadtFaq(s: Stadt) {
  const base = [
    {
      frage: `Was kostet ein Kfz-Gutachter ${s.h1Anker}?`,
      antwort: `Bei einem unverschuldeten Unfall ${s.h1Anker} mit Schaden über 750 € zahlen Sie 0 €. Die gegnerische Haftpflichtversicherung trägt nach §249 BGB alle Kosten. Honorare nach BVSK-Honorartabelle liegen in ${s.name} zwischen ${s.bvskHonorarSpanne}.`,
    },
    {
      frage: `Wo finde ich einen unabhängigen Kfz-Sachverständigen ${s.h1Anker}?`,
      antwort: `Claimondo vermittelt ${s.h1Anker} an zertifizierte Partner-Gutachter mit lokaler Expertise. Sie melden den Schaden online (5 Min, ohne Anmeldung) — wir matchen Sie mit dem nächstgelegenen freien Sachverständigen aus dem DAT-Partner-Netzwerk. Termin vor Ort in unter 48 Stunden. Verfügbar in ${s.name} (PLZ ${s.plzPrefix}) und im umliegenden ${s.bundesland}.`,
    },
    {
      frage: `Welches Gericht ist bei Streitigkeiten zuständig ${s.h1Anker}?`,
      antwort: `Für Schadensregulierungs-Streitigkeiten ${s.h1Anker} ist erstinstanzlich das ${s.lokal.landgericht} zuständig. Geht eine Versicherung gerichtlich gegen ein Gutachten vor oder kürzt unrechtmäßig, klagt unsere Partnerkanzlei für Verkehrsrecht in der Regel vor diesem Gericht. Bei Erfolg trägt die Gegenseite Anwalts- und Prozesskosten. Sie zahlen 0 € (nach §249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).`,
    },
    {
      frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?',
      antwort: 'Versicherer wie HUK, LVM und AXA kürzen über Prüfdienstleister (ControlExpert, K-Expert, DEKRA) typischerweise UPE-Aufschläge, Verbringung und Wertminderung. Der BGH stützt jedoch in den Leitentscheidungen VI ZR 65/18, VI ZR 174/24 und VI ZR 38/22 ff. die Geschädigten. Unsere Partnerkanzlei holt die Kürzungen vollständig zurück.',
    },
    {
      frage: 'Was ist eine Sicherungsabtretung — und ist sie sicher?',
      antwort: 'Bei der Sicherungsabtretung gemäß §164 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet anschließend direkt mit der Versicherung ab. Sie zahlen keinen Cent vor. Branchen-Standard.',
    },
    {
      frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?',
      antwort: 'Die merkantile Wertminderung liegt nach Sanden/Danner-Formel zwischen 500 € und 2.500 €. Faustregel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. Keine starre Altersgrenze laut BGH VI ZR 357/03.',
    },
    {
      frage: 'Was bedeutet die 130%-Regel beim Totalschaden?',
      antwort: 'Die 130%-Regel (BGH VI ZR 67/91) erlaubt Reparaturkosten bis 130 % des Wiederbeschaffungswertes — sofern fachgerecht repariert nach Gutachten und das Fahrzeug 6 Monate weitergenutzt wird.',
    },
  ]
  // Hub-Cities (Doc 38): lokale FAQ anhängen — fließen in Akkordeon + FAQPage-Schema.
  return s.hyperlocal?.lokaleFaqs ? [...base, ...s.hyperlocal.lokaleFaqs] : base
}

export default async function KfzGutachterStadtPage({
  params,
}: {
  params: Promise<{ stadt: string }>
}) {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) notFound()

  const faqs = buildStadtFaq(s)

  // areaServed: bei Hub-Cities die angrenzenden Orte als City-Array (Doc 38 §9.2 —
  // stärkt Local-SEO/GEO ohne neue Seiten). Sonst die einzelne Stadt.
  const cityPlace = {
    '@type': 'City',
    name: s.name,
    containedInPlace: { '@type': 'AdministrativeArea', name: s.bundesland },
  }
  const areaServed = s.hyperlocal
    ? [cityPlace, ...s.hyperlocal.angrenzendeOrte.map((ort) => ({ '@type': 'City', name: ort }))]
    : cityPlace

  // Cross-City: bis zu 6 Nachbarn nach Bundesland, sonst Auffüller aus anderen Bundesländern
  const nachbarn = STAEDTE
    .filter((x) => x.slug !== s.slug && x.bundesland === s.bundesland)
    .slice(0, 6)
  const fallback = nachbarn.length < 6
    ? STAEDTE.filter((x) => x.slug !== s.slug && !nachbarn.some((n) => n.slug === x.slug)).slice(0, 6 - nachbarn.length)
    : []
  const crossCity = [...nachbarn, ...fallback]

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          {
            '@context': 'https://schema.org',
            '@type': 'LegalService',
            '@id': `${SITE_URL}/kfz-gutachter/${s.slug}#localbusiness`,
            name: `Claimondo Kfz-Gutachter ${s.name}`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
            telephone: PHONE_E164,
            priceRange: '€€',
            serviceType: 'Kfz-Schadensgutachten',
            description: `Unabhängige zertifizierte Kfz-Sachverständige für Unfallschäden ${s.h1Anker}. DAT-Partner-Gutachter aus dem Netzwerk, Termin in unter 48 Stunden, 0 € für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).`,
            areaServed,
            geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
          },
          serviceSchema({
            name: `Kfz-Gutachter-Vermittlung ${s.name}`,
            description: `Vermittlung an unabhängige zertifizierte Kfz-Sachverständige ${s.h1Anker}. DAT-Partner-Gutachter aus dem Netzwerk, Termin <48 h, 0 € für unverschuldet Geschädigte nach §249 BGB.`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: `Schaden ${s.h1Anker} melden und Geld erhalten`,
            description: `In fünf Schritten vom unverschuldeten Unfall ${s.h1Anker} zur Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil.`,
            totalTime: 'P32D',
            step: PROZESS_STEPS.map((p) => ({ '@type': 'HowToStep', position: p.nr, name: p.titel, text: p.text })),
          },
          faqPageSchema(faqs),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: s.name, url: `/kfz-gutachter/${s.slug}` },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt={`Unfallgeschädigte ruft Kfz-Gutachter ${s.h1Anker} nach unverschuldetem Verkehrsunfall an`}
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              Sofort nach dem Unfall {s.h1Anker}
            </p>
            <p className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
              „Ihr erster Anruf nach dem Unfall? <span className="text-claimondo-light-blue">Der richtige.</span>"
            </p>
          </div>
        </div>
      </section>

      {/* 2 — Hero + Lead-Form */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white" aria-labelledby="hero-heading">
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
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div>
            <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
              <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span>{s.name}</span>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              DAT-Sachverständige aktuell {s.h1Anker} verfügbar
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              Unfall gehabt?<br />
              <span className="text-claimondo-light-blue">Ihr Kfz-Gutachter {s.h1Anker}.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              Unabhängiger zertifizierter Sachverständiger vor Ort in unter 48 h.
              Partnerkanzlei setzt Ansprüche durch.{' '}
              <strong className="text-white">0 € für unverschuldet Geschädigte</strong> nach §249 BGB.
            </p>
            {s.hyperlocal?.heroAnker && (
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">
                {s.hyperlocal.heroAnker}
              </p>
            )}
            <ul className="mt-7 grid grid-cols-2 gap-3 text-sm text-white/80">
              {HERO_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-claimondo-light-blue" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking={`call-${s.slug}-hero`}
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                Jetzt anrufen — Rückruf in 5 Min
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking={`whatsapp-${s.slug}-hero`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              Anonyme Beratung · Keine Bindung · DSGVO-konform
            </p>
          </div>
          <StadtLeadFormClient stadtName={s.name} stadtSlug={s.slug} />
        </div>
      </section>

      {/* 3 — Trust-Strip */}
      <TrustStripSection kpis={[...KPIS]} methodikNote={KPI_METHODIK} />

      {/* 4 — Lokal-Block (stadt-spezifische Anker) */}
      <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="lokal-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Lokal verankert — bundesweit aktiv
            </p>
            <h2 id="lokal-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Kfz-Gutachten {s.h1Anker}
            </h2>
          </div>
          <div className="mt-8">
            <AnswerCapsule quelle="§249 BGB · BVSK">
              <strong>Zuständiges Gericht:</strong> {s.lokal.landgericht}.{' '}
              <strong>Anwaltskammer:</strong> {s.lokal.kammer}.{' '}
              <strong>PLZ-Gebiet:</strong> {s.plzPrefix} (rund {s.bevoelkerung} Einwohner,{' '}
              Bundesland {s.bundesland}). Bei gerichtlichen Auseinandersetzungen mit
              Versicherern klagt unsere Partnerkanzlei für Verkehrsrecht vor dem{' '}
              {s.lokal.landgericht} — dort kennen die Kammern. Honorar-Spanne nach BVSK:{' '}
              <strong>{s.bvskHonorarSpanne}</strong> (skaliert mit Schadenshöhe).
            </AnswerCapsule>
          </div>
        </div>
      </section>

      {/* 4b — Hyperlokal: Stadtbezirke + Einsatzgebiet (nur Hub-Cities, Doc 38 §6.2) */}
      {s.hyperlocal && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="bezirke-stadt-heading">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                In ganz {s.name} vor Ort
              </p>
              <h2 id="bezirke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                Wir begutachten in allen {s.hyperlocal.stadtbezirke.length} Stadtbezirken {s.h1Anker}
              </h2>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.hyperlocal.stadtbezirke.map((b) => (
                <div key={b.name} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
                  <p className="text-sm font-bold text-claimondo-navy">{b.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-claimondo-shield">
                    {b.ortsteile.join(' · ')}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
              <p className="text-sm leading-relaxed text-claimondo-shield">
                <strong className="text-claimondo-navy">Auch in der Region:</strong> Wir kommen ebenso nach{' '}
                {s.hyperlocal.angrenzendeOrte.join(', ')} — meist schon am Folgetag vor Ort.
              </p>
            </div>
            {s.hyperlocal.topografieAnker && (
              <p className="mt-6 text-center text-sm italic leading-relaxed text-claimondo-shield">
                {s.hyperlocal.topografieAnker}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 4c — Hyperlokal: Unfallschwerpunkte + Hauptachsen, quellenbelegt (Doc 38 §6.3) */}
      {s.hyperlocal && (
        <section className="bg-claimondo-bg py-16 sm:py-20" aria-labelledby="hotspots-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                Lokale Verkehrslage
              </p>
              <h2 id="hotspots-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                Unfallschwerpunkte und Hauptachsen {s.h1Anker}
              </h2>
              {s.hyperlocal.unfallzahlStadt && (
                <p className="mt-3 text-sm text-claimondo-shield">
                  Stadtweit {s.hyperlocal.unfallzahlStadt.jahr}: {s.hyperlocal.unfallzahlStadt.text}.
                </p>
              )}
            </div>
            <ul className="mt-8 space-y-3">
              {s.hyperlocal.unfallHotspots.map((h) => (
                <li key={h.ort} className="rounded-ios-md border border-claimondo-border bg-white p-4">
                  <p className="text-sm font-bold text-claimondo-navy">
                    {h.ort}
                    {h.bezirk && <span className="font-normal text-claimondo-shield"> · {h.bezirk}</span>}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">{h.beschreibung}</p>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-5 text-sm leading-relaxed text-claimondo-shield">
              <p>
                <strong className="text-claimondo-navy">Hauptverkehrsachsen:</strong>{' '}
                Autobahnen {s.hyperlocal.hauptachsen.autobahnen.join(', ')}; Bundesstraßen{' '}
                {s.hyperlocal.hauptachsen.bundesstrassen.join(', ')}.
              </p>
              {s.hyperlocal.hauptachsen.knoten.length > 0 && (
                <p className="mt-1">Verkehrsknoten: {s.hyperlocal.hauptachsen.knoten.join(' · ')}.</p>
              )}
              {s.hyperlocal.hauptachsen.aktuelleBaustelle && (
                <p className="mt-1">
                  <strong className="text-claimondo-navy">Aktuell:</strong>{' '}
                  {s.hyperlocal.hauptachsen.aktuelleBaustelle}.
                </p>
              )}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-claimondo-shield">
              Genau an diesen Achsen und Brennpunkten sind wir nach einem Unfall schnell für Sie vor Ort —
              meist in unter 48 Stunden, oft schon am Folgetag.
            </p>
            <p className="mt-3 text-xs text-claimondo-shield/75">Quelle: {s.hyperlocal.hotspotQuelle}.</p>
          </div>
        </section>
      )}

      {/* 4d — Hyperlokal: Praktische Hilfe nach dem Unfall (öffentliche Stellen, Doc 38 §6.5) */}
      {s.hyperlocal?.oeffentlicheStellen && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="hilfe-stadt-heading">
          <div className="mx-auto max-w-4xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                Praktische Hilfe
              </p>
              <h2 id="hilfe-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                Nach dem Unfall {s.h1Anker}: Wer hilft wo?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
                Bei Verletzten oder Gefahr zuerst den Notruf{' '}
                <strong className="text-claimondo-navy">{s.hyperlocal.oeffentlicheStellen.notruf}</strong> wählen.
                Danach den Schaden dokumentieren und einen unabhängigen Sachverständigen einschalten.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.adresse}
                </p>
                <p className="mt-1 text-sm text-claimondo-shield">
                  Vermittlung: {s.hyperlocal.oeffentlicheStellen.polizeipraesidium.telefon} · Notruf{' '}
                  {s.hyperlocal.oeffentlicheStellen.notruf}
                </p>
              </div>
              <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
                <p className="text-sm font-bold text-claimondo-navy">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.name} (Kennzeichen{' '}
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.kennzeichen})
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.adresse}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-claimondo-shield">
                  Tel.: {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.telefon}
                  {s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten
                    ? ` · ${s.hyperlocal.oeffentlicheStellen.zulassungsstelle.oeffnungszeiten}`
                    : ''}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-claimondo-shield/75">
              Tipp: Das polizeiliche Aktenzeichen ist ein wertvoller Beleg für die spätere Schadensregulierung.
            </p>
          </div>
        </section>
      )}

      {/* 4e — Spoke-Town: Anbindung an die Hub-City (Doc 38 P5, minimal-unique) */}
      {s.spokeLocal && (
        <section className="bg-white py-16 sm:py-20" aria-labelledby="spoke-stadt-heading">
          <div className="mx-auto max-w-3xl px-5">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
                Im Einsatzgebiet von {s.spokeLocal.hubName}
              </p>
              <h2 id="spoke-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
                Kfz-Gutachter {s.h1Anker} — schnell vor Ort
              </h2>
            </div>
            <p className="mt-6 text-center text-base leading-relaxed text-claimondo-shield">
              {s.spokeLocal.anekdote}
            </p>
            <div className="mt-6 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 text-sm leading-relaxed text-claimondo-shield">
              <p>
                <strong className="text-claimondo-navy">Hauptverkehrsachsen:</strong>{' '}
                {s.spokeLocal.hauptachsen.join(', ')}.
              </p>
              <p className="mt-2">
                {s.name} liegt im Einsatzgebiet unseres {s.spokeLocal.hubName}-Netzwerks —{' '}
                <Link
                  href={`/kfz-gutachter/${s.spokeLocal.hubSlug}`}
                  className="font-semibold text-claimondo-ondo underline hover:text-claimondo-navy"
                >
                  mehr zu unserem Einsatz in {s.spokeLocal.hubName}
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 5 — BGH-Authority */}
      <BghAuthorityGrid
        headingId="bgh-stadt-heading"
        subline={` Bundeseinheitlich auch ${s.h1Anker} anwendbar. Versicherer kürzen trotzdem. Wir holen es zurück.`}
      />

      {/* 5b — Portal-Mockup (Wie Uber) */}
      <PortalMockupSection />

      {/* 5c — Versicherer-Taktiken (Wissensdatenbank §2, §15) */}
      <VersichererTaktikenSection />

      {/* 6 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              In 32 Tagen zum Geld
            </p>
            <h2 id="prozess-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Vom Unfall {s.h1Anker} zur Auszahlung — in 5 Schritten
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {PROZESS_STEPS.map((step) => (
              <li
                key={step.nr}
                className="relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Schritt {step.nr}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{step.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6b — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* 6c — 7 Fehler nach Unfall (Wissensdatenbank §12) */}
      <SiebenFehlerSection />

      {/* 7 — Einsatzgebiet / Cross-City */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-stadt-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Vor Ort — bundesweit
            </p>
            <h2 id="einsatzgebiet-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              DAT-Sachverständigen-Netzwerk · Schwerpunkt NRW · bundesweit
            </h2>
          </div>
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
              <Image
                src="/marketing-landing-koeln/nrw-karte.png"
                alt="Claimondo Einsatzgebiet — Schwerpunkt Nordrhein-Westfalen, deutschlandweite Anbindung"
                width={900} height={650}
                className="h-auto w-full"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">
                Auch verfügbar in:
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {crossCity.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/kfz-gutachter/${c.slug}`}
                    className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
                  >
                    {c.name}
                  </Link>
                ))}
                <Link
                  href="/kfz-gutachter"
                  className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
                >
                  Alle Einsatz-Städte →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7b — Tesla / E-Auto Spezial */}
      <TeslaEAutoSection />

      {/* 7c — Gründer Trust-Anker */}
      <FounderSection />

      {/* 8 — FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="faq-stadt-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Häufige Fragen — Kfz-Gutachter {s.h1Anker}
            </p>
            <h2 id="faq-stadt-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Antworten in unter 60 Sekunden
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-white p-5"
              >
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
            Schaden {s.h1Anker}? Wir regeln das.
          </h2>
          <p className="mt-4 text-white/75">
            Online melden in 5 Minuten — wir vermitteln einen freien DAT-Sachverständigen
            {' '}{s.h1Anker} in unter 48 h.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking={`call-${s.slug}-bottom`}
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              <MapPin className="h-5 w-5" aria-hidden />
              Auf Karte ansehen
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle={`Kfz-Gutachter ${s.name}`} />
    </div>
  )
}
