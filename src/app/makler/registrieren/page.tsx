import type { Metadata } from 'next'
import { MaklerRegistrierenClient } from './MaklerRegistrierenClient'

export const metadata: Metadata = {
  title: 'Makler-Partner werden | Claimondo',
  description:
    'Registrieren Sie sich kostenlos als Makler-Partner bei Claimondo. ' +
    'Sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite für Ihre Kunden.',
}

export default function MaklerRegistrierenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Makler-Partnerprogramm
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Makler-Partner werden
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            Kostenlos registrieren — sofort startklar mit Ihrer eigenen Empfehlungs-Landeseite.
          </p>
        </div>
        <MaklerRegistrierenClient />
      </div>
    </div>
  )
}
