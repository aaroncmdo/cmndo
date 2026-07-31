// P6 / WS H: fahrzeug-scoped Schaden-Detail im Kunde-Portal.
// C4-Gate: KONSUMIERT die bestehende Kunde-Claim-Sicht (getKundeClaimView + KundeClaimView)
// — kein Fork, kein Neu-Bau. Doppel-Gate: (1) Fahrzeug gehoert dem Kunden (owner-scoped),
// (2) die ownership-aufloesende Claim-Sicht selbst (claim_parties/kunde_id/lead.email).

import { redirect, notFound } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import { getKundeClaimView } from '@/lib/claims/kunde-claim-view'
import { KundeClaimView } from '@/components/kunde/claim-view/KundeClaimView'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugSchadenDetail({
  params,
}: {
  params: Promise<{ id: string; claimId: string }>
}) {
  const { id, claimId } = await params
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')
    const admin = createAdminClient()

    // Gate 1: Fahrzeug gehoert dem Kunden?
    const owns = (await getKundeFahrzeuge(admin, user.id)).some((f) => f.vehicleId === id)
    if (!owns) notFound()

    // Gate 2 + Daten: die bestehende ownership-aufloesende Kunde-Claim-Sicht (C4). null -> 404.
    const vm = await getKundeClaimView(admin, user.id, user.email ?? null, claimId)
    if (!vm) notFound()

    return <KundeClaimView vm={vm} />
  } catch (err) {
    if (isRedirectError(err) || isHTTPAccessFallbackError(err)) throw err
    console.error('[KundeFahrzeugSchadenDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-danger font-semibold">Fehler beim Laden.</p>
      </div>
    )
  }
}
