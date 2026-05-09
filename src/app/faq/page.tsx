'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'

const FAQ_GRUPPEN = [
  {
    gruppe: 'Kosten & Bezahlung',
    fragen: [
      {
        frage: 'Was kostet Claimondo?',
        antwort:
          'Für Sie als unverschuldeten Unfallbeteiligten entstehen keine Kosten. Gutachterhonorar, Anwaltskosten und alle weiteren Ausgaben trägt die gegnerische Versicherung. Claimondo finanziert sich durch die gesetzlich vorgesehene Kostentragungspflicht des Unfallverursachers.',
      },
      {
        frage: 'Was, wenn die Versicherung die Kosten ablehnt?',
        antwort:
          'Unsere Partnerkanzlei kämpft für Ihren vollständigen Anspruch — notfalls auch gerichtlich. Die Anwaltskosten dafür trägt ebenfalls die Gegenseite, sofern Sie im Recht sind. Bei tatsächlicher Mitschuld informieren wir Sie vorab.',
      },
      {
        frage: 'Muss ich in Vorleistung gehen?',
        antwort:
          'Nein. Weder für das Gutachten noch für den Anwalt müssen Sie zunächst bezahlen. Alles läuft direkt über die Abrechnung mit der gegnerischen Versicherung.',
      },
    ],
  },
  {
    gruppe: 'Der Ablauf',
    fragen: [
      {
        frage: 'Wie schnell kommt ein Gutachter zu mir?',
        antwort:
          'In der Regel am selben oder nächsten Werktag. Unser Dispatch-Team terminiert automatisch den nächstverfügbaren Gutachter in Ihrer Region.',
      },
      {
        frage: 'Wie lange dauert die Regulierung?',
        antwort:
          'Die durchschnittliche Regulierungsdauer beträgt 6–8 Wochen. Der Gutachterbericht liegt in 48 Stunden vor. Danach beginnt unsere Kanzlei mit der Regulierung gegenüber der Versicherung.',
      },
      {
        frage: 'Was brauche ich für die Schadenmeldung?',
        antwort:
          'Fotos vom Schaden, eine kurze Beschreibung des Unfallhergangs und Ihre Kontaktdaten. Alles andere — Fahrzeugdaten, Polizeibericht, Versicherungsinfos — können Sie auch nachreichen.',
      },
      {
        frage: 'Muss ich zur Werkstatt?',
        antwort:
          'Nein. Der Gutachter kommt zu Ihnen — an Ihren Wohn- oder Arbeitsort. Sie müssen Ihr Fahrzeug nirgendwo hinfahren.',
      },
    ],
  },
  {
    gruppe: 'Voraussetzungen',
    fragen: [
      {
        frage: 'Wann kann ich Claimondo nutzen?',
        antwort:
          'Claimondo ist für unverschuldete Kfz-Unfälle. Der Unfallgegner muss eine Kfz-Haftpflicht haben (Pflicht in Deutschland). Bei Teilschuld sprechen wir das individuell ab.',
      },
      {
        frage: 'Ich hatte einen Wildunfall / Parkschaden. Kann Claimondo helfen?',
        antwort:
          'Bei Wildunfällen und Parkschäden greift die eigene Teilkasko oder Vollkasko — kein Verursacher-Haftpflicht-Fall. Wir können Sie beraten, aber die Erstattung läuft über Ihre eigene Versicherung.',
      },
      {
        frage: 'Mein Schaden liegt lange zurück. Ist es zu spät?',
        antwort:
          'Die Verjährungsfrist für Unfallschäden beträgt in der Regel 3 Jahre. Sprechen Sie uns an — wir prüfen kostenlos ob noch Ansprüche geltend gemacht werden können.',
      },
    ],
  },
  {
    gruppe: 'Datenschutz & Vertrauen',
    fragen: [
      {
        frage: 'Was passiert mit meinen Daten?',
        antwort:
          'Ihre Daten werden ausschließlich zur Schadensbearbeitung verwendet und nicht an Dritte verkauft. Wir arbeiten DSGVO-konform. Details finden Sie in unserer Datenschutzerklärung.',
      },
      {
        frage: 'Wie unabhängig sind die Gutachter wirklich?',
        antwort:
          'Unsere Gutachter sind selbstständige Sachverständige, die keiner Versicherung gehören und keiner verpflichtet sind. Sie sind ausschließlich Ihrem Auftrag und dem Ergebnis verpflichtet.',
      },
    ],
  },
]

function FaqItem({ frage, antwort }: { frage: string; antwort: string }) {
  const [offen, setOffen] = useState(false)
  return (
    <div className="border-b border-[#e4e7ef] last:border-0">
      <button
        onClick={() => setOffen(!offen)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-semibold text-[#0D1B3E]">{frage}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-[#4573A2] transition-transform ${offen ? 'rotate-180' : ''}`}
        />
      </button>
      {offen && (
        <div className="pb-5 text-sm leading-relaxed text-[#1E3A5F]">{antwort}</div>
      )}
    </div>
  )
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <LandingTopbar authenticatedUser={null} />

      <section className="bg-gradient-to-b from-white to-[#f8f9fb] py-16 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/20 bg-[#4573A2]/5 px-4 py-1.5 text-sm font-semibold text-[#4573A2]">
            Häufige Fragen
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#0D1B3E] sm:text-5xl">
            Alle Antworten auf einen Blick
          </h1>
          <p className="mt-4 text-lg text-[#4573A2]">
            Noch Fragen? Rufen Sie uns an — wir helfen sofort.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6">
          {FAQ_GRUPPEN.map((g) => (
            <div key={g.gruppe} className="rounded-3xl border border-[#e4e7ef] bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-extrabold text-[#0D1B3E]">{g.gruppe}</h2>
              <div>
                {g.fragen.map((f) => (
                  <FaqItem key={f.frage} frage={f.frage} antwort={f.antwort} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#0D1B3E] py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-extrabold text-white">Noch offen geblieben?</h2>
          <p className="mt-3 text-white/60">Wir beraten Sie kostenlos und unverbindlich.</p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-[#7BA3CC]"
            >
              Schaden melden
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922112345678"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/80 hover:border-white/40 hover:text-white"
            >
              0221 123 456 78 anrufen
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
