import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  articleSchema, howToSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'

// Stream B.5 (Doc 26) — Cornerstone-Pillar „Unfall — was tun als Geschädigter".
// Primärer „was tun nach unfall"-Pillar (Vol 500, gegen HUK-Position #7). Hub:
// verlinkt nach unten auf Szenario-Spokes + die Rechte-/Misstrauens-Pages (B.2).
// /ratgeber wird per rel=canonical hierauf konsolidiert (bleibt emotionaler
// Begleiter) — siehe app/ratgeber/page.tsx. Bespoke page.tsx (Stream-B-Muster).
// JSON-LD: Article + HowTo (Sofortmaßnahmen) + FAQPage + breadcrumb.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF
const URL_SELF = `${SITE_URL}/unfall-was-tun-als-geschaedigter`

export const metadata: Metadata = {
  title: 'Unfall — was tun als Geschädigter? Schritte & Rechte · Claimondo',
  description:
    'Unverschuldeter Unfall — was tun? Die Sofortmaßnahmen am Unfallort, wer bei welchem Unfalltyp haftet, Ihre Ansprüche nach § 249 BGB und was die Versicherung verschweigt. Anwalt & Gutachten zahlt die Gegenseite — für Sie 0 €.',
  keywords: [
    'unfall was tun', 'was tun nach unfall', 'unfall was tun als geschädigter',
    'verhalten nach unfall', 'unfall checkliste', 'was tun nach autounfall unverschuldet',
    'unfall sofortmaßnahmen', 'unverschuldeter unfall ablauf',
  ],
  alternates: { canonical: '/unfall-was-tun-als-geschaedigter' },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: URL_SELF,
    title: 'Unfall — was tun als Geschädigter? Schritte & Rechte',
    description:
      'Sofortmaßnahmen, Haftung nach Unfalltyp, Ihre Ansprüche (§ 249 BGB) und die Versicherer-Tricks — kompakt erklärt. Für unverschuldet Geschädigte 0 €.',
  },
}

// Sofortmaßnahmen am Unfallort → HowTo-Schema (GEO: hohe Citation-Wahrscheinlichkeit).
const SOFORT: Array<{ name: string; text: string }> = [
  { name: 'Unfallstelle absichern', text: 'Warnblinker an, Warnweste anlegen, Warndreieck in ausreichendem Abstand aufstellen (innerorts ~50 m, Landstraße ~100 m, Autobahn ~150–200 m).' },
  { name: 'Verletzte versorgen, Notruf 112', text: 'Bei Verletzten zuerst Erste Hilfe und Rettungsdienst (112). Unterlassene Hilfeleistung ist strafbar — Eigenschutz beachten.' },
  { name: 'Polizei rufen (110)', text: 'Bei Personenschaden, höherem Sachschaden, Streit über den Hergang, Fahrerflucht, Alkohol-/Drogenverdacht oder Beteiligung von Mietwagen/Ausland. Im Zweifel rufen.' },
  { name: 'Beweise sichern', text: 'Fotos aus mehreren Perspektiven (Übersicht, Endpositionen, Schäden, Kennzeichen, Bremsspuren) und eine Unfallskizze anfertigen.' },
  { name: 'Daten austauschen', text: 'Name, Anschrift, Kennzeichen, Haftpflichtversicherung und Versicherungsnummer der Gegenseite notieren — aber kein Schuldeingeständnis abgeben.' },
  { name: 'Zeugen sichern', text: 'Namen und Telefonnummern unbeteiligter Zeugen notieren — sie sind bei strittiger Haftung oft entscheidend.' },
  { name: 'Eigenen Gutachter & Anwalt einschalten', text: 'Vor Reparaturbeginn einen eigenen, unabhängigen Sachverständigen beauftragen (Beweissicherung) und die Ansprüche über eine Verkehrsrechts-Kanzlei durchsetzen lassen.' },
]

// 6 häufigste Unfalltypen — Hub-Cross-Links auf die Szenario-Spokes (alle real).
const TYPEN: Array<{ titel: string; haftung: string; href: string }> = [
  { titel: 'Auffahrunfall', haftung: 'Der Auffahrende haftet in der Regel voll — es gilt der Anscheinsbeweis (zu geringer Abstand oder Unaufmerksamkeit).', href: '/haftpflicht/auffahrunfall' },
  { titel: 'Vorfahrt missachtet', haftung: 'Wer „rechts vor links" oder ein Vorfahrtschild missachtet, haftet ganz überwiegend.', href: '/haftpflicht/vorfahrt-rechts-vor-links' },
  { titel: 'Linksabbieger', haftung: 'Der Linksabbieger trägt meist die Hauptschuld — er muss entgegenkommende Fahrzeuge durchlassen (§ 9 StVO).', href: '/haftpflicht/linksabbieger' },
  { titel: 'Spurwechsel', haftung: 'Wer den Fahrstreifen wechselt, haftet bei einer Kollision regelmäßig — die Sorgfaltspflicht trifft den Wechselnden.', href: '/haftpflicht/spurwechsel' },
  { titel: 'Parkplatzunfall', haftung: 'Häufig Haftungsquoten: auf Parkplätzen gelten Schrittgeschwindigkeit und gegenseitige Rücksichtnahme.', href: '/haftpflicht/parkplatz' },
  { titel: 'Rotlichtverstoß', haftung: 'Wer bei Rot fährt, haftet voll — der Nachweis gelingt oft über Zeugen oder die Ampelphase.', href: '/haftpflicht/rotlicht' },
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Was muss ich nach einem Unfall sofort tun?',
    antwort:
      'Unfallstelle absichern (Warnblinker, Warnweste, Warndreieck), Verletzte versorgen und ggf. 112 rufen, bei Bedarf die Polizei (110), Beweise sichern (Fotos + Unfallskizze), Daten der Gegenseite notieren — ohne Schuldeingeständnis — und vor der Reparatur einen eigenen Sachverständigen beauftragen.',
  },
  {
    frage: 'Wann muss die Polizei zum Unfall kommen?',
    antwort:
      'Spätestens bei Personenschaden, höherem Sachschaden, Streit über den Hergang, Fahrerflucht, Alkohol-/Drogenverdacht oder Auslands-/Mietwagenbeteiligung. Im Zweifel immer rufen — die polizeiliche Aufnahme sichert Beweise.',
  },
  {
    frage: 'Darf ich am Unfallort die Schuld eingestehen?',
    antwort:
      'Nein. Geben Sie kein Schuldeingeständnis ab und unterschreiben Sie keine vorformulierten Erklärungen. Halten Sie nur Beobachtetes fest — die Haftung klärt sich später anhand der Beweislage.',
  },
  {
    frage: 'Brauche ich einen Anwalt — und was kostet er mich?',
    antwort:
      'Bei unverschuldetem Unfall sind die Kosten der anwaltlichen Vertretung erforderlicher Herstellungsaufwand und werden vom gegnerischen Haftpflichtversicherer getragen (BGH VI ZR 235/13). Für Sie entstehen keine Eigenkosten — wer ohne Anwalt verhandelt, akzeptiert dagegen häufig zu niedrige Angebote.',
  },
  {
    frage: 'Was zahlt die gegnerische Versicherung?',
    antwort:
      'Bei unverschuldetem Unfall den vollständigen Schaden nach § 249 BGB: Reparatur oder Wiederbeschaffung, Wertminderung, Nutzungsausfall oder Mietwagen, Sachverständigen- und Anwaltskosten sowie — bei Personenschaden — Schmerzensgeld. Durchgesetzt über den Direktanspruch (§ 115 VVG).',
  },
  {
    frage: 'Wie lange habe ich Zeit, meine Ansprüche durchzusetzen?',
    antwort:
      'Die regelmäßige Verjährung beträgt 3 Jahre (§ 195 BGB) ab Schluss des Jahres der Kenntnis; bei Personenschäden bis zu 30 Jahre (§ 199 Abs. 2 BGB). Beweise sichern Sie aber am besten sofort.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          articleSchema({
            headline: 'Unfall — was tun als Geschädigter? Sofortmaßnahmen, Haftung & Rechte',
            description:
              'Umfassender Leitfaden für unverschuldet Unfallgeschädigte: Sofortmaßnahmen am Unfallort, Haftung nach Unfalltyp, Ansprüche nach § 249 BGB und die typischen Versicherer-Taktiken.',
            datePublished: '2026-05-24',
            url: URL_SELF,
            citation: ['§ 249 BGB', '§ 115 VVG', '§ 7 StVG', '§ 9 StVO', 'BGH VI ZR 235/13'],
          }),
          howToSchema({
            name: 'Was tun nach einem unverschuldeten Unfall — Sofortmaßnahmen',
            description: 'Die richtigen Schritte direkt nach einem Verkehrsunfall, um sich und Ihre Ansprüche zu sichern.',
            totalTime: 'PT30M',
            schritte: SOFORT,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Unfall — was tun als Geschädigter', url: '/unfall-was-tun-als-geschaedigter' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Unfall — was tun als Geschädigter</span>
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
              § 249 BGB · Direktanspruch § 115 VVG · BGH VI ZR 235/13
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              Unfall — was tun als Geschädigter?
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Die ersten Minuten entscheiden über Ihre Beweislage — die nächsten Wochen über Ihr Geld. Dieser
              Leitfaden führt Sie durch die Sofortmaßnahmen, die Haftung je Unfalltyp und alle Ansprüche. Bei
              unverschuldetem Unfall trägt die Gegenseite Gutachten und Anwalt — <strong className="text-white">für Sie 0 €</strong>.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                Schaden kostenlos melden
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        {/* Antwort-zuerst */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Das Wichtigste in 30 Sekunden
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Sichern Sie zuerst Menschen und Beweise, geben Sie kein Schuldeingeständnis ab, und beauftragen Sie
            vor der Reparatur einen eigenen Sachverständigen. Bei unverschuldetem Unfall haben Sie Anspruch auf
            vollständige Wiederherstellung (§ 249 BGB), durchsetzbar direkt gegen die gegnerische Haftpflicht
            (§ 115 VVG). Anwalts- und Gutachterkosten trägt die Gegenseite — Sie gehen kein finanzielles Risiko ein.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              'Eigener, unabhängiger Sachverständiger — freie Wahl',
              'Freie Werkstatt- und Anwaltswahl',
              'Anwalt & Gutachten zahlt die Gegenseite',
              'Kein Schuldeingeständnis am Unfallort',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Sofortmaßnahmen (HowTo) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Sofortmaßnahmen am Unfallort
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            In dieser Reihenfolge gehen Sie vor — vom Eigenschutz bis zur Beweissicherung:
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {SOFORT.map((s, i) => (
              <li key={s.name} className="flex items-start gap-3 rounded-ios-md border border-claimondo-border bg-white p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-[0.85rem] font-bold text-white">{i + 1}</span>
                <div>
                  <p className="font-bold text-claimondo-navy">{s.name}</p>
                  <p className="mt-1 text-[0.92rem] leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[0.95rem]">
            → <Link href="/unfallskizze" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Unfallskizze erstellen — kostenlose Vorlage zum Ausdrucken</Link>
          </p>
        </section>

        {/* 6 Unfalltypen (Hub → Spokes) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Wer haftet? Die 6 häufigsten Unfalltypen
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Die Haftung hängt vom Hergang ab. Tippen Sie für die rechtliche Einordnung mit BGH-Bezug:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TYPEN.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group flex items-start justify-between gap-4 rounded-ios-md border border-claimondo-border bg-white p-4 transition hover:border-claimondo-ondo/40 hover:bg-claimondo-bg"
              >
                <div>
                  <p className="font-bold text-claimondo-navy">{t.titel}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-claimondo-shield">{t.haftung}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-claimondo-light-blue transition group-hover:text-claimondo-ondo" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Rechte (→ B.2 Rechte-Hub + Handbuch) */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Ihre Ansprüche nach unverschuldetem Unfall
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Sie sollen stehen wie ohne Unfall (Naturalrestitution, § 249 BGB). Daraus folgt ein ganzes Bündel an
            Ansprüchen — von Reparatur und Wertminderung über Nutzungsausfall bis Schmerzensgeld:
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/unverschuldeter-unfall-rechte" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Unverschuldeter Unfall: Ihre Rechte im Überblick</Link>
            </li>
            <li>
              → <Link href="/kfz-haftpflicht-schaden" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Kfz-Haftpflichtschaden: das vollständige Handbuch</Link>
            </li>
            <li>
              → <Link href="/kosten-kfz-gutachten" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Was kostet ein Gutachten — und wer zahlt es?</Link>
            </li>
          </ul>
        </section>

        {/* HUK-Konter / Was die Versicherung verschweigt */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            Was die gegnerische Versicherung Ihnen nicht sagt
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Der gegnerische Versicherer vertritt sein eigenes Interesse, nicht Ihres. Sie müssen weder seinen
            Gutachter akzeptieren noch sein erstes Angebot annehmen — und Kürzungen sind oft unberechtigt:
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-[0.95rem]">
            <li>
              → <Link href="/versicherung-schickt-gutachter" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">„Wir schicken unseren Gutachter" — müssen Sie das akzeptieren?</Link>
            </li>
            <li>
              → <Link href="/gegnerische-versicherung-zahlt-nicht" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Die gegnerische Versicherung zahlt nicht — was tun?</Link>
            </li>
            <li>
              → <Link href="/decoder" className="font-semibold text-claimondo-ondo underline-offset-2 hover:underline">Versicherer-Brief-Decoder: die typischen Schreiben entschlüsselt</Link>
            </li>
          </ul>
        </section>

        {/* FAQ (sichtbar, ergänzt das FAQPage-Schema) */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Häufige Fragen
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {FAQS.map((f) => (
              <div key={f.frage} className="rounded-ios-md border border-claimondo-border bg-white p-4">
                <p className="font-bold text-claimondo-navy">{f.frage}</p>
                <p className="mt-1 text-[0.92rem] leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </div>
            ))}
          </div>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="Unverschuldet verunglückt? Wir führen dich durch alles — 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Cornerstone: Unfall was tun" whatsappHref={WA} />
    </div>
  )
}
