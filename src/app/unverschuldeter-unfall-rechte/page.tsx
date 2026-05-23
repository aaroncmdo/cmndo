import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'

// Stream B.2 (Doc 26) — Misstrauens-Page „Unverschuldeter Unfall: Ihre Rechte".
// Rechte-Pillar: Ueberblick aller Ansprueche nach § 249 ff. BGB, jeder Punkt
// verlinkt in den passenden Haftpflicht-Spoke. Konversions-Framing statt
// Wissens-Spoke. Quelle: Pillar-B-Spokes + Cornerstone /kfz-haftpflicht-schaden.
// Anker = cornerstone-Variante (Rechte-Pillar, kein „Brief bekommen"-Kontext).

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF

export const metadata: Metadata = {
  title: 'Unverschuldeter Unfall — Ihre Rechte & Ansprüche · Claimondo',
  description:
    'Nach unverschuldetem Unfall steht Ihnen die vollständige Wiederherstellung zu (§ 249 BGB): Gutachten, Reparatur oder Wiederbeschaffung, Wertminderung, Nutzungsausfall, Mietwagen, Anwalt und ggf. Schmerzensgeld. Alle Kosten trägt die gegnerische Haftpflicht — für Sie 0 €.',
  keywords: [
    'unverschuldeter unfall rechte', 'unverschuldeter unfall was steht mir zu', 'rechte nach unfall',
    'ansprüche unverschuldeter unfall', 'unverschuldeter unfall schadensersatz',
    'was zahlt die gegnerische versicherung', 'unverschuldeter unfall checkliste', '§ 249 BGB',
  ],
  alternates: { canonical: '/unverschuldeter-unfall-rechte' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/unverschuldeter-unfall-rechte`,
    title: 'Unverschuldeter Unfall — Ihre Rechte & Ansprüche',
    description:
      'Vollständige Wiederherstellung nach § 249 BGB: Gutachten, Reparatur, Wertminderung, Nutzungsausfall, Mietwagen, Anwalt, Schmerzensgeld — getragen von der gegnerischen Haftpflicht.',
  },
}

// Ihre Anspruechs-Positionen — jede verlinkt in den passenden Spoke (real, sonst
// 404 wegen dynamicParams=false). GEO: List + internes Linking + Answer-First.
const ANSPRUECHE: Array<{ titel: string; text: string; href: string }> = [
  {
    titel: 'Schadensgutachten',
    text: 'Unabhängiges Gutachten Ihrer freien Wahl — kostenlos für Sie.',
    href: '/kosten-kfz-gutachten',
  },
  {
    titel: 'Reparaturkosten',
    text: 'Reparatur in Ihrer Wunschwerkstatt, auch fiktiv abrechenbar.',
    href: '/haftpflicht/reparaturkosten',
  },
  {
    titel: 'Wertminderung',
    text: 'Merkantile Wertminderung als eigenständige Schadensposition.',
    href: '/haftpflicht/wertminderung',
  },
  {
    titel: 'Nutzungsausfall',
    text: 'Entschädigung pro Tag ohne Fahrzeug — auch ohne Mietwagen.',
    href: '/haftpflicht/nutzungsausfall',
  },
  {
    titel: 'Mietwagen',
    text: 'Ersatzfahrzeug für die Dauer der Reparatur oder Wiederbeschaffung.',
    href: '/haftpflicht/mietwagen',
  },
  {
    titel: 'Totalschaden',
    text: 'Bei wirtschaftlichem Totalschaden: Wiederbeschaffungswert abzüglich Restwert.',
    href: '/haftpflicht/wiederbeschaffungswert',
  },
  {
    titel: 'Anwaltskosten',
    text: 'Außergerichtliche Vertretung — von der Gegenseite getragen.',
    href: '/haftpflicht/anwaltskosten-erstattung',
  },
  {
    titel: 'Schmerzensgeld',
    text: 'Bei Personenschaden nach § 253 Abs. 2 BGB.',
    href: '/haftpflicht/schmerzensgeld-bgb253',
  },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Welche Ansprüche habe ich nach einem unverschuldeten Unfall?',
    antwort:
      'Sie haben Anspruch auf vollständige Wiederherstellung nach § 249 BGB: Reparatur oder Wiederbeschaffung, merkantile Wertminderung, Nutzungsausfall oder Mietwagen, ein unabhängiges Sachverständigen-Gutachten, anwaltliche Vertretung und — bei Personenschaden — Schmerzensgeld nach § 253 Abs. 2 BGB. Alle Positionen trägt der gegnerische Haftpflichtversicherer.',
  },
  {
    frage: 'Muss ich mein Auto in eine bestimmte Werkstatt bringen?',
    antwort:
      'Nein. Sie haben die freie Werkstattwahl (BGH VI ZR 53/09) und müssen sich nicht auf das „Partner-Netz" der Versicherung verweisen lassen. Sie dürfen die Reparatur auch fiktiv auf Gutachtenbasis abrechnen.',
  },
  {
    frage: 'Kostet mich die Schadensregulierung etwas?',
    antwort:
      'Bei unverschuldetem Unfall 0 €: Reparatur, Gutachten, Anwalt und Nebenkosten trägt die gegnerische Haftpflichtversicherung nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
  },
  {
    frage: 'Bekomme ich auch ohne Mietwagen eine Entschädigung?',
    antwort:
      'Ja. Verzichten Sie auf einen Mietwagen, steht Ihnen für die Dauer des Fahrzeugausfalls eine Nutzungsausfallentschädigung zu — gestaffelt nach Fahrzeugklasse pro Tag.',
  },
  {
    frage: 'Wie lange habe ich Zeit, meine Ansprüche geltend zu machen?',
    antwort:
      'Die regelmäßige Verjährungsfrist beträgt 3 Jahre (§ 195 BGB), beginnend mit dem Schluss des Jahres, in dem der Anspruch entstanden ist und Sie Kenntnis erlangt haben. Beweise sichern Sie aber am besten sofort über ein unabhängiges Gutachten.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Rechte nach unverschuldetem Unfall durchsetzen',
            description:
              'Vollständige Wiederherstellung nach § 249 BGB nach unverschuldetem Verkehrsunfall: Gutachten, Reparatur oder Wiederbeschaffung, Wertminderung, Nutzungsausfall, Mietwagen, anwaltliche Vertretung und Schmerzensgeld — alle Kosten trägt die gegnerische Haftpflichtversicherung, für Geschädigte 0 €.',
            url: `${SITE_URL}/unverschuldeter-unfall-rechte`,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Unverschuldeter Unfall: Ihre Rechte', url: '/unverschuldeter-unfall-rechte' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Unverschuldeter Unfall: Ihre Rechte</span>
        </nav>

        {/* Hero */}
        <header className="relative overflow-hidden rounded-ios-lg bg-claimondo-navy p-8 text-white sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle at 18% 20%, rgba(69,115,162,0.40), transparent 55%)' }}
          />
          <div className="relative">
            <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
              § 249 BGB · Naturalrestitution · Freie Werkstatt- & Gutachterwahl
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              Unverschuldeter Unfall — das steht Ihnen jetzt zu
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Wer den Unfall nicht verschuldet hat, hat Anspruch auf vollständige Wiederherstellung (§ 249 BGB).
              Vom Gutachten bis zum Schmerzensgeld trägt alles die gegnerische Haftpflichtversicherung —
              <strong className="text-white"> für Sie 0 € Eigenkosten</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/gutachter-finden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                Sachverständigen finden
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        {/* Antwort-zuerst-Block */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Das Prinzip: Sie sollen stehen wie ohne Unfall
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            § 249 BGB verlangt Naturalrestitution — die vollständige Wiederherstellung des Zustands vor dem
            Unfall. Daraus folgen Ihre Einzelansprüche, und ebenso drei wichtige Freiheiten: die freie Wahl des
            Sachverständigen, die freie Werkstattwahl (BGH VI ZR 53/09) und die freie Anwaltswahl. Niemand darf
            Sie auf den Gutachter oder das „Partner-Netz" der Versicherung verweisen.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {['Freie Sachverständigenwahl', 'Freie Werkstattwahl', 'Freie Anwaltswahl'].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Anspruechs-Grid */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Ihre Ansprüche im Überblick
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Jede Position ist einzeln durchsetzbar. Tippen Sie für die rechtliche Einordnung mit BGH-Bezug:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ANSPRUECHE.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-start justify-between gap-4 rounded-ios-md border border-claimondo-border bg-white p-4 transition hover:border-claimondo-ondo/40 hover:bg-claimondo-bg"
              >
                <div>
                  <p className="font-bold text-claimondo-navy">{a.titel}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-claimondo-shield">{a.text}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-claimondo-light-blue transition group-hover:text-claimondo-ondo" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Vertiefung / Cornerstone-Cross-Links */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            Schritt für Schritt durch die Schadensregulierung
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Der vollständige Ablauf — von der Unfallstelle bis zur Auszahlung — und was die Versicherung Ihnen
            nicht von sich aus erzählt:
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/kfz-haftpflicht-schaden" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Kfz-Haftpflichtschaden: das vollständige Handbuch</Link>
            </li>
            <li>
              → <Link href="/ratgeber" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Unfall-Ratgeber: die ersten Schritte als Geschädigte:r</Link>
            </li>
            <li>
              → <Link href="/gegnerische-versicherung-zahlt-nicht" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Wenn die gegnerische Versicherung nicht zahlt</Link>
            </li>
          </ul>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="Unverschuldet? Hol dir alles, was dir zusteht — 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Unverschuldeter Unfall Rechte" whatsappHref={WA} />
    </div>
  )
}
