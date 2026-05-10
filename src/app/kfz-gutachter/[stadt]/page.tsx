import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight, MapPin, Scale, Euro, Phone, ShieldCheck,
  CheckCircle2, ArrowRight, Building2,
} from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'
import { STAEDTE, getStadtBySlug } from '../staedte'

export async function generateStaticParams() {
  return STAEDTE.map((s) => ({ stadt: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stadt: string }>
}): Promise<Metadata> {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) return { title: 'Stadt nicht gefunden' }

  const title = `Kfz-Gutachter ${s.name} — Unabhängig & kostenfrei nach Unfall`
  const description = `Unabhängiger Kfz-Sachverständiger ${s.h1Anker} nach Verkehrsunfall. ${s.partnerSVs} DAT-Expert-Partner in der Region, Termin in unter 48 h, 0 € für unverschuldet Geschädigte (§249 BGB). Honorar nach BVSK ${s.bvskHonorarSpanne}.`

  return {
    title,
    description,
    keywords: [
      `Kfz-Gutachter ${s.name}`,
      `Kfz-Sachverständiger ${s.name}`,
      `Unfallgutachter ${s.name}`,
      `Schadensgutachten ${s.name}`,
      `unabhängiger Gutachter ${s.name}`,
      `DAT-Experte ${s.name}`,
      `Wertminderung ${s.name}`,
      'BVSK-Honorartabelle',
    ],
    alternates: { canonical: `/kfz-gutachter/${s.slug}` },
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      siteName: 'Claimondo',
      url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
      title,
      description,
      images: [{ url: '/og-default.png', width: 1200, height: 630, alt: `Kfz-Gutachter ${s.name}` }],
    },
  }
}

function buildStadtFaq(name: string, h1Anker: string, gericht: string) {
  return [
    {
      frage: `Was kostet ein Kfz-Gutachter ${h1Anker}?`,
      antwort: `Bei einem unverschuldeten Unfall ${h1Anker} mit Schaden über 750 € zahlen Sie nichts — die Kosten trägt vollständig die gegnerische Haftpflichtversicherung gemäß §249 BGB. Das Honorar richtet sich nach der BVSK-Honorartabelle und liegt typischerweise zwischen 600 € und 2.400 € je nach Schadenshöhe. Die Abrechnung läuft direkt zwischen Gutachter und gegnerischer Versicherung via Sicherungsabtretung.`,
    },
    {
      frage: `Wo finde ich einen unabhängigen Sachverständigen ${h1Anker}?`,
      antwort: `Claimondo vermittelt ${h1Anker} an DAT-zertifizierte Partner-Gutachter mit lokaler Expertise. Sie melden den Schaden online (5 Min, ohne Anmeldung) — wir matchen Sie automatisch mit dem nächstgelegenen freien Sachverständigen. Termin vor Ort in unter 48 Stunden. Über das Portal sehen Sie Standort, Verfügbarkeit und Spezialisierung jedes Gutachters.`,
    },
    {
      frage: `Welches Gericht ist bei Streitigkeiten zuständig ${h1Anker}?`,
      antwort: `Für Schadensregulierungs-Streitigkeiten ${h1Anker} ist erstinstanzlich das ${gericht} zuständig. Geht eine Versicherung gegen ein Gutachten gerichtlich vor oder kürzt unrechtmäßig, klagt unsere Partnerkanzlei in der Regel vor diesem Gericht. Bei Erfolg trägt die Gegenseite auch die Anwalts- und Prozesskosten. Sie zahlen 0 €.`,
    },
    {
      frage: `Was ist eine Sicherungsabtretung — und ist sie sicher?`,
      antwort: `Bei der Sicherungsabtretung gemäß §164 BGB überträgt der Geschädigte den Anspruch gegen die gegnerische Versicherung in Höhe des Gutachterhonorars an den Sachverständigen. Sie unterzeichnen einmal — der Gutachter rechnet anschließend direkt mit der Versicherung ab. Sie haben kein Insolvenzrisiko und zahlen keinen Cent vor. Standard in der gesamten Branche.`,
    },
    {
      frage: `Ich hatte einen Unfall ${h1Anker} — was sind die ersten Schritte?`,
      antwort: `1) Polizei rufen falls Personenschaden, Fahrerflucht oder unklare Schuldfrage. 2) Fotos machen — Schaden, Kennzeichen, Position, Umfeld. 3) Daten austauschen mit der Gegenseite. 4) Schaden bei Claimondo melden statt mit der gegnerischen Versicherung sprechen — sonst läuft die Schadensteuerung ihres Gutachters auf Sie zu, was im Schnitt 33 % weniger Schadensersatz bedeutet.`,
    },
  ]
}

export default async function KfzGutachterStadtPage({
  params,
}: {
  params: Promise<{ stadt: string }>
}) {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  if (!s) notFound()

  const faqs = buildStadtFaq(s.name, s.h1Anker, s.lokal.landgericht)

  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          // LocalBusiness scoped auf die Stadt — kritisch für Google Local + AI
          {
            '@context': 'https://schema.org',
            '@type': 'LegalService',
            '@id': `${SITE_URL}/kfz-gutachter/${s.slug}#localbusiness`,
            name: `Claimondo Kfz-Gutachter ${s.name}`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
            telephone: PHONE_E164,
            description: `Unabhängige Kfz-Sachverständige für Unfallschäden ${s.h1Anker}. ${s.partnerSVs} DAT-Expert-Partner in der Region.`,
            areaServed: {
              '@type': 'City',
              name: s.name,
              containedInPlace: { '@type': 'AdministrativeArea', name: s.bundesland },
            },
            geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
            priceRange: '€€',
            serviceType: 'Kfz-Schadensgutachten',
          },
          serviceSchema({
            name: `Kfz-Gutachter-Vermittlung ${s.name}`,
            description: `Vermittlung an unabhängige DAT-zertifizierte Kfz-Sachverständige ${s.h1Anker}. ${s.partnerSVs} Partner-Gutachter, Termin <48h, 0 € für unverschuldet Geschädigte.`,
            url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
          }),
          faqPageSchema(faqs),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: s.name, url: `/kfz-gutachter/${s.slug}` },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{s.name}</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Kfz-Unfallgutachter {s.h1Anker}
          </h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            Kostenlos bei unverschuldetem Unfall · {s.partnerSVs} Partner-Sachverständige · PLZ {s.plzPrefix}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90"
            >
              <ChevronRight className="h-4 w-4 text-claimondo-ondo" />
              Schaden in {s.name} melden
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/30 px-6 py-3.5 text-sm font-semibold text-white/90 hover:border-white/70"
            >
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Answer-Capsule Hero */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="§249 BGB · BVSK">
            Bei einem <strong>unverschuldeten Unfall in {s.name}</strong> mit Schaden über
            750 € haben Sie das Recht auf einen unabhängigen Kfz-Sachverständigen Ihrer
            Wahl — kostenfrei, weil die gegnerische Haftpflichtversicherung nach §249 BGB
            haftet. {s.partnerSVs} DAT-Expert-Partner stehen Ihnen ${s.h1Anker} zur Verfügung,
            Termin vor Ort in unter 48 Stunden. Honorar nach BVSK-Tabelle: {s.bvskHonorarSpanne}.
          </AnswerCapsule>
        </div>
      </section>

      {/* Was Sie bekommen */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Was Sie als Geschädigter bekommen
          </h2>
          <p className="mt-3 text-base text-claimondo-ondo">
            §249 BGB sichert Ihnen den vollen Schadensersatz — das umfasst weit mehr als nur die Reparaturkosten.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Euro, titel: 'Reparaturkosten', text: 'Vollständige Erstattung inkl. UPE-Aufschläge, Verbringungskosten, Beilackierung (BGH VI ZR 174/24).' },
              { icon: ShieldCheck, titel: 'Wertminderung', text: 'Merkantile Wertminderung nach Sanden/Danner — typisch 500 € bis 2.500 € je nach Fahrzeug.' },
              { icon: Building2, titel: 'Mietwagen / Nutzungsausfall', text: 'Mietwagen für die Reparaturzeit oder Nutzungsausfall-Entschädigung (~23 € bis 175 €/Tag).' },
              { icon: Scale, titel: 'Anwalt-Kosten', text: 'Vollständige Übernahme durch die Gegenseite — auch bei gerichtlicher Auseinandersetzung.' },
            ].map((b) => {
              const Icon = b.icon
              return (
                <div key={b.titel} className="rounded-2xl border border-claimondo-border bg-claimondo-bg p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-claimondo-ondo/10">
                      <Icon className="h-5 w-5 text-claimondo-ondo" />
                    </div>
                    <h3 className="text-base font-bold text-claimondo-navy">{b.titel}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{b.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Lokal-Block */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Lokal in {s.name}</h2>
          <AnswerCapsule>
            <strong>Zuständiges Gericht:</strong> {s.lokal.landgericht}.{' '}
            <strong>Anwaltskammer:</strong> {s.lokal.kammer}.{' '}
            <strong>PLZ-Gebiet:</strong> {s.plzPrefix} (rund {s.bevoelkerung} Einwohner).
            Bei gerichtlichen Auseinandersetzungen mit Versicherern klagen wir vor dem{' '}
            {s.lokal.landgericht} — dort kennen unsere Partneranwälte die zuständigen Kammern.
            Honorar-Spanne nach BVSK: {s.bvskHonorarSpanne} (skaliert mit Schadenshöhe).
          </AnswerCapsule>
        </div>
      </section>

      {/* FAQ stadt-spezifisch */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Häufige Fragen — Kfz-Gutachter {s.h1Anker}
          </h2>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.frage}
                className="group rounded-2xl border border-claimondo-border bg-claimondo-bg p-5"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between">
                    {f.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-City-Links */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">Auch verfügbar in</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {STAEDTE.filter((x) => x.slug !== s.slug).map((x) => (
              <Link
                key={x.slug}
                href={`/kfz-gutachter/${x.slug}`}
                className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo transition-colors hover:border-claimondo-ondo hover:text-claimondo-navy"
              >
                Kfz-Gutachter {x.name}
              </Link>
            ))}
            <Link
              href="/kfz-gutachter"
              className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
            >
              Alle Städte ansehen →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-claimondo-navy py-20 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">
            Schaden in {s.name}? Wir regeln das.
          </h2>
          <p className="mt-4 text-white/70">
            Online melden in 5 Minuten — wir vermitteln Ihnen einen freien DAT-Sachverständigen ${s.h1Anker} in unter 48 h.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90"
            >
              Schaden online melden
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/gutachter-finden"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white"
            >
              <MapPin className="h-5 w-5" />
              Auf Karte ansehen
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle={`Kfz-Gutachter ${s.name}`} />
    </div>
  )
}
