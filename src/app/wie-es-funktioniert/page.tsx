import type { Metadata } from 'next'
import Link from 'next/link'
import { Camera, Brain, UserCheck, FileText, ChevronRight, Clock, Shield, Star, Phone } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'

export const metadata: Metadata = {
  title: 'Wie es funktioniert — Claimondo',
  description: 'In 3 einfachen Schritten zum vollen Schadensersatz. Schaden melden, KI-Einschätzung erhalten, Gutachter vor Ort — kostenlos für Sie.',
}

const SCHRITTE = [
  {
    nr: '01',
    icon: Camera,
    farbe: 'text-[#4573A2]',
    bg: 'bg-[#4573A2]/10',
    border: 'border-[#4573A2]/20',
    title: 'Schaden erfassen',
    subtitle: '5 Minuten · Keine Anmeldung nötig',
    text: 'Beschreiben Sie kurz den Unfallhergang und laden Sie Fotos hoch — oder diktieren Sie uns den Schaden per Sprache. Wir brauchen keinen Papierkram, keine Formulare, kein Fax.',
    details: [
      'Fotos vom Schaden hochladen',
      'Unfallhergang in Textform oder Sprache',
      'Fahrzeugdaten (optional, erleichtert die Einschätzung)',
      'Kontaktdaten für Rückfragen',
    ],
  },
  {
    nr: '02',
    icon: Brain,
    farbe: 'text-[#1E3A5F]',
    bg: 'bg-[#1E3A5F]/10',
    border: 'border-[#1E3A5F]/20',
    title: 'KI-Ersteinschätzung',
    subtitle: 'Sofort · Kostenlos · Unverbindlich',
    text: 'Unsere KI analysiert Fotos und Beschreibung und liefert in Sekunden eine erste Einschätzung: Reparaturkosten, Wiederbeschaffungswert und ob sich ein Gutachten lohnt.',
    details: [
      'Geschätzte Reparaturkosten',
      'Wiederbeschaffungswert des Fahrzeugs',
      'Empfehlung: Gutachten oder Kostenvoranschlag',
      'Einschätzung der Regulierungschancen',
    ],
  },
  {
    nr: '03',
    icon: UserCheck,
    farbe: 'text-[#0D1B3E]',
    bg: 'bg-[#0D1B3E]/10',
    border: 'border-[#0D1B3E]/20',
    title: 'Gutachter & Anwalt',
    subtitle: '48h Bericht · 0 € für Sie',
    text: 'Ein unabhängiger Gutachter aus Ihrem Umkreis kommt zu Ihnen. Der Bericht liegt in 48 Stunden vor. Unsere Partnerkanzlei reguliert danach Ihren vollen Anspruch gegenüber der gegnerischen Versicherung.',
    details: [
      'Terminvereinbarung am selben oder nächsten Tag',
      'Gutachter kommt zu Ihnen — kein Werkstattbesuch nötig',
      'Bericht innerhalb von 48 Stunden',
      'Anwalt übernimmt vollständige Regulierung',
    ],
  },
]

const FAKTEN = [
  { icon: Clock, label: 'Ø Regulierungsdauer', wert: '6–8 Wochen' },
  { icon: Shield, label: 'Kostenübernahme', wert: '100 % durch Gegner' },
  { icon: Star, label: 'Kundenzufriedenheit', wert: '4,8 / 5,0' },
  { icon: FileText, label: 'Erfolgreiche Regulierungen', wert: '2.400+' },
]

export default function WieEsFunktioniertPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <LandingTopbar authenticatedUser={null} />

      {/* Header */}
      <section className="bg-gradient-to-b from-white to-[#f8f9fb] py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#4573A2]/20 bg-[#4573A2]/5 px-4 py-1.5 text-sm font-semibold text-[#4573A2]">
            So einfach geht&apos;s
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#0D1B3E] sm:text-5xl">
            Ihr Unfall. Unser Problem.
          </h1>
          <p className="mt-4 text-lg text-[#4573A2]">
            In 3 Schritten zum vollen Schadensersatz — wir übernehmen alles.
          </p>
        </div>
      </section>

      {/* Fakten-Strip */}
      <div className="border-y border-[#e4e7ef] bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-[#e4e7ef] md:grid-cols-4">
          {FAKTEN.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.label} className="flex flex-col items-center py-6 text-center">
                <Icon className="mb-2 h-5 w-5 text-[#4573A2]" />
                <div className="text-xl font-extrabold text-[#0D1B3E]">{f.wert}</div>
                <div className="mt-0.5 text-xs text-[#4573A2]">{f.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Schritte */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl space-y-12 px-4 sm:px-6">
          {SCHRITTE.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={s.nr}
                className={`flex flex-col gap-8 rounded-3xl border border-[#e4e7ef] bg-white p-8 shadow-sm md:flex-row md:items-start ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className="flex-shrink-0">
                  <div className={`flex h-20 w-20 items-center justify-center rounded-3xl border ${s.border} ${s.bg}`}>
                    <Icon className={`h-10 w-10 ${s.farbe}`} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-black text-[#e4e7ef]">{s.nr}</span>
                    <div>
                      <h2 className="text-2xl font-extrabold text-[#0D1B3E]">{s.title}</h2>
                      <div className="mt-0.5 text-sm font-semibold text-[#4573A2]">{s.subtitle}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-base leading-relaxed text-[#1E3A5F]">{s.text}</p>
                  <ul className="mt-6 space-y-2">
                    {s.details.map((d) => (
                      <li key={d} className="flex items-center gap-2 text-sm text-[#4573A2]">
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#4573A2]" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0D1B3E] py-20 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Bereit? Schaden jetzt melden.
          </h2>
          <p className="mt-3 text-lg text-white/60">
            Kostenlos, unverbindlich, in 5 Minuten erledigt.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4573A2] px-8 py-4 text-base font-bold text-white shadow-xl transition-all hover:bg-[#7BA3CC]"
            >
              Schaden melden
              <ChevronRight className="h-5 w-5" />
            </Link>
            <a
              href="tel:+4922112345678"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-8 py-4 text-base font-semibold text-white/80 hover:border-white/40 hover:text-white"
            >
              <Phone className="h-4 w-4" />
              0221 123 456 78
            </a>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
