import type { Metadata } from 'next'
import { WerkstattPartnerWerdenClient } from './WerkstattPartnerWerdenClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Werkstatt-Partner werden | Claimondo',
  description:
    'Werden Sie Claimondo-Werkstattpartner und erhalten Sie Reparaturaufträge aus Kfz-Unfallschäden. ' +
    'Tragen Sie unverbindlich Ihr Interesse ein — unser Partner-Team meldet sich bei Ihnen.',
}

const VORTEILE: { titel: string; text: string }[] = [
  {
    titel: 'Reparaturaufträge aus Unfallschäden',
    text: 'Claimondo begleitet Geschädigte durch die Schadensabwicklung — als Partnerwerkstatt erhalten Sie qualifizierte Reparaturaufträge in Ihrer Region.',
  },
  {
    titel: 'Direkte Regulierung',
    text: 'Wir koordinieren Gutachter und rechnen mit der gegnerischen Haftpflichtversicherung ab. Sie konzentrieren sich auf die Reparatur.',
  },
  {
    titel: 'Persönlicher Ansprechpartner',
    text: 'Kein Ticketsystem, kein Callcenter. Sie erreichen direkt das Claimondo-Team — schnell und unkompliziert.',
  },
]

export default function WerkstattPartnerWerdenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
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
          <p className="mt-3 text-sm text-claimondo-shield">
            Reparaturaufträge aus Kfz-Unfallschäden — tragen Sie unverbindlich Ihr Interesse ein.
          </p>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
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

        <WerkstattPartnerWerdenClient />
      </div>
    </div>
  )
}
