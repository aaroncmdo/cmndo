// Flotten-Self-Signup (public — Middleware-Whitelist '/flotte/registrieren'):
// Firmen registrieren sich selbst als Flotten-Partner, u.a. via Netzwerk-Kalt-
// Einladung (?einladung=<token> -> Auto-Kante nach Registrierung, Muster
// werkstatt/makler/sv). Das /flotte-Portal selbst bleibt geschuetzt.

import type { Metadata } from 'next'
import { FlotteRegistrierenClient } from './FlotteRegistrierenClient'

export const metadata: Metadata = {
  title: 'Als Flotte registrieren | Claimondo',
  description:
    'Registrieren Sie Ihre Firmen-Flotte kostenlos bei Claimondo — Netzwerkkarten für Ihre Fahrzeuge, Schadenabwicklung und Ihr Partner-Netzwerk.',
}

export default async function FlotteRegistrierenPage({
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
            Flotten-Portal
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Als Flotte registrieren
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            Kostenlos starten — Fahrzeuge verwalten, Netzwerkkarten binden und Schäden
            direkt am Fahrzeug melden lassen.
          </p>
        </div>
        <FlotteRegistrierenClient einladung={einladung} />
      </div>
    </div>
  )
}
