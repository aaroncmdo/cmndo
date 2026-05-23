import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, MessageCircle } from 'lucide-react'
import { DynamicWizard } from '@/components/onboarding/DynamicWizard'
import { KartenWizardToggle } from '@/components/onboarding/KartenWizardToggle'
import {
  serviceSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'
import { buildLanguageAlternates } from '@/lib/seo/alternates'
import { ladeSvLeads, ladeAktiveSVs } from '@/lib/actions/gutachter-finder-actions'
import { GutachterFinderMapClient } from './GutachterFinderMapClient'
import { TrustStripSection } from '@/components/landing/sections/TrustStripSection'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'

export const metadata: Metadata = {
  title: 'Kfz-Gutachter finden in Ihrer Nähe — Karte & Termin in unter 48 h',
  description:
    'Interaktive Karte mit zertifizierten Partner-Sachverständigen in Deutschland. Klick auf Marker, freien Termin sehen, in unter 48 h vor Ort. 0 € für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer), BGH-fest geregelt.',
  keywords: [
    'Kfz-Gutachter finden',
    'Sachverständiger in der Nähe',
    'Unfallgutachter',
    'DAT-Experte Karte',
    'Kfz-Sachverständiger Köln',
    'Kfz-Sachverständiger Düsseldorf',
    'Kfz-Sachverständiger NRW',
    'unabhängiger Gutachter',
    'Schadensgutachten Termin',
    'Wertminderung berechnen',
    'Karte Sachverständige',
    'Gutachter Suche bundesweit',
  ],
  alternates: {
    canonical: `${SITE_URL}/gutachter-finden`,
    ...buildLanguageAlternates('/gutachter-finden'),
  },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/gutachter-finden`,
    title: 'Kfz-Gutachter finden — Karte mit DAT-Sachverständigen',
    description:
      'Interaktive Karte aller verfügbaren DAT-Sachverständigen in Deutschland. Termin in unter 48 h. Kostenfrei für unverschuldet Geschädigte nach §249 BGB.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kfz-Gutachter finden — Karte mit DAT-SVs',
    description: 'Karte aller verfügbaren Sachverständigen in Deutschland. Termin in unter 48h.',
  },
}

// AAR-UWG-Fix 14.05.2026: '110+' und '+33 %' Phantom-Zahlen entfernt.
const KPIS = [
  { wert: 'DAT', label: 'zertifiziertes Partner-Netzwerk' },
  { wert: '< 48 h', label: 'bis zum Termin vor Ort' },
  { wert: '0 €', label: 'nach §249 BGB¹' },
  { wert: '30–40 %', label: 'Versicherer-Kürzung zurückgeholt²' },
] as const

const KPI_METHODIK =
  '¹ Vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer. ' +
  '² Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen, ' +
  'BGH VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24.'

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Wie finde ich auf der Karte den passenden Sachverständigen?',
    antwort:
      'Erlauben Sie die Standort-Abfrage (Geolocation), dann zoomt die Karte automatisch auf Ihre Region. Klicken Sie auf einen blauen Marker — der Wizard rechts/unten öffnet sich mit Verfügbarkeit, Spezialisierung und Direkt-Buchung. Mobile: Tap auf Marker → Bottom-Sheet öffnet.',
  },
  {
    frage: 'Sind die angezeigten Sachverständigen unabhängig?',
    antwort:
      'Ja. Alle Partner-Sachverständigen sind zertifiziert (öffentliches DAT-Verzeichnis dat.de/sachverstaendige) und arbeiten unabhängig — sie stehen nicht im Dienst einer Versicherung. Sie berechnen Reparatur, Wertminderung, Wiederbeschaffungswert und Restwert nach BGH-Linie und BVSK-Honorartabelle.',
  },
  {
    frage: 'Was kostet mich die Vermittlung über die Karte?',
    antwort:
      'Bei unverschuldetem Unfall mit Schaden über 750 €: 0 €. Honorar trägt die gegnerische Haftpflichtversicherung nach §249 BGB. Sicherungsabtretung (§164 BGB) Standard, kein Vorschuss.',
  },
  {
    frage: 'Was, wenn in meiner Region kein Tier-1-SV angezeigt wird?',
    antwort:
      'Dann fallen Sie automatisch auf einen Tier-3-Partner zurück (graue Marker ohne Iso-Halo). Oder Sie melden den Schaden direkt unter /schaden-melden — Dispatch koordiniert den nächstgelegenen freien SV in unter 15 Minuten.',
  },
  {
    frage: 'Wie schnell ist der Termin in der Praxis?',
    antwort:
      'Bei Tier-1-Partnern mit Calendar-Sync (Iso-Halo um den Marker) sehen Sie Live-Slots im Wizard. Standard-Termin: unter 48 Stunden, oft am Folgetag. Akut-Schäden (Totalschaden, Verbringung nötig) können Tagesgleich-Termine bekommen — Anruf unter ' + PHONE_DISPLAY + ' beschleunigt.',
  },
]

const HOWTO_STEPS = [
  { nr: 1, name: 'Karte öffnen', text: 'Geolocation erlauben → automatischer Zoom auf Ihre Region. Manuell: Stadt im Suchfeld eingeben.' },
  { nr: 2, name: 'Marker auswählen', text: 'Blaue Marker = Tier-1 Pro-/Premium-SVs mit Live-Verfügbarkeit. Graue Marker = Tier-3 Partner.' },
  { nr: 3, name: 'Termin im Wizard buchen', text: 'Wizard öffnet mit Verfügbarkeit, Spezialisierung, Anfahrt. Drei Felder ausfüllen, Termin bestätigen.' },
  { nr: 4, name: 'Bestätigung + Erinnerung', text: 'WhatsApp + Email mit Termin-Details. Live-Status im Claimondo-Portal nach Termin.' },
]

// 2026-05-11: Mapbox-Karte (Vollbild) + DynamicWizard im Sidebar-Panel.
// Karte zeigt sv_leads als Marker + Iso-Einsatzgebiete als Halos.
// SEO-H1 ist im GutachterFinderMapClient als Visual-H1.
// 2026-05-14 Premium-Polish: Trust-Strip + BGH-Authority + Bottom-CTA
// unterhalb der Karte für scroll-bare Premium-Content + GEO-Authority.
export default async function GutachterFindenPage() {
  const [svLeadsResult, aktiveSVsResult] = await Promise.all([
    ladeSvLeads(),
    ladeAktiveSVs(),
  ])
  const svLeads = svLeadsResult.ok ? svLeadsResult.data : []
  const aktiveSVs = aktiveSVsResult.ok ? aktiveSVsResult.data : []

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung über interaktive Karte',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen über interaktive Karte. Zertifizierte Partner-Sachverständige aus dem öffentlichen DAT-Verzeichnis, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Kfz-Gutachter über interaktive Karte finden und Termin buchen',
            description:
              'In vier Schritten zum Termin: Karte öffnen, Marker auswählen, Wizard ausfüllen, Bestätigung erhalten. Ø Buchungsdauer: unter 5 Minuten.',
            totalTime: 'PT5M',
            step: HOWTO_STEPS.map((s) => ({
              '@type': 'HowToStep',
              position: s.nr,
              name: s.name,
              text: s.text,
            })),
          },
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
        ])}
      />
      <h1 className="sr-only">
        Kfz-Gutachter in Ihrer Nähe finden — Karte mit DAT-Sachverständigen, kostenfrei nach §249 BGB
      </h1>

      <GutachterFinderMapClient
        svLeads={svLeads}
        aktiveSVs={aktiveSVs}
        // AAR-902: Toggle zwischen Termin-direkt-buchen (DynamicWizard,
        // Default) und Schnell-Anfrage (Mini-Wizard mit Magic-Link).
        // Termin-Funktionalitaet bleibt erhalten — Aaron-Feedback
        // 14.05.2026 "ineinanderfuehren, beides ist wichtig".
        wizardSlot={
          <KartenWizardToggle
            dynamicWizard={<DynamicWizard flowKey="gutachter-finden" />}
          />
        }
      />

      {/* Premium-Polish 2026-05-14: scroll-bare Section unterhalb der Karte
          mit Trust-Strip, BGH-Authority, FAQ und Bottom-CTA. Karten-UX
          oberhalb unverändert (100 dvh) — User scrollt nach unten für mehr
          Kontext. Crawler indexieren beides. */}
      <TrustStripSection kpis={[...KPIS]} methodikNote={KPI_METHODIK} />

      <BghAuthorityGrid
        headingId="gutachter-finden-bgh"
        subline=" Egal ob Sie den Gutachter über die Karte buchen oder direkt anrufen — alle Partner-SVs arbeiten BGH-konform."
      />

      {/* FAQ */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="gutachter-finden-faq">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Häufige Fragen zur Karte
            </p>
            <h2 id="gutachter-finden-faq" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Antworten zur Gutachter-Suche
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-2xl border border-claimondo-border bg-white p-5">
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

      {/* Bottom CTA */}
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
            Kein passender Marker in der Karte?
          </h2>
          <p className="mt-4 text-white/75">
            Sagen Sie uns Ihre Stadt — wir matchen Sie in unter 15 Minuten mit dem
            nächstgelegenen freien Sachverständigen.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="cta-gutachter-finden-melden"
            >
              Schaden direkt melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
              data-tracking="call-gutachter-finden-bottom"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
              data-tracking="whatsapp-gutachter-finden-bottom"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
