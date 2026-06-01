// AAR-940 Phase 2: Self-Service-Einstieg /anfrage/[token]. Anon-Route (public
// in middleware whitelisted). Server validiert Token (Gate), Client triggert die
// Promotion Anfrage->Lead beim Oeffnen. Phase 3 (Selbst-Quali) haengt sich hier ein.

import { getAnfrageByToken } from './actions'
import { AnfrageStartClient } from './AnfrageStartClient'
import { BeauftragungWizardStart } from './BeauftragungWizardStart'
import { ladeBeauftragungPhasen } from '@/lib/onboarding/lade-beauftragung-phasen'

export const dynamic = 'force-dynamic'

export default async function AnfrageTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ wizard?: string }>
}) {
  const { token } = await params
  const { wizard } = await searchParams
  const { data, error } = await getAnfrageByToken(token)

  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-claimondo-navy mb-2">Link nicht gültig</h1>
          <p className="text-claimondo-navy/70">
            {error ?? 'Dieser Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.'}
          </p>
        </div>
      </main>
    )
  }

  // Render-Flag (Validierung vor MIG): ?wizard=v2 -> config-getriebener beauftragung-
  // Wizard (Y-Modell); Default = bespoke AnfrageStartClient (Live unveraendert).
  // MIG flippt den Default + entfernt das Param-Gate.
  if (wizard === 'v2') {
    const phases = await ladeBeauftragungPhasen()
    return (
      <main className="min-h-screen bg-white px-4 py-8">
        <div className="mx-auto max-w-lg">
          <BeauftragungWizardStart token={token} phases={phases} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4">
      <AnfrageStartClient
        token={token}
        vorname={data.vorname}
        bereitsKonvertiert={data.bereitsKonvertiert}
      />
    </main>
  )
}
