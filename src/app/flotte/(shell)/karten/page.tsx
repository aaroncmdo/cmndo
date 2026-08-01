import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKartenFuerFirma } from '@/lib/schadenkarte/schadenkarte'
import KartenClient from './KartenClient'
import {
  identifiziereKarte,
  baueKartenQrPdf,
  sperreKarte,
  entsperreKarte,
  entbindeKarte,
} from './actions'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export default async function KartenPage() {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  const karten = firma ? await getKartenFuerFirma(db, firma.id, { nurGebunden: true }) : []

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">Karten</h1>
        <p className="mt-1 text-sm text-claimondo-shield">
          Gebundene Netzwerkkarten verwalten und Fahrzeuge per Karte identifizieren.
        </p>
      </div>
      <KartenClient
        karten={karten}
        onIdentify={identifiziereKarte}
        onQrPdf={baueKartenQrPdf}
        onSperren={sperreKarte}
        onEntsperren={entsperreKarte}
        onEntbinden={entbindeKarte}
      />
    </div>
  )
}
