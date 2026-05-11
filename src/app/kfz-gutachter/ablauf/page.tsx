import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Camera, FileSearch, FileSignature, CreditCard } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  serviceSchema, breadcrumbsSchema, faqPageSchema, howToSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Ablauf Kfz-Schadensregulierung — Schritt für Schritt erklärt',
  description:
    'Wie läuft eine Kfz-Schadensregulierung ab? Vom Unfall über Gutachten und Anwalt bis zur Auszahlung — jeder Schritt mit Zeitfenster und Beteiligten. Durchschnittliche Dauer 6–8 Wochen.',
  keywords: [
    'Ablauf Kfz-Schadensregulierung',
    'Wie läuft Schadensregulierung',
    'Schadensregulierung Schritte',
    'Kfz-Schaden Reihenfolge',
    'Wann zahlt Versicherung',
    'Dauer Schadensregulierung',
  ],
  alternates: { canonical: '/kfz-gutachter/ablauf' },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}/kfz-gutachter/ablauf`,
    title: 'Ablauf Kfz-Schadensregulierung — Schritt für Schritt',
    description: 'Vom Unfall bis zur Auszahlung in 6–8 Wochen — alle Schritte erklärt.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Ablauf Schadensregulierung' }],
  },
}

const SCHRITTE = [
  {
    nr: '01',
    titel: 'Unfall sichern',
    dauer: 'Vor Ort, Minuten',
    icon: Camera,
    text: 'Polizei rufen falls Personenschaden, Fahrerflucht oder unklare Schuld. Fotos: Schaden, Kennzeichen, Position, Umfeld. Daten austauschen mit Gegenseite. Nicht der gegnerischen Versicherung "ja" sagen.',
  },
  {
    nr: '02',
    titel: 'Bei Claimondo melden',
    dauer: '5 Min, Antwort <15 Min',
    icon: FileSearch,
    text: 'Online-Formular ausfüllen oder anrufen. Wir prüfen sofort: Bagatelle oder vollständiges Gutachten? Schuldfrage klar? Welcher Gutachter ist verfügbar? Welcher Anwalt passt? Danach koordinieren wir alles weitere.',
  },
  {
    nr: '03',
    titel: 'Gutachten + Anwalt',
    dauer: 'Termin <48 h, Bericht 48 h später',
    icon: FileSignature,
    text: 'DAT-Sachverständiger besichtigt das Fahrzeug — bei Ihnen, in der Werkstatt oder am Arbeitsplatz. Bericht inkl. Reparaturkosten, Wertminderung, Restwert (bei Totalschaden) und Wiederbeschaffungswert. Anwalt fordert anschließend von der gegnerischen Versicherung.',
  },
  {
    nr: '04',
    titel: 'Auszahlung',
    dauer: 'Ø 6–8 Wochen ab Gutachten',
    icon: CreditCard,
    text: 'Die gegnerische Versicherung überweist innerhalb von 4–8 Wochen. Bei Verzögerung oder Kürzung schreibt der Anwalt nach. Bei Streit: Klage. Auch Klage-Kosten trägt bei Erfolg die Gegenseite. Sie zahlen 0 €.',
  },
]

const FAQS = [
  {
    frage: 'Wie lange dauert eine komplette Kfz-Schadensregulierung?',
    antwort:
      'Im Durchschnitt 6–8 Wochen vom Unfall bis zur vollständigen Auszahlung. Aufschlüsselung: Tag 0 = Unfall, Tag 1–2 = Gutachter-Termin, Tag 3–5 = Bericht, Tag 5–10 = Forderungsschreiben Anwalt, Tag 30–60 = Auszahlung. Bei Klage zusätzlich 6–18 Monate. In komplexen Fällen (Personenschaden, Streit, Tesla) auch länger.',
  },
  {
    frage: 'Was ist der erste Schritt nach einem Unfall?',
    antwort:
      'Sicherheit zuerst: Warndreieck, Warnblinker, ggf. Polizei. Dann Beweise sichern: Fotos vom Schaden, Position, Kennzeichen, Verkehrslage. Daten der Gegenseite aufschreiben (Name, Adresse, Versicherung, Kennzeichen, Fahrer). NICHT der gegnerischen Versicherung am Telefon "ja" sagen — das ist die Schadensteuerung-Falle. Stattdessen: bei Claimondo melden.',
  },
  {
    frage: 'Wie wird der Gutachter-Termin organisiert?',
    antwort:
      'Wir koordinieren das. Sie geben Standort und Erreichbarkeit an, wir matchen mit dem nächstgelegenen freien Sachverständigen. Termin in unter 48 h. Der SV kommt zu Ihnen — Wohnort, Arbeitsplatz oder Werkstatt. Falls das Fahrzeug nicht fahrbereit ist, organisieren wir Abschleppung (auch von der Versicherung erstattet).',
  },
  {
    frage: 'Was passiert wenn die Versicherung das Gutachten kürzt?',
    antwort:
      'Häufig kürzt die Versicherung Wertminderung, UPE-Aufschläge, Verbringungskosten oder Sachverständigenhonorar. Unser Anwalt schreibt zurück mit den passenden BGH-Urteilen (VI ZR 65/18, VI ZR 174/24). Kürzt sie weiter, klagen wir. Klage-Kosten trägt die Gegenseite bei Erfolg vollständig.',
  },
  {
    frage: 'Wann bekomme ich einen Mietwagen oder Nutzungsausfall?',
    antwort:
      'Mietwagen ab dem ersten Tag der Reparatur — gleichwertige Klasse oder klassentiefer mit Eigenanteil-Erstattung. Alternativ: Nutzungsausfall-Pauschale nach Sanden/Danner-Tabelle (23–175 €/Tag je nach Fahrzeugklasse). Bei Pendlern fast immer Mietwagen sinnvoller. Wir beraten zur konkreten Situation.',
  },
]

export default function AblaufPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Schadensregulierung Ablauf',
            description:
              'Schritt-für-Schritt-Ablauf einer Kfz-Schadensregulierung: Unfall → Meldung → Gutachten → Anwalt → Auszahlung. Durchschnittliche Dauer 6–8 Wochen.',
            url: `${SITE_URL}/kfz-gutachter/ablauf`,
          }),
          howToSchema({
            name: 'Kfz-Schaden in 4 Schritten regulieren',
            description: 'Vom Unfall bis zur Auszahlung — der vollständige Ablauf.',
            totalTime: 'P56D',
            estimatedCost: { currency: 'EUR', value: '0' },
            schritte: SCHRITTE.map((s) => ({
              name: s.titel,
              text: s.text,
            })),
          }),
          faqPageSchema(FAQS),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Ablauf', url: '/kfz-gutachter/ablauf' },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-claimondo-light-blue">
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Ablauf</span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Ablauf der Kfz-Schadensregulierung
          </h1>
          <p className="mt-3 text-lg text-claimondo-light-blue">
            Schritt für Schritt — vom Unfall bis zur vollständigen Auszahlung in <strong className="text-white">6–8 Wochen</strong>
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="Durchschnitt aus 2.400+ Fällen">
            <strong>Eine vollständige Kfz-Schadensregulierung dauert typisch 6–8 Wochen.</strong>
            Tag 0 = Unfall. Tag 1–2 = Gutachter-Termin. Tag 5 = schriftlicher Bericht.
            Woche 2 = Anwalts-Forderungsschreiben. Woche 6–8 = Auszahlung. Bei
            Klage-Verfahren verlängert sich der Prozess um 6–18 Monate, die Auszahlung
            wird aber durch Vorschuss-Zahlung der Versicherung oft beschleunigt.
          </AnswerCapsule>
        </div>
      </section>

      {/* 4 Schritte */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-5xl space-y-8 px-5 sm:px-8">
          {SCHRITTE.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={s.nr}
                className={`flex flex-col gap-6 rounded-3xl border border-claimondo-border bg-claimondo-bg p-6 shadow-sm md:flex-row md:items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="flex-shrink-0">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-claimondo-ondo/10">
                    <Icon className="h-8 w-8 text-claimondo-ondo" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-black text-claimondo-border">{s.nr}</span>
                    <div>
                      <h2 className="text-xl font-extrabold text-claimondo-navy">{s.titel}</h2>
                      <div className="mt-0.5 text-xs font-semibold text-claimondo-ondo">{s.dauer}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{s.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Häufige Fragen zum Ablauf</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.frage} className="group rounded-2xl border border-claimondo-border bg-white p-5">
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

      {/* Cross-Links */}
      <section className="bg-claimondo-bg py-12">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-lg font-bold text-claimondo-navy">Mehr zum Thema</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/kfz-gutachter/kosten" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Was kostet ein Gutachter?
            </Link>
            <Link href="/kfz-gutachter/wertminderung" className="rounded-full border border-claimondo-border bg-white px-4 py-1.5 text-xs font-semibold text-claimondo-ondo hover:border-claimondo-ondo hover:text-claimondo-navy">
              Wertminderung berechnen
            </Link>
            <Link href="/kfz-gutachter" className="rounded-full border border-claimondo-ondo bg-claimondo-ondo px-4 py-1.5 text-xs font-semibold text-white hover:bg-claimondo-shield">
              Gutachter finden →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-claimondo-navy py-16 text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Schaden gerade passiert?</h2>
          <p className="mt-4 text-white/70">In 5 Minuten gemeldet — Antwort unter 15 Minuten.</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/schaden-melden" className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-bold text-claimondo-navy hover:bg-claimondo-light-blue/90">
              Jetzt Schaden melden
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a href="tel:+4922125906530" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/85 hover:border-white/40 hover:text-white">
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyCallBar quelle="Kfz-Gutachter Ablauf" />
    </div>
  )
}
