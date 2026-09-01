// Sub-Projekt 2 (Kunde-Portal 1+): Firma & Flotte — Einstieg.
// Kein Firmen-Konto -> Firma-Setup-Formular; sonst Flotten-Verwaltung.
// Reads via Admin-Client (personen/firmen deny-all fuer Kunden).

import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFirma, getKundeFlotte } from '@/lib/kunde/firma-flotte'
import FlotteClient from '@/components/flotte/FlotteClient'
import PageHeader from '@/components/shared/PageHeader'
import { speichereFirma, fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'

export const dynamic = 'force-dynamic'

export default async function FlottePage() {
  const { user } = await requirePortalAccess(['kunde'])
  const db = createAdminClient()
  const firma = await getKundeFirma(db, user.id)
  const flotte = firma ? await getKundeFlotte(db, firma.id) : []

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <PageHeader
        title="Firma & Flotte"
        description={
          firma
            ? 'Deine Firmenfahrzeuge — beim Schaden melden direkt auswählbar.'
            : 'Leg dein Firmen-Konto an, um mehrere Fahrzeuge zentral zu verwalten.'
        }
        size="lg"
      />
      <FlotteClient
        firma={firma}
        flotte={flotte}
        onSpeichereFirma={speichereFirma}
        onFuegeHinzu={fuegeFahrzeugHinzu}
        onEntferne={entferneFahrzeug}
      />
    </div>
  )
}
