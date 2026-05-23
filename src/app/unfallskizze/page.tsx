import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, ChevronRight, Check, Download } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { SpokeCtaBand } from '@/components/content/SpokeCtaBand'
import { ConversionAnchorBlock } from '@/components/content/ConversionAnchorBlock'
import {
  howToSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY, PHONE_E164, WHATSAPP_HREF,
} from '@/lib/seo/jsonld'

// Stream B.6 (Doc 26) — Tool-Page „Unfallskizze". Faengt die Tool-/Vorlage-
// Keywords (unfallskizze vorlage / muster / erstellen). Liefert eine
// herunterladbare PDF-Vorlage + Erklaertext + 8 Best-Practice-Tipps (Doc 26 DoD).
// Komplett neue Flaeche (kein bestehender Content zielt auf „unfallskizze") →
// null Kannibalisierung. JSON-LD: HowTo + FAQPage + breadcrumb.

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const WA = WHATSAPP_HREF
const PDF_HREF = '/downloads/unfallskizze-claimondo-vorlage.pdf'

export const metadata: Metadata = {
  title: 'Unfallskizze erstellen — kostenlose Vorlage (PDF) + 8 Tipps · Claimondo',
  description:
    'Unfallskizze nach Verkehrsunfall richtig erstellen: kostenlose PDF-Vorlage zum Ausdrucken, Schritt-für-Schritt-Anleitung und 8 Best-Practice-Tipps. Die Skizze ist oft das entscheidende Beweismittel zum Unfallhergang.',
  keywords: [
    'unfallskizze', 'unfallskizze vorlage', 'unfallskizze muster pdf', 'unfallskizze erstellen',
    'unfallbericht skizze', 'wie unfallskizze zeichnen', 'unfallskizze vorlage kostenlos',
    'skizze verkehrsunfall',
  ],
  alternates: { canonical: '/unfallskizze' },
  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/unfallskizze`,
    title: 'Unfallskizze erstellen — kostenlose Vorlage (PDF) + 8 Tipps',
    description:
      'Kostenlose PDF-Vorlage zum Ausdrucken + Schritt-für-Schritt-Anleitung. Die Unfallskizze ist oft das entscheidende Beweismittel zum Hergang.',
  },
}

// HowTo-Schritte (GEO: HowTo-Schema = hohe Citation-Wahrscheinlichkeit).
const SCHRITTE: Array<{ name: string; text: string }> = [
  { name: 'Straßenverlauf skizzieren', text: 'Zeichnen Sie Fahrbahnen, Kreuzung oder Einmündung, Spuren und Fahrbahnmarkierungen grob maßstäblich auf.' },
  { name: 'Fahrzeuge vor dem Unfall einzeichnen', text: 'Setzen Sie beide Fahrzeuge (als A und B beschriftet) in ihre Ausgangsposition vor der Kollision.' },
  { name: 'Fahrtrichtungen mit Pfeilen markieren', text: 'Ein Pfeil pro Fahrzeug zeigt die Fahrtrichtung — so wird der Bewegungsablauf nachvollziehbar.' },
  { name: 'Kollisionspunkt mit X markieren', text: 'Markieren Sie den Aufprallpunkt deutlich mit einem X; ergänzen Sie die Endpositionen nach dem Unfall.' },
  { name: 'Umfeld festhalten', text: 'Verkehrszeichen, Ampeln, Vorfahrtsituation, Norden, Straßennamen und ungefähre Abstände eintragen.' },
  { name: 'Rahmendaten notieren', text: 'Datum, Uhrzeit, Licht- und Wetterverhältnisse sowie Zeugen mit Kontaktdaten vermerken.' },
]

const WAS_REIN = [
  'Straßenverlauf, Fahrbahnen, Kreuzung/Einmündung',
  'Position beider Fahrzeuge VOR dem Unfall',
  'Fahrtrichtungen als Pfeile (Fahrzeug A / B)',
  'Kollisionspunkt als X markiert',
  'Endpositionen NACH dem Unfall',
  'Verkehrszeichen, Ampeln, Fahrbahnmarkierungen',
  'Nordpfeil + Straßennamen',
  'Datum, Uhrzeit, Licht-/Wetterverhältnisse',
]

const TIPPS = [
  'Sofort vor Ort skizzieren, solange der Hergang frisch ist.',
  'Ergänzend Fotos aus mehreren Perspektiven (Übersicht + Detail).',
  'Beide Fahrzeuge eindeutig mit A und B beschriften — inklusive Kennzeichen.',
  'Einheitliche Legende: Pfeil = Fahrtrichtung, X = Aufprallpunkt.',
  'Endpositionen einzeichnen — sie zeigen Aufprallwinkel und -wucht.',
  'Verkehrszeichen, Ampelphase und Vorfahrtsituation genau festhalten.',
  'Zeugen mit Namen und Telefonnummer notieren.',
  'Nur Beobachtetes festhalten — am Unfallort kein Schuld­eingeständnis abgeben.',
]

const FAQS: Array<{ frage: string; antwort: string }> = [
  {
    frage: 'Wozu brauche ich eine Unfallskizze?',
    antwort:
      'Die Unfallskizze sichert den Unfallhergang als Beweis und macht ihn für Versicherung, Sachverständigen und ggf. Gericht nachvollziehbar. Zusammen mit Fotos und Zeugenangaben ist sie oft das entscheidende Beweismittel zur Klärung der Schuldfrage.',
  },
  {
    frage: 'Ist eine Unfallskizze Pflicht?',
    antwort:
      'Gesetzlich vorgeschrieben ist sie nicht, aber dringend zu empfehlen. Bei strittiger Haftung kann die Skizze über die volle Erstattung entscheiden — sie ergänzt den Unfallbericht und die Fotodokumentation.',
  },
  {
    frage: 'Was muss in eine Unfallskizze hinein?',
    antwort:
      'Straßenverlauf, die Position beider Fahrzeuge vor der Kollision, die Fahrtrichtungen (Pfeile), der Kollisionspunkt (X), die Endpositionen, Verkehrszeichen und Ampeln, ein Nordpfeil mit Straßennamen sowie Datum, Uhrzeit und Wetter.',
  },
  {
    frage: 'Reicht nicht ein Foto vom Unfall?',
    antwort:
      'Fotos und Skizze ergänzen sich: Fotos zeigen Schäden und Endlage, die Skizze den Bewegungsablauf und die Verkehrssituation. Gemeinsam ergeben sie die stärkste Beweislage.',
  },
  {
    frage: 'Darf ich am Unfallort die Schuld eingestehen?',
    antwort:
      'Nein. Halten Sie ausschließlich Beobachtetes fest und geben Sie kein Schuldeingeständnis ab — auch nicht auf der Skizze. Die Haftung wird später anhand aller Beweise geklärt.',
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          howToSchema({
            name: 'Unfallskizze erstellen',
            description:
              'Schritt-für-Schritt-Anleitung, um nach einem Verkehrsunfall eine beweissichere Unfallskizze zu zeichnen.',
            totalTime: 'PT10M',
            schritte: SCHRITTE,
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Start', url: '/' },
            { name: 'Unfallskizze', url: '/unfallskizze' },
          ]),
        ])}
      />
      <LandingTopbar authenticatedUser={null} />
      <main className="mx-auto max-w-[960px] px-6 py-10">
        <nav className="mb-6 text-[0.8125rem] text-claimondo-shield" aria-label="Brotkrumen">
          <Link href="/" className="hover:text-claimondo-ondo">Start</Link>
          <span className="px-1.5 text-claimondo-light-blue">/</span>
          <span className="text-claimondo-navy">Unfallskizze</span>
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
              Beweissicherung am Unfallort
            </span>
            <h1 style={HEAD_FONT} className="mt-4 text-balance text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">
              Unfallskizze erstellen — die kostenlose Vorlage
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              Eine saubere Unfallskizze ist oft das entscheidende Beweismittel zum Hergang. Laden Sie die
              kostenlose Vorlage herunter, legen Sie sie ins Handschuhfach — und füllen Sie sie im Ernstfall
              direkt vor Ort aus.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={PDF_HREF} download className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-extrabold text-claimondo-navy transition hover:bg-claimondo-light-blue/90">
                <Download className="h-4 w-4" aria-hidden />
                Vorlage herunterladen (PDF)
              </a>
              <a href={`tel:${PHONE_E164}`} className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10">
                <Phone className="h-4 w-4" aria-hidden />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        {/* Antwort-zuerst / Was reingehört */}
        <section className="mt-10 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:p-7">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Was in eine Unfallskizze gehört
          </h2>
          <p className="mt-2 max-w-prose leading-relaxed text-claimondo-shield">
            Die Skizze rekonstruiert den Bewegungsablauf — wer kam woher, wo war der Aufprall, wie standen die
            Fahrzeuge danach. Diese Elemente sollten enthalten sein:
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {WAS_REIN.map((t) => (
              <li key={t} className="flex items-start gap-2 text-[0.95rem] text-claimondo-navy">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-claimondo-ondo" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* HowTo-Schritte */}
        <section className="mt-10">
          <h2 style={HEAD_FONT} className="text-[1.375rem] font-extrabold text-claimondo-navy">
            Schritt für Schritt zur Unfallskizze
          </h2>
          <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 marker:font-bold marker:text-claimondo-ondo">
            {SCHRITTE.map((s) => (
              <li key={s.name} className="pl-1">
                <span className="font-bold text-claimondo-navy">{s.name}: </span>
                <span className="text-[0.95rem] leading-relaxed text-claimondo-shield">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* 8 Tipps */}
        <section className="mt-10 rounded-ios-md border border-claimondo-border bg-white p-6">
          <h2 style={HEAD_FONT} className="text-[1.0625rem] font-extrabold text-claimondo-navy">
            8 Tipps für eine beweissichere Skizze
          </h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {TIPPS.map((t, i) => (
              <li key={t} className="flex items-start gap-2.5 text-[0.92rem] leading-relaxed text-claimondo-shield">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-claimondo-ondo/15 text-[0.75rem] font-bold text-claimondo-ondo">{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Download-CTA */}
        <section className="mt-10 flex flex-col items-start gap-4 rounded-ios-lg border border-claimondo-ondo/20 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <h2 style={HEAD_FONT} className="text-[1.125rem] font-extrabold text-claimondo-navy">
              Vorlage als PDF zum Ausdrucken
            </h2>
            <p className="mt-1 max-w-prose text-[0.95rem] leading-relaxed text-claimondo-shield">
              Eine Seite, alle Felder plus großes Skizzenfeld — ausdrucken und ins Handschuhfach legen.
            </p>
          </div>
          <a href={PDF_HREF} download className="inline-flex shrink-0 items-center gap-2 rounded-full bg-claimondo-navy px-7 py-3.5 font-extrabold text-white transition hover:bg-claimondo-ondo">
            <Download className="h-4 w-4" aria-hidden />
            Vorlage herunterladen
          </a>
        </section>

        <ConversionAnchorBlock variant="cornerstone" />
        <SpokeCtaBand headline="Unverschuldet verunglückt? Wir regulieren deinen Schaden — 0 €." />
      </main>
      <LandingFooter />
      <StickyCallBar quelle="Konversion: Unfallskizze" whatsappHref={WA} />
    </div>
  )
}
