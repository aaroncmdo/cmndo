// P6 / WS H: Kunde fahrzeug-zentrisch — Übersicht aller eigenen Fahrzeuge
// (vehicles.current_owner_id = Kunde). Ein-Auto-Kunden landen direkt im Detail.
// KEIN Redirect-Stub: 0 Fahrzeuge -> EmptyState, >1 -> Liste (Content-returns).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { CarFrontIcon, ChevronRightIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Card } from '@/components/primitives'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugePage() {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()
    const fahrzeuge = await getKundeFahrzeuge(admin, user.id)

    // Ein-Auto-Kunde: direkt ins Fahrzeug (kein Zwischen-Klick).
    if (fahrzeuge.length === 1) redirect(`/kunde/fahrzeuge/${fahrzeuge[0].vehicleId}`)

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Meine Fahrzeuge"
          description="Alle Fahrzeuge, die mit Ihrem Konto verknüpft sind — mit der kompletten Schadenhistorie."
        />

        {fahrzeuge.length === 0 ? (
          <EmptyState
            icon={CarFrontIcon}
            title="Noch keine Fahrzeuge hinterlegt"
            description="Sobald Sie einen Schaden melden, verknüpfen wir Ihr Fahrzeug automatisch mit Ihrem Konto."
          />
        ) : (
          <div className="space-y-3">
            {fahrzeuge.map((f) => (
              <Link key={f.vehicleId} href={`/kunde/fahrzeuge/${f.vehicleId}`} className="block">
                <Card className="flex items-center gap-4 hover:border-claimondo-shield transition-colors">
                  <div className="w-10 h-10 rounded-ios-md bg-claimondo-bg flex items-center justify-center shrink-0">
                    <CarFrontIcon size={20} className="text-claimondo-shield" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-claimondo-navy truncate">
                      {f.kennzeichen ?? 'Ohne Kennzeichen'}
                    </p>
                    <p className="text-sm text-claimondo-ondo truncate">
                      {[f.hersteller, f.modell].filter(Boolean).join(' ') || 'Fahrzeugdaten folgen'}
                    </p>
                  </div>
                  <ChevronRightIcon size={18} className="text-claimondo-light-blue shrink-0" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  } catch (err) {
    if (isRedirectError(err)) throw err
    console.error('[KundeFahrzeuge] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-danger font-semibold">Fehler beim Laden.</p>
      </div>
    )
  }
}
