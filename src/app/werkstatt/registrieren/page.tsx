import type { Metadata } from 'next'
import { WerkstattRegistrierenClient } from './WerkstattRegistrierenClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Werkstatt-Partner werden | Claimondo',
  description:
    'Registrieren Sie Ihre Werkstatt kostenlos als Claimondo-Partner. ' +
    'Sofort startklar mit eigenem QR-Einstieg und Reparaturaufträgen über den Werkstatt-Finder.',
}

export default async function WerkstattRegistrierenPage({
  searchParams,
}: {
  searchParams: Promise<{ einladung?: string }>
}) {
  const { einladung } = await searchParams
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
            Kostenlos registrieren — sofort startklar mit Ihrem eigenen QR-Einstieg für Kunden.
          </p>
        </div>
        <WerkstattRegistrierenClient einladung={einladung} />
      </div>
    </div>
  )
}
