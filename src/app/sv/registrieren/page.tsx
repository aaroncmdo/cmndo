import type { Metadata } from 'next'
import { SvRegistrierenClient } from './SvRegistrierenClient'

export const metadata: Metadata = {
  // Kein "| Claimondo"-Suffix — das Layout-Template haengt es an (sonst doppelt im Tab).
  title: 'Als Sachverständiger registrieren',
  description:
    'Registriere dich kostenlos als Kfz-Sachverständiger bei Claimondo. ' +
    'Finde deinen bestehenden Eintrag oder lege ein neues Profil an.',
}

export default async function SvRegistrierenPage({
  searchParams,
}: {
  // Netzwerk-Kalt-Einladung (a-Followup): Token aus der Einladungs-Mail -> Auto-Kante
  // nach der Registrierung (Muster werkstatt/registrieren).
  searchParams: Promise<{ einladung?: string }>
}) {
  const { einladung } = await searchParams
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-claimondo-ondo">
            Sachverständigen-Portal
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-claimondo-navy sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Als Sachverständiger registrieren
          </h1>
          <p className="mt-3 text-sm text-claimondo-shield">
            Kostenlos starten — nach der Registrierung führt dich unser Onboarding in wenigen Minuten zur Freischaltung.
          </p>
        </div>
        <SvRegistrierenClient einladung={einladung} />
      </div>
    </div>
  )
}
