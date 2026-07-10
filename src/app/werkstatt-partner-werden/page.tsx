import type { Metadata } from 'next'
import { WerkstattPartnerWerdenClient } from './WerkstattPartnerWerdenClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Werkstatt-Partner werden | Claimondo',
  description:
    'Werden Sie Claimondo-Werkstattpartner und erhalten Sie Reparaturaufträge aus Kfz-Unfallschäden. ' +
    'Gutachten und Abrechnung koordinieren wir — Sie reparieren. Unverbindlich eintragen.',
}

const VORTEILE: { titel: string; text: string }[] = [
  {
    titel: 'Reparaturaufträge aus Unfallschäden',
    text: 'Claimondo begleitet Geschädigte durch die Schadensabwicklung — als Partnerwerkstatt erhalten Sie qualifizierte Reparaturaufträge in Ihrer Region.',
  },
  {
    titel: 'Gutachten & Abrechnung inklusive',
    text: 'Wir koordinieren den Kfz-Sachverständigen und rechnen mit der gegnerischen Haftpflichtversicherung ab. Sie konzentrieren sich auf die Reparatur.',
  },
  {
    titel: 'Zahlungssicherheit',
    text: 'Regulierung über die eintrittspflichtige Versicherung — keine offenen Kundenforderungen, planbare Auslastung.',
  },
  {
    titel: 'Persönlicher Ansprechpartner',
    text: 'Kein Ticketsystem, kein Callcenter. Sie erreichen direkt das Claimondo-Team — schnell und unkompliziert.',
  },
]

const SCHRITTE: { nr: string; titel: string; text: string }[] = [
  {
    nr: '1',
    titel: 'Interesse eintragen',
    text: 'Formular unten ausfüllen — unverbindlich und in unter einer Minute.',
  },
  {
    nr: '2',
    titel: 'Partner-Team meldet sich',
    text: 'Wir prüfen kurz die Eckdaten und richten gemeinsam Ihren Werkstatt-Zugang ein.',
  },
  {
    nr: '3',
    titel: 'Aufträge erhalten',
    text: 'Sie bekommen passende Reparaturaufträge aus Unfallschäden in Ihrer Region — Gutachten und Abrechnung übernehmen wir.',
  },
]

export default function WerkstattPartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Hero */}
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Werkstatt-Partnerprogramm
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Werkstatt-Partner werden
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">
            Reparaturaufträge aus Kfz-Unfallschäden — Gutachten und Abrechnung koordinieren wir,
            Sie reparieren. Tragen Sie unverbindlich Ihr Interesse ein.
          </p>
        </div>

        {/* Vorteile */}
        <div className="mb-10 grid gap-3 sm:grid-cols-2">
          {VORTEILE.map((v) => (
            <div
              key={v.titel}
              className="rounded-ios-lg border border-claimondo-border bg-white p-4"
            >
              <h2 className="text-sm font-semibold text-claimondo-navy">{v.titel}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-claimondo-shield">{v.text}</p>
            </div>
          ))}
        </div>

        {/* So werden Sie Partner */}
        <div className="mb-10">
          <h2 className="mb-4 text-center text-lg font-semibold text-claimondo-navy">
            So werden Sie Partner
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {SCHRITTE.map((s) => (
              <li
                key={s.nr}
                className="rounded-ios-lg border border-claimondo-border bg-white p-4"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">
                  {s.nr}
                </span>
                <h3 className="mt-2.5 text-sm font-semibold text-claimondo-navy">{s.titel}</h3>
                <p className="mt-1 text-xs leading-relaxed text-claimondo-shield">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Formular */}
        <div id="formular" className="scroll-mt-8">
          <h2 className="mb-1 text-center text-lg font-semibold text-claimondo-navy">
            Jetzt unverbindlich eintragen
          </h2>
          <p className="mb-5 text-center text-xs text-claimondo-shield">
            Kostenlos und unverbindlich — das Partner-Team meldet sich bei Ihnen.
          </p>
          <WerkstattPartnerWerdenClient />
        </div>
      </div>
    </div>
  )
}
