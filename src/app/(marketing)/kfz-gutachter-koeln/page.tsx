import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, ChevronRight, CheckCircle2, MessageCircle } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'
import { LeadFormClient } from './LeadFormClient'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'

export const metadata: Metadata = {
  title: 'Kfz-Gutachter Köln & NRW — Kostenlos nach unverschuldetem Unfall · Claimondo',
  description:
    'Unverschuldeter Unfall in Köln oder NRW? Unabhängiger DAT-Kfz-Sachverständiger in unter 48 h vor Ort. 0 € für Geschädigte (§249 BGB). Rückruf in 5 Minuten ☎ 0221 25906530',
  keywords: [
    'Kfz-Gutachter Köln', 'Kfz-Sachverständiger Köln', 'Unfallgutachter NRW',
    'Schadensgutachten Köln', 'unabhängiger Gutachter', 'DAT-Experte',
    'Wertminderung berechnen', '§249 BGB', 'BVSK-Honorartabelle',
  ],
  alternates: { canonical: '/kfz-gutachter/koeln' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter/koeln`,
    title: 'Kfz-Gutachter Köln & NRW — Kostenlos · Claimondo',
    description: '23 DAT-Sachverständige in Köln · Termin < 48 h · 0 € für Geschädigte',
    images: [{ url: '/marketing-landing-koeln/hero-woman.png', width: 1200, height: 630, alt: 'Kfz-Gutachter Köln' }],
  },
}

const FAQS: Array<{ frage: string; antwort: string }> = [
  { frage: 'Was kostet ein Kfz-Gutachter nach einem unverschuldeten Unfall in Köln?', antwort: 'Bei einem unverschuldeten Unfall mit Schaden über 750 € zahlen Sie 0 €. Die gegnerische Haftpflichtversicherung trägt nach §249 BGB alle Kosten. Honorare nach BVSK-Honorartabelle liegen in Köln zwischen 650 € und 2.400 €.' },
  { frage: 'Wie schnell kann ein Kfz-Gutachter in Köln vor Ort sein?', antwort: 'In Köln und NRW besichtigt einer unserer 23 DAT-zertifizierten Partner-Sachverständigen Ihr Fahrzeug in unter 48 Stunden — meist am selben oder folgenden Werktag.' },
  { frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?', antwort: 'Versicherer wie HUK, LVM und AXA kürzen häufig UPE-Aufschläge und Wertminderung. Der BGH stützt jedoch in mehreren Urteilen (VI ZR 65/18, VI ZR 174/24) die Geschädigten. Unsere Partnerkanzlei holt die Kürzungen vollständig zurück.' },
  { frage: 'Gilt der kostenlose Service auch bei Teilschuld?', antwort: 'Ja. Bei Teilschuld trägt die gegnerische Versicherung den prozentualen Anteil. Bei 50:50 zahlen Sie 50 % — der Rest läuft über §164 BGB Sicherungsabtretung.' },
  { frage: 'Muss ich meinen Kfz-Schaden selbst bei der Versicherung melden?', antwort: 'Nein. Sprechen Sie nicht mit der gegnerischen Versicherung — die schickt sonst ihren eigenen Gutachter (ControlExpert, K-Expert), der kürzt. Unsere Kanzlei meldet den Schaden für Sie. So erhalten Geschädigte 33 % mehr Schadensersatz.' },
  { frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?', antwort: 'Die merkantile Wertminderung liegt nach Sanden/Danner-Formel zwischen 500 € und 2.500 €. Faustregel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. BGH VI ZR 357/03.' },
  { frage: 'Was bedeutet die 130%-Regel beim Totalschaden?', antwort: 'Die 130%-Regel (BGH VI ZR 67/91) erlaubt Reparaturkosten bis 130 % des Wiederbeschaffungswertes — sofern fachgerecht repariert und Fahrzeug 6 Monate weitergenutzt wird.' },
  { frage: 'Was ist das Werkstattrisiko nach den BGH-Urteilen 2024?', antwort: 'Am 16.01.2024 hat der BGH in fünf Leitentscheidungen (VI ZR 38/22 ff.) klargestellt: Geschädigte müssen Reparaturrechnungen nicht selbst prüfen. Werkstatt zu teuer → trägt die Versicherung.' },
  { frage: 'Wie funktioniert das Quotenvorrecht bei Mithaftung?', antwort: 'Bei 50:50 zahlt die gegnerische Versicherung 50 %, die eigene Kasko springt über das Quotenvorrecht ein und übernimmt bis 100 % der bevorrechtigten Positionen.' },
  { frage: 'Was ist die HIS-Datei und wieso ist sie wichtig?', antwort: 'Die HIS-Datei speichert jeden Unfall zentral für alle Versicherer. Wer fiktiv abrechnet und am gleichen Bereich erneut Schaden hat, riskiert Totalverweigerung.' },
]

const KPIS = [
  { wert: '2.000+', label: 'erfolgreich abgewickelte Fälle' },
  { wert: '8 Mio.€+', label: 'Schadensersatz durchgesetzt' },
  { wert: '32 Tage', label: 'Ø bis zur Auszahlung' },
  { wert: '< 15 Min', label: 'bis zum ersten Rückruf' },
] as const

const PROZESS_STEPS = [
  { nr: 1, titel: 'Schaden melden',         text: '3 Felder, ohne Anmeldung.' },
  { nr: 2, titel: 'Berater meldet sich',    text: 'Rückruf in < 15 Min.' },
  { nr: 3, titel: 'DAT-Gutachter vor Ort',  text: 'In < 48 h besichtigt.' },
  { nr: 4, titel: 'Anwalt aktiv',           text: 'LexDrive setzt Ansprüche durch.' },
  { nr: 5, titel: 'Geld auf dem Konto',     text: 'Ø 32 Tage. Live verfolgbar.' },
] as const

const CITY_PILLS: ReadonlyArray<{ slug: string; label: string; svs: number; primary?: boolean }> = [
  { slug: 'koeln', label: 'Köln', svs: 23, primary: true },
  { slug: 'duesseldorf', label: 'Düsseldorf', svs: 18 },
  { slug: 'bonn', label: 'Bonn', svs: 11 },
  { slug: 'dortmund', label: 'Dortmund', svs: 14 },
  { slug: 'essen', label: 'Essen', svs: 12 },
  { slug: 'aachen', label: 'Aachen', svs: 8 },
]

const BGH_URTEILE = [
  { az: 'BGH VI ZR 38/22 ff.', titel: 'Werkstattrisiko 2024', text: '5 Leiturteile 16.01.2024.' },
  { az: 'BGH VI ZR 65/18',     titel: 'UPE-Aufschläge',       text: 'UPE auch bei fiktiver Abrechnung.' },
  { az: 'BGH VI ZR 174/24',    titel: 'Beilackierung 2025',   text: 'Beilackierungskosten Teil des Schadens.' },
  { az: 'BGH VI ZR 119/04',    titel: 'Restwert regional',    text: 'Regionaler Restwertmarkt maßgeblich.' },
  { az: 'BGH VI ZR 53/09',     titel: 'Markenwerkstatt',      text: '< 3 J. oder Scheckheft → Markenwerkstatt.' },
  { az: 'BGH VI ZR 357/03',    titel: 'Wertminderung',        text: 'Keine starre Altersgrenze.' },
  { az: 'BGH VI ZR 67/91',     titel: '130%-Regel',           text: 'Reparatur bis 130 % des WBW.' },
  { az: 'BGH VI ZR 280/22',    titel: 'SV-Honorar-Risiko',    text: 'Trägt die Versicherung.' },
] as const

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          {
            '@context': 'https://schema.org',
            '@type': 'LegalService',
            '@id': `${SITE_URL}/kfz-gutachter/koeln#localbusiness`,
            name: 'Claimondo Kfz-Gutachter Köln',
            url: `${SITE_URL}/kfz-gutachter/koeln`,
            telephone: PHONE_E164,
            priceRange: '€€',
            description: 'Unabhängige DAT-zertifizierte Kfz-Sachverständige für Unfallschäden in Köln und NRW. 23 Partner-Gutachter, Termin in unter 48 Stunden, 0 € für unverschuldet Geschädigte.',
            address: { '@type': 'PostalAddress', streetAddress: 'Hansaring 10', postalCode: '50670', addressLocality: 'Köln', addressRegion: 'NW', addressCountry: 'DE' },
            geo: { '@type': 'GeoCoordinates', latitude: 50.9413, longitude: 6.9583 },
            areaServed: [
              { '@type': 'City', name: 'Köln' },
              { '@type': 'City', name: 'Düsseldorf' },
              { '@type': 'City', name: 'Bonn' },
              { '@type': 'City', name: 'Aachen' },
              { '@type': 'AdministrativeArea', name: 'Nordrhein-Westfalen' },
            ],
            aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '47', bestRating: '5' },
          },
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung Köln & NRW',
            description: 'Vermittlung an unabhängige DAT-zertifizierte Kfz-Sachverständige in Köln, Düsseldorf, Bonn, Aachen und ganz NRW.',
            url: `${SITE_URL}/kfz-gutachter/koeln`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Schaden in Köln melden und Geld erhalten',
            totalTime: 'P32D',
            step: PROZESS_STEPS.map((s) => ({ '@type': 'HowToStep', position: s.nr, name: s.titel, text: s.text })),
          },
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Köln', url: '/kfz-gutachter/koeln' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* HERO IMAGE BAND */}
      <section className="relative h-[280px] sm:h-[360px] overflow-hidden">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt="Unfallgeschädigte ruft Kfz-Gutachter Claimondo an nach unverschuldetem Verkehrsunfall in NRW"
          fill className="object-cover" priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" />
        <div className="relative h-full mx-auto max-w-7xl px-5 flex items-center">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">Sofort nach dem Unfall</p>
            <p className="mt-3 text-2xl sm:text-3xl font-bold leading-tight">
              „Ihr erster Anruf nach dem Unfall? <span className="text-claimondo-light-blue">Der richtige.</span>"
            </p>
          </div>
        </div>
      </section>

      {/* HERO mit Form */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: ['radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)','radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)'].join(', ') }} />
        <div className="relative mx-auto max-w-7xl px-5 py-12 md:py-20 grid md:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 bg-emerald-500" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              23 Gutachter aktuell in Köln & NRW verfügbar
            </div>
            <h1 className="mt-5 text-balance text-4xl sm:text-5xl md:text-[3.4rem] font-bold leading-[1.04] tracking-[-0.02em]">
              Unfall gehabt?<br /><span className="text-claimondo-light-blue">Ihr Kfz-Gutachter in Köln & NRW.</span>
            </h1>
            <p className="mt-6 text-lg text-white/80 leading-relaxed max-w-xl">
              Unabhängiger DAT-zertifizierter Sachverständiger vor Ort in unter 48 h. Anwalt setzt Ansprüche durch. <strong className="text-white">0 € für unverschuldet Geschädigte</strong> nach §249 BGB.
            </p>
            <ul className="mt-7 grid grid-cols-2 gap-3 text-sm text-white/80">
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-claimondo-light-blue" /> DAT-zertifizierte Gutachter</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-claimondo-light-blue" /> Termin &lt; 48 h</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-claimondo-light-blue" /> Live-Status im Portal</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-claimondo-light-blue" /> +33 % mehr Schadensersatz</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] hover:bg-claimondo-light-blue/90 transition-all" data-tracking="call-hero">
                <Phone className="h-5 w-5 text-claimondo-ondo" /> Jetzt anrufen — 5 Min Rückruf
              </a>
              <a href="https://wa.me/4922125906530" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10 transition-all" data-tracking="whatsapp-hero">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">Anonyme Beratung · Keine Bindung · DSGVO-konform</p>
          </div>
          <LeadFormClient />
        </div>
      </section>

      {/* TRUST-STRIP */}
      <section className="border-y border-white/50 bg-white/65 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-5 grid grid-cols-2 sm:grid-cols-4 divide-x divide-claimondo-border/60">
          {KPIS.map((k) => (
            <div key={k.label} className="py-6 text-center">
              <div className="text-2xl sm:text-3xl font-extrabold text-claimondo-navy">{k.wert}</div>
              <div className="mt-1 text-xs text-claimondo-ondo">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* BGH-AUTHORITY */}
      <section id="bgh" className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">Der BGH stützt Sie</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-claimondo-navy">8 BGH-Urteile, die Ihre Ansprüche absichern.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {BGH_URTEILE.map((u) => (
              <article key={u.az} className="rounded-2xl border border-claimondo-border bg-claimondo-bg p-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-claimondo-navy">{u.az}</span>
                <h3 className="mt-3 text-base font-bold text-claimondo-navy">{u.titel}</h3>
                <p className="mt-2 text-xs leading-relaxed text-claimondo-shield">{u.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PROZESS */}
      <section id="prozess" className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">In 32 Tagen zum Geld</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-claimondo-navy">Vom Unfall zur Auszahlung — in 5 Schritten</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
            {PROZESS_STEPS.map((s) => (
              <li key={s.nr} className="rounded-2xl border border-claimondo-border bg-claimondo-bg p-6">
                <div className="text-xs font-bold text-claimondo-ondo">SCHRITT {s.nr}</div>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{s.titel}</h3>
                <p className="mt-2 text-sm text-claimondo-shield">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* EINSATZGEBIET */}
      <section id="einsatzgebiet" className="py-16 sm:py-24 bg-claimondo-bg">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">Vor Ort in NRW</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-claimondo-navy">110+ DAT-Sachverständige — Schwerpunkt NRW</h2>
          </div>
          <div className="mt-12 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center">
            <div className="rounded-3xl overflow-hidden">
              <Image src="/marketing-landing-koeln/nrw-karte.png" alt="Claimondo Einsatzgebiet NRW" width={800} height={600} className="w-full h-auto" />
            </div>
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">Top-Städte:</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {CITY_PILLS.map((c) => (
                  <Link key={c.slug} href={`/kfz-gutachter/${c.slug}`}
                    className={c.primary
                      ? 'rounded-full bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo'}>
                    {c.label} · {c.svs} SV
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">Häufige Fragen</p>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-claimondo-navy">Antworten in unter 60 Sekunden</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-2xl border border-claimondo-border bg-claimondo-bg p-5">
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy flex items-center justify-between">
                  <span>{f.frage}</span>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: ['radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)','radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)'].join(', ') }} />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">Unfall gehabt? Dann gehört jetzt jede Minute Ihnen.</h2>
          <p className="mt-4 text-white/75">Rufen Sie an, schreiben Sie WhatsApp, oder füllen Sie das Formular.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] hover:bg-claimondo-light-blue/90 transition-all" data-tracking="call-bottom">
              <Phone className="h-5 w-5 text-claimondo-ondo" /> {PHONE_DISPLAY}
            </a>
            <a href="#lead-form" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50 transition-all">
              Formular oben ↑
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <TrackingHooks />
      <StickyCallBar quelle="Kfz-Gutachter Köln Ads-Landing" />
    </div>
  )
}

