// Kunde-Claim-Detail — duenne Page: Auth + Ownership/Redirect via getKundeClaimView (EIN Loader,
// EIN ViewModel), Rendering im phasen-adaptiven Zonen-Dashboard <KundeClaimView>. Der ~1140-Zeilen-
// Monolith (24 Loader + 28 inline-Cards) ist in die reine Datenschicht (src/lib/claims/kunde-claim-view.ts
// + kunde-zonen.ts) und die Zonen (src/components/kunde/claim-view/*) migriert (Kunde-Detail-Rebuild).
//
// Ownership: getKundeClaimView -> getClaimDetail('kunde', {userId,email}) -> getKundeFallDetailRecord
// gated per claim_parties/kunde_id/lead.email (in-code, client-unabhaengig). null -> notFound().
// CMM-63: routeId ist der claim_id (neuer Key) ODER eine faelle.id (Alt-Bookmark, accept-both im
// Loader) -> Canonical-Redirect auf die claim_id-URL.

import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeClaimView } from '@/lib/claims/kunde-claim-view'
import { KundeClaimView } from '@/components/kunde/claim-view/KundeClaimView'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'

// force-dynamic: der Realtime-Refresh (FallRealtimeRefresh) + Verlegungs-/SV-Live-Banner
// brauchen frische Daten ohne Hard-Reload (AAR-864).
export const dynamic = 'force-dynamic'

export default async function KundeFallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params
  const t = await getTranslations('kunde.fall')

  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()
    const vm = await getKundeClaimView(admin, user.id, user.email ?? null, routeId)
    if (!vm) notFound()

    // CMM-63 Canonicalize: Alt-faelle.id-URL -> kanonische claim_id-URL.
    if (vm.claimId && routeId !== vm.claimId) redirect(`/kunde/faelle/${vm.claimId}`)

    // P6 / WS H: fahrzeug-zentrische Kanonik — hat der Claim ein owned Fahrzeug, ist die
    // kanonische URL /kunde/fahrzeuge/[vehId]/schaden/[claimId]. Vehicle-lose Claims rendern
    // hier weiter in place -> KEIN reiner Redirect-Stub (Content-return unten), kein Stranding.
    const canonicalClaimId = vm.claimId ?? routeId
    const { data: claimVeh } = await admin
      .from('claims')
      .select('vehicle_id')
      .eq('id', canonicalClaimId)
      .maybeSingle()
    const vehId = (claimVeh as { vehicle_id?: string | null } | null)?.vehicle_id ?? null
    if (vehId) {
      const { data: owned } = await admin
        .from('vehicles')
        .select('id')
        .eq('id', vehId)
        .eq('current_owner_id', user.id)
        .maybeSingle()
      if (owned) redirect(`/kunde/fahrzeuge/${vehId}/schaden/${canonicalClaimId}`)
    }

    return <KundeClaimView vm={vm} />
  } catch (err) {
    // redirect()/notFound() werfen Control-Flow-Errors, die an Next's Error-Boundary
    // durchschlagen muessen (sonst 200 „Fehler beim Laden" statt 404/Redirect — CMM-63 Deny-Smoke).
    if (isRedirectError(err) || isHTTPAccessFallbackError(err)) throw err
    console.error('[KundeFallDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-danger font-semibold">{t('fehler.titel')}</p>
        <p className="text-sm text-claimondo-ondo mt-1">{t('fehler.text')}</p>
      </div>
    )
  }
}
