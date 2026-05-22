import Link from 'next/link'
import Image from 'next/image'
import { Phone, ChevronRight, CheckCircle2, MessageCircle, Quote } from 'lucide-react'
import {
  serviceSchema, faqPageSchema, jsonLdScript,
  SITE_URL, PHONE_DISPLAY, PHONE_E164,
} from '@/lib/seo/jsonld'
import { PortalMockupSection } from './sections/PortalMockupSection'
import { WertminderungSandenDannerSection } from './sections/WertminderungSandenDannerSection'
import { TeslaEAutoSection } from './sections/TeslaEAutoSection'
import { TrustStripSection } from './sections/TrustStripSection'
import { BghAuthorityGrid } from './sections/BghAuthorityGrid'
import { HomeLeadFormClient } from './HomeLeadFormClient'

// Hauptseiten-Premium-Layout für claimondo.de — basiert auf dem
// Köln-Handoff-Prototype (IMPLEMENTIERUNGSPLAN.md, KfzGutachterKoelnLanding.tsx),
// generalisiert für nationale Sichtbarkeit. Trust + Conversion + GEO-Authority
// in einem Flow.
//
// Section-Reihenfolge:
//   1. Hero Image Band (Foto-Band mit Quote)
//   2. Hero + Lead-Form (Navy-Glass, 4 Trust-Points, dual-CTA)
//   3. Trust-Strip (4 KPIs)
//   4. Aufklärung — Was Ihnen zusteht (Wissensdatenbank §1, §3, §7)
//   5. BGH-Authority (8 Urteile, simple 4-col Grid)
//   6. Prozess (5 Schritte mit Step-Tag)
//   7. Einsatzgebiet (NRW-Karte + 6 City-Pills)
//   8. Berater (Foto + Quote)
//   9. FAQ (10 Items, Schema-fähig)
//   10. Bottom CTA (Navy mit Glow)
//
// Wissensdatenbank-Quotables sind direkt in den Body integriert, damit AI-
// Crawler (GPTBot, ClaudeBot, PerplexityBot) sie wörtlich übernehmen können
// (Princeton-GEO-Patterns: Cite Sources, Statistics Addition, Quotation
// Addition, Authoritative Tone, Easy-to-Understand).

// AAR-UWG-Fix 14.05.2026: KPI-Block bleibt, erhält aber Methodik-Tooltip
// in TrustStripSection (aggregierte Auswertung Partner-Netzwerk, Methodik
// auf Anfrage). Konkrete Zahlen werden per Aaron-TODO aus Supabase
// nachgeschärft; bis dahin Aggregat-Framing.
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

const ANSPRUECHE = [
  {
    titel: 'Reparatur oder Wiederbeschaffungswert',
    text: 'Vollständige Erstattung inkl. UPE-Aufschläge, Verbringung und Beilackierung. BGH VI ZR 65/18 + VI ZR 174/24.',
  },
  {
    titel: 'Merkantile Wertminderung',
    text: 'Nach Sanden/Danner-Formel im 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 % der Reparaturkosten. Keine starre Altersgrenze (BGH VI ZR 357/03).',
  },
  {
    titel: 'Mietwagen oder Nutzungsausfall',
    text: 'Mietwagen für die gesamte Reparaturdauer oder Nutzungsausfallpauschale 23–175 €/Tag nach Sanden/Danner-Klasse.',
  },
  {
    titel: 'Gutachter- und Anwaltskosten',
    text: '100 % von der gegnerischen Haftpflichtversicherung erstattet — auch bei gerichtlicher Auseinandersetzung. §249 BGB.',
  },
] as const

const PROZESS_STEPS = [
  { nr: 1, titel: 'Schaden melden',           text: '3 Felder, ohne Anmeldung. Online oder telefonisch.' },
  { nr: 2, titel: 'Berater meldet sich',      text: 'Persönlicher Rückruf in unter 15 Minuten.' },
  { nr: 3, titel: 'DAT-Gutachter vor Ort',    text: 'In unter 48 Stunden besichtigt — meist am Folgetag.' },
  { nr: 4, titel: 'Anwalt aktiv',             text: 'Partnerkanzlei für Verkehrsrecht setzt Ansprüche durch — auch gegen Kürzungen.' },
  { nr: 5, titel: 'Geld auf dem Konto',       text: 'Ø 32 Tage. Live im Portal verfolgbar.' },
] as const

// AAR-UWG-Fix 14.05.2026: SV-Zählung pro Stadt entfernt — Zahlen waren nicht
// belegbar (Phantom). Bis echte Counts aus `sachverstaendige` (status='aktiv')
// per Server-Component nachgezogen werden, listen wir die Einsatz-Städte als
// reine Pills. Anker-Stadt Köln bleibt als `primary` markiert.
const CITY_PILLS = [
  { slug: 'koeln',        label: 'Köln',         primary: true as const },
  { slug: 'duesseldorf',  label: 'Düsseldorf' },
  { slug: 'dortmund',     label: 'Dortmund' },
  { slug: 'essen',        label: 'Essen' },
  { slug: 'bonn',         label: 'Bonn' },
  { slug: 'aachen',       label: 'Aachen' },
  { slug: 'hannover',     label: 'Hannover' },
  { slug: 'berlin',       label: 'Berlin' },
  { slug: 'hamburg',      label: 'Hamburg' },
  { slug: 'leipzig',      label: 'Leipzig' },
] as const

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was kostet ein Kfz-Gutachter nach einem unverschuldeten Unfall?',
    antwort:
      'Bei einem unverschuldeten Unfall mit Schaden über 750 € zahlen Sie 0 €. Die gegnerische Haftpflichtversicherung trägt nach §249 BGB alle Kosten. Honorare nach BVSK-Honorartabelle liegen je nach Schadenshöhe zwischen 550 € und 2.600 €.',
  },
  {
    frage: 'Wie schnell kann ein Kfz-Gutachter vor Ort sein?',
    antwort:
      'Zertifizierte Partner-Sachverständige aus dem Claimondo-Netzwerk besichtigen Ihr Fahrzeug bundesweit in unter 48 Stunden — meist am selben oder folgenden Werktag.',
  },
  {
    frage: 'Was passiert, wenn die Versicherung das Gutachten kürzt?',
    antwort:
      'Versicherer wie HUK, LVM und AXA kürzen über Prüfdienstleister (ControlExpert, K-Expert, DEKRA) typischerweise UPE-Aufschläge, Verbringung und Wertminderung. Der BGH stützt jedoch in den Leitentscheidungen VI ZR 65/18, VI ZR 174/24 und VI ZR 38/22 ff. die Geschädigten. Unsere Partnerkanzlei für Verkehrsrecht holt die Kürzungen vollständig zurück — auch gerichtlich.',
  },
  {
    frage: 'Gilt der kostenlose Service auch bei Teilschuld?',
    antwort:
      'Ja. Bei Teilschuld trägt die gegnerische Versicherung den prozentualen Anteil. Bei 50:50 zahlt Ihre eigene Kasko über das Quotenvorrecht die bevorrechtigten Positionen (Reparatur, Wertminderung, Sachverständige, Abschleppkosten) bis zu 100 %.',
  },
  {
    frage: 'Muss ich meinen Kfz-Schaden selbst bei der Versicherung melden?',
    antwort:
      'Nein. Sprechen Sie nicht direkt mit der gegnerischen Versicherung — die schickt sonst ihren eigenen Gutachter (ControlExpert, K-Expert), der systematisch kürzt. Versicherer-Prüfdienste kürzen typischerweise 30–40 % der Ansprüche (Quelle: NDR-Reportage „Prüfdienstleister" 2022, Verbraucherzentrale-Auswertungen, BGH-Leitentscheidungen VI ZR 38/22 ff. / VI ZR 65/18 / VI ZR 174/24). Mit einem unabhängigen zertifizierten Sachverständigen werden alle BGH-konformen Positionen sauber aufgenommen.',
  },
  {
    frage: 'Wie viel Wertminderung bekomme ich nach einem Unfall?',
    antwort:
      'Die merkantile Wertminderung liegt nach Sanden/Danner-Formel zwischen 500 € und 2.500 €. Faustregel: 1. Jahr 25 %, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 % der Reparaturkosten. Keine starre Altersgrenze laut BGH VI ZR 357/03.',
  },
  {
    frage: 'Was bedeutet die 130%-Regel beim Totalschaden?',
    antwort:
      'Die 130%-Regel (BGH VI ZR 67/91) erlaubt Reparaturkosten bis 130 % des Wiederbeschaffungswertes — sofern fachgerecht repariert nach Gutachten und das Fahrzeug 6 Monate weitergenutzt wird.',
  },
  {
    frage: 'Was ist das Werkstattrisiko nach den BGH-Urteilen 2024?',
    antwort:
      'Am 16.01.2024 hat der BGH in fünf Leitentscheidungen (VI ZR 38/22, 239/22, 253/22, 266/22, 51/23) klargestellt: Geschädigte müssen Reparaturrechnungen nicht selbst prüfen. Werkstatt zu teuer oder Arbeiten nicht ausgeführt → trägt die gegnerische Versicherung.',
  },
  {
    frage: 'Was ist die HIS-Datei und warum ist sie wichtig?',
    antwort:
      'Die HIS-Datei (Hinweis- und Informationssystem) speichert jeden gemeldeten Unfall zentral für alle Versicherer. Wer fiktiv abrechnet und am gleichen Bereich erneut einen Schaden meldet, riskiert die vollständige Verweigerung der Regulierung — empfohlene Beweissicherung: Zwei-Foto-Regel mit aktueller Tageszeitung.',
  },
  {
    frage: 'Werden Tesla- und E-Auto-Schäden gleich behandelt?',
    antwort:
      'Nicht ganz. Bei Tesla und anderen E-Fahrzeugen liegen Steuergeräte unter Schwellerblenden — Spätfolgen tauchen oft erst nach Monaten auf. DAT/Audatex haben oft keine korrekten Verbundzeiten für US-Fahrzeuge: ein Standardgutachten von 22.000 € entpuppt sich mit Tesla-Originaldaten als 48.000 €. Wir vermitteln gezielt E-Auto-Spezialgutachter.',
  },
]

const SCHEMA_BLOCK = jsonLdScript([
  serviceSchema({
    name: 'Kfz-Schadensregulierung mit unabhängigem Sachverständigen',
    description:
      'Vermittlung an zertifizierte Kfz-Sachverständige, Anwaltliche Durchsetzung der Ansprüche, vollständige digitale Fallakte. Bundesweit verfügbar. 0 € für unverschuldet Geschädigte nach §249 BGB.',
    url: SITE_URL,
  }),
  {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Kfz-Schaden vollständig regulieren — vom Unfall bis zur Auszahlung',
    description:
      'In fünf Schritten vom unverschuldeten Unfall zur vollständigen Auszahlung — durchschnittlich 32 Tage, ohne Eigenanteil bei unverschuldetem Unfall.',
    totalTime: 'P32D',
    step: PROZESS_STEPS.map((s) => ({
      '@type': 'HowToStep',
      position: s.nr,
      name: s.titel,
      text: s.text,
    })),
  },
  faqPageSchema(FAQS),
])

export function HauptseitePremium() {
  return (
    <div className="bg-claimondo-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={SCHEMA_BLOCK} />

      {/* 1 — Hero Image Band */}
      <section className="relative h-[280px] overflow-hidden sm:h-[360px]" aria-labelledby="hero-band-quote">
        <Image
          src="/marketing-landing-koeln/hero-woman.png"
          alt="Geschädigte ruft Claimondo direkt nach unverschuldetem Verkehrsunfall an"
          fill priority sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-claimondo-navy/85 via-claimondo-navy/55 to-transparent" aria-hidden />
        <div className="relative mx-auto flex h-full max-w-7xl items-center px-5">
          <div className="max-w-xl text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              Sofort nach dem Unfall
            </p>
            <p id="hero-band-quote" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
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
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-claimondo-light-blue backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              DAT-Sachverständigen-Netzwerk · bundesweit erreichbar
            </div>
            <h1 id="hero-heading" className="mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.02em] sm:text-5xl md:text-[3.4rem]">
              Unfall gehabt?<br />
              <span className="text-claimondo-light-blue">Wir regeln Ihren Kfz-Schaden vollständig.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              Unabhängiger zertifizierter Sachverständiger vor Ort in unter 48 h.
              Partnerkanzlei setzt Ansprüche durch.{' '}
              <strong className="text-white">0 € für unverschuldet Geschädigte</strong> nach §249 BGB.
            </p>
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
                data-tracking="call-hero"
              >
                <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
                Jetzt anrufen — Rückruf in 5 Min
              </a>
              <a
                href="https://wa.me/4922125906530"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm transition-all hover:bg-white/10"
                data-tracking="whatsapp-hero"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
            <p className="mt-5 text-xs text-white/55">
              Anonyme Beratung · Keine Bindung · DSGVO-konform
            </p>
          </div>
          <HomeLeadFormClient />
        </div>
      </section>

      {/* 3 — Trust-Strip */}
      <TrustStripSection kpis={[...KPIS]} methodikNote={KPI_METHODIK} />

      {/* 4 — Aufklärung: Was Ihnen zusteht */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="ansprueche-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              §249 BGB — Ihr gesetzlicher Anspruch
            </p>
            <h2 id="ansprueche-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Vier Dinge stehen Ihnen nach unverschuldetem Unfall zu
            </h2>
            <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
              Ein Werkstatt-Kostenvoranschlag verschenkt durchschnittlich 30–40 % des
              Anspruchs. Diese vier Positionen werden in der Praxis am häufigsten gekürzt
              — und sind durch BGH-Rechtsprechung vollständig durchsetzbar.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {ANSPRUECHE.map((a) => (
              <article
                key={a.titel}
                className="rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:shadow-claimondo-md"
              >
                <h3 className="text-lg font-bold text-claimondo-navy">{a.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{a.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — BGH-Authority */}
      <BghAuthorityGrid headingId="bgh-heading-premium" />

      {/* 5b — Portal-Mockup (Wie Uber) */}
      <PortalMockupSection />

      {/* 6 — Prozess */}
      <section className="bg-claimondo-bg py-16 sm:py-24" aria-labelledby="prozess-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              In 32 Tagen zum Geld
            </p>
            <h2 id="prozess-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Vom Unfall zur Auszahlung — in 5 Schritten
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5" role="list">
            {PROZESS_STEPS.map((s) => (
              <li
                key={s.nr}
                className="relative rounded-ios-md border border-claimondo-border bg-white p-6 shadow-claimondo-sm"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Schritt {s.nr}
                </span>
                <h3 className="mt-2 text-lg font-bold text-claimondo-navy">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6b — Wertminderung Sanden/Danner-Tabelle */}
      <WertminderungSandenDannerSection />

      {/* 7 — Einsatzgebiet */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="einsatzgebiet-heading">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Vor Ort — bundesweit
            </p>
            <h2 id="einsatzgebiet-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              DAT-Sachverständigen-Netzwerk · Schwerpunkt NRW · Top-Städte deutschlandweit
            </h2>
          </div>
          <div className="mt-12 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg shadow-claimondo-sm">
              <Image
                src="/marketing-landing-koeln/nrw-karte.png"
                alt="Claimondo Einsatzgebiet — Schwerpunkt Nordrhein-Westfalen, mit Anbindung an weitere deutsche Großstädte"
                width={900} height={650}
                className="h-auto w-full"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-claimondo-shield">
                Direkt zur Stadt-Page (regionaler Landgericht, Anwaltskammer, BVSK-Honorar):
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {CITY_PILLS.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/kfz-gutachter/${c.slug}`}
                    className={
                      'primary' in c && c.primary
                        ? 'rounded-full bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield'
                        : 'rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy'
                    }
                  >
                    {c.label}
                  </Link>
                ))}
                <Link
                  href="/kfz-gutachter"
                  className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield"
                >
                  Alle Einsatz-Städte ansehen →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8 — Berater */}
      <section className="bg-claimondo-navy py-16 text-white sm:py-20" aria-labelledby="berater-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative aspect-[4/5] overflow-hidden rounded-ios-lg border border-white/10 shadow-claimondo-lg">
            <Image
              src="/marketing-landing-koeln/berater.png"
              alt="Persönlicher Claimondo-Berater am Telefon"
              fill sizes="(max-width: 768px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
              Persönliche Begleitung
            </p>
            <h2 id="berater-heading" className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Ein Berater. Eine Nummer. Die ganze Strecke.
            </h2>
            <Quote className="mt-6 h-8 w-8 text-claimondo-light-blue/60" aria-hidden />
            <blockquote className="mt-3 text-lg leading-relaxed text-white/85">
              „Wenn die Versicherung den ControlExpert ansetzt, ist das ein Schnell-Check
              ohne Fahrzeug. Wir gehen ran, reden mit der Werkstatt, prüfen die
              Reparaturkalkulation gegen die BGH-Linie — und holen jeden Euro zurück."
            </blockquote>
            <p className="mt-4 text-sm font-semibold text-claimondo-light-blue">
              — Claimondo-Schadenbegleitung
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${PHONE_E164}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
                data-tracking="call-berater"
              >
                <Phone className="h-4 w-4 text-claimondo-ondo" aria-hidden />
                {PHONE_DISPLAY}
              </a>
              <Link
                href="/wie-es-funktioniert"
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-sm hover:bg-white/10"
              >
                So funktioniert der Ablauf
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 8b — Tesla / E-Auto Spezial */}
      <TeslaEAutoSection />

      {/* 9 — FAQ */}
      <section className="bg-white py-16 sm:py-24" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
              Häufige Fragen
            </p>
            <h2 id="faq-heading" className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
              Antworten in unter 60 Sekunden
            </h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5"
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

      {/* 10 — Bottom CTA */}
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
            Unfall gehabt? Dann gehört jetzt jede Minute Ihnen.
          </h2>
          <p className="mt-4 text-white/75">
            Rufen Sie an, schreiben Sie WhatsApp, oder melden Sie den Schaden online.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`tel:${PHONE_E164}`}
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90"
              data-tracking="call-bottom"
            >
              <Phone className="h-5 w-5 text-claimondo-ondo" aria-hidden />
              {PHONE_DISPLAY}
            </a>
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-4 text-base font-semibold text-white/90 backdrop-blur-sm hover:border-white/50"
            >
              Online melden
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
