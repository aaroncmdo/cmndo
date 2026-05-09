'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'

const FAQ_GRUPPEN = [
  {
    gruppe: 'Kosten & wer zahlt was',
    fragen: [
      {
        frage: 'Was kostet Claimondo — wirklich?',
        antwort:
          'Für Sie als unverschuldet Betroffenen: 0 €. Gutachterhonorar, Anwaltskosten, Abschleppkosten — alles trägt die gegnerische Haftpflichtversicherung. Das ist gesetzlich verankert (§249 BGB). Claimondo finanziert sich ausschließlich aus diesen Positionen.',
      },
      {
        frage: 'Was verliere ich, wenn ich einfach "Geld nehme" ohne Gutachter?',
        antwort:
          'Im Schnitt 33 % Ihres Anspruchs. Ein reales Beispiel aus der Praxis: Gutachtenwert 11.900 € → nach Versicherer-Kürzungen bleiben nur 8.000 € übrig. Verloren gehen: Mehrwertsteuer (§249 Abs. 2 BGB), UPE-Aufschläge, Verbringungskosten, Beilackierung — und häufig die komplette Wertminderung. Dazu das HIS-Risiko: Wer ohne Reparaturrechnung kassiert und später wieder einen Schaden hat, riskiert die vollständige Ablehnung durch den Versicherer.',
      },
      {
        frage: 'Muss ich in Vorleistung gehen?',
        antwort:
          'Nein. Weder für das Gutachten noch für den Anwalt. Beides läuft direkt über die Gegenseite. Sie müssen nichts auslegen.',
      },
      {
        frage: 'Was, wenn die Versicherung die Kosten ablehnt?',
        antwort:
          'Unsere Partnerkanzlei schreibt zurück — mit den passenden BGH-Urteilen. Kürzt die Versicherung trotzdem, geht der Anwalt notfalls gerichtlich vor. Auch die Prozesskosten trägt bei Erfolg die Gegenseite. Bei tatsächlicher Mitschuld informieren wir Sie vorab und ehrlich.',
      },
    ],
  },
  {
    gruppe: 'Warum kürzt die Versicherung?',
    fragen: [
      {
        frage: 'Warum zahlt die Versicherung nie den vollen Gutachtenbetrag?',
        antwort:
          'Weil sie es kann — solange niemand widerspricht. Versicherer beauftragen ControlExpert, K-Expert oder DEKRA mit automatisierten Prüfberichten, die ohne Fahrzeugbesichtigung Positionen streichen. NDR-Reportage: Versicherungs-Gutachter 2.000 € → unabhängiges Gutachten nach Demontage: 9.000 €. BGH-Urteile stehen dagegen (VI ZR 65/18, VI ZR 174/24) — aber nur wer widerspricht, bekommt sein Recht.',
      },
      {
        frage: 'Was streichen Versicherungen am häufigsten?',
        antwort:
          '1. Stundenverrechnungssätze (Verweis auf billigere Werkstatt), 2. UPE-Aufschläge (trotz BGH VI ZR 65/18 erstattungsfähig), 3. Verbringungskosten (trotz BGH-Recht), 4. Beilackierungskosten (BGH VI ZR 174/24 aus 2025 gilt), 5. Sachverständigenkosten ("überhöht"), 6. Wertminderung (wird oft komplett ignoriert). Unser Anwalt kennt alle diese Positionen und fordert sie zurück.',
      },
      {
        frage: 'HUK, LVM, AXA — macht das einen Unterschied?',
        antwort:
          'Ja. HUK-COBURG erklärt Gutachten systematisch als "unbrauchbar" und verweigert SV-Kosten. LVM geht gegen KI-gestützte Gutachten vor. AXA nutzt überregionale Restwertbörsen um den Restwert hochzurechnen (dagegen: BGH VI ZR 119/04 — regionaler Markt gilt). Unser Anwalt kennt die versicherungsspezifischen Taktiken und reagiert entsprechend.',
      },
    ],
  },
  {
    gruppe: 'Gutachter & Werkstatt',
    fragen: [
      {
        frage: 'Warum brauche ich einen unabhängigen Gutachter?',
        antwort:
          'Ein Versicherungs-Gutachter arbeitet für die Versicherung. Ein Beispiel: Opel Karl, von außen nur Kratzer sichtbar — nach Demontage: Rahmenlängsträger verschoben, Totalschaden. 7.000 € wären ohne unabhängiges Gutachten einfach verloren gegangen. Nur ein unabhängiger Gutachter berechnet auch Wertminderung — eine Werkstatt macht das nicht.',
      },
      {
        frage: 'Ich habe ein Tesla oder E-Auto. Gibt es Besonderheiten?',
        antwort:
          'Ja — und die sind erheblich. Standardprogramme (DAT/Audatex) enthalten oft keine korrekten Verbundzeiten für US-Fahrzeuge. Reales Beispiel: Deutsches Standard-Gutachten 22.000 € → mit Tesla-Originaldaten: 48.000 €. Steuergeräte unter Schwellerblenden werden oft erst Monate später zum Problem. Bei Tesla und E-Autos: immer Spezialgutachter.',
      },
      {
        frage: 'Was ist die 130%-Regel?',
        antwort:
          'Wenn die Reparaturkosten den Wiederbeschaffungswert um maximal 30% überschreiten, können Sie Ihr Fahrzeug trotzdem reparieren lassen. Beispiel: WBW 10.000 € → Reparatur bis 13.000 € möglich. Bedingung: fachgerechte Reparatur nach Gutachten, Fahrzeug 6 Monate weiter genutzt. BGH VI ZR 67/91.',
      },
      {
        frage: 'Was ist das Werkstattrisiko und was bringt es mir?',
        antwort:
          'BGH-Urteile vom 16.01.2024 (VI ZR 38/22 u.a.): Wenn Ihre Werkstatt teurer wird als kalkuliert oder Arbeiten nicht ordnungsgemäß ausführt, trägt die gegnerische Versicherung das Risiko — nicht Sie. Sie müssen Reparaturkosten nicht selbst prüfen. Ein weiterer Grund, warum ein unabhängiges Gutachten und ein Anwalt schützen.',
      },
    ],
  },
  {
    gruppe: 'Wertminderung & Nutzungsausfall',
    fragen: [
      {
        frage: 'Was ist Wertminderung und bekomme ich die immer?',
        antwort:
          'Auch nach perfekter Reparatur sinkt der Marktwert eines Unfallfahrzeugs — und diese Differenz muss die Gegenseite zahlen. Faustregel: 1. Jahr = 25% der Reparaturkosten, 2. Jahr = 20%, 3. Jahr = 15%, 4. Jahr = 10%. Keine starre Altersgrenze (BGH VI ZR 357/03) — OLG Oldenburg anerkannte Wertminderung sogar bei 200.000 km. Nur ein Gutachter berechnet sie, eine Werkstatt nicht.',
      },
      {
        frage: 'Mietwagen oder Nutzungsausfall — was ist besser für mich?',
        antwort:
          'Hängt von Ihrer Situation ab. Pendler, die täglich auf das Auto angewiesen sind: Mietwagen. Zweitwagen vorhanden oder unklare Schuldfrage: Nutzungsausfall (Sanden/Danner-Tabelle, Gruppe A bis L, ~23 € bis 175 € pro Tag). Bei langer Reparaturdauer ist Nutzungsausfall oft günstiger. Wir beraten Sie dazu konkret.',
      },
    ],
  },
  {
    gruppe: 'Typische Fehler nach dem Unfall',
    fragen: [
      {
        frage: 'Was sind die häufigsten Fehler nach einem Unfall?',
        antwort:
          '1. Sich auf das "Schadenmanagement" der gegnerischen Versicherung einlassen. 2. Deren Gutachter akzeptieren. 3. Voreilig Abfindungserklärungen unterschreiben — damit erlöschen ALLE zukünftigen Ansprüche (auch Spätfolgen). 4. Sich auf "Da ist nichts dran" verlassen (Polizisten sind keine Techniker). 5. Ohne Gutachten reparieren — Wertminderung verloren. 6. Videobeweise nicht sichern — Überschreibungsfrist liegt oft bei 3–4 Wochen.',
      },
      {
        frage: 'Die Versicherung sagt mir: "Wir kümmern uns um alles." Was bedeutet das?',
        antwort:
          'Schadensteuerung. Die Versicherung schickt Ihnen ihren Gutachter, verweist auf eine Partnerwerkstatt und spart damit erheblich. Ihre Antwort: "Vielen Dank, aber ich nehme meinen Recht auf einen unabhängigen Sachverständigen und Fachanwalt meiner Wahl wahr." Genau dafür ist Claimondo da.',
      },
      {
        frage: 'Ich habe Personenschäden. Was ist zu beachten?',
        antwort:
          'Sofort zum Arzt — auch wenn Sie sich "eigentlich gut fühlen". HWS-Verletzungen zeigen sich oft verzögert. MdE (Minderung der Erwerbsfähigkeit) dokumentieren lassen. Unterschreiben Sie keine Abfindungserklärung — damit erlöschen alle Ansprüche auf Spätfolgen. Schmerzensgeld: HWS-Verletzung 200 – 70.000 €, Armfrakturen 1.600 – 65.000 €.',
      },
      {
        frage: 'Was bei Fahrerflucht?',
        antwort:
          'Die Verkehrsopferhilfe e.V. (VOH) springt ein — aber KFZ-Sachschäden werden leider NICHT ersetzt, dafür brauchen Sie eine Vollkasko. Schmerzensgeld gibt es nur bei "besonders schwerer Verletzung". Verjährungsfrist: 3 Jahre. Wichtig: Videobeweise von Tankstellen, Parkplätzen etc. sofort sichern, Dashcam-Material aufheben.',
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
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
      >
        <span className="font-semibold text-[#0D1B3E]">{frage}</span>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 flex-shrink-0 text-[#4573A2] transition-transform ${offen ? 'rotate-180' : ''}`}
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
            Was Sie wissen müssen
          </h1>
          <p className="mt-4 text-lg text-[#4573A2]">
            Basierend auf 27 Fachanwalt-Quellen, BGH-Rechtsprechung und über 2.400 Fällen.
          </p>
        </div>
      </section>

      {/* Warn-Banner */}
      <div className="border-y border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-3xl items-start gap-3 px-4 py-4 sm:px-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            <strong>Wichtig:</strong> Ohne professionelle Hilfe verlieren Unfallbeteiligte im Schnitt{' '}
            <strong>33% ihres Anspruchs</strong>. Die Versicherung kürzt systematisch — in der Hoffnung,
            dass Sie nicht widersprechen.
          </p>
        </div>
      </div>

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
          <p className="mt-3 text-white/60">Wir beraten Sie kostenlos und unverbindlich — ohne Callcenter, direkt mit einem Fachmann.</p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-8 py-4 text-base font-bold text-white shadow-xl hover:bg-[#7BA3CC]"
            >
              Schaden melden — 0 € Kosten
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
