// P6 / WS H: Fahrzeug-Detail im Kunde-Portal — Stammdaten + Schadenhistorie.
// Owner-Gate via getKundeFahrzeuge (vehicles.current_owner_id); die Schadenhistorie
// ist die reused FM-Sektion (read-only: keine Storno-/Entwurf-Props), Links aufs
// Kunde-Portal umgebogen (schadenHrefBase).

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback'
import { ChevronLeftIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKundeFahrzeuge } from '@/lib/kunde/fahrzeuge'
import { getKundeFahrzeugSchaeden } from '@/lib/kunde/fahrzeug-schaeden'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { FahrzeugSchaedenSection } from '@/components/flotte/FahrzeugSchaedenSection'

export const dynamic = 'force-dynamic'

export default async function KundeFahrzeugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) redirect('/login')

    const admin = createAdminClient()
    const fahrzeuge = await getKundeFahrzeuge(admin, user.id)
    const fahrzeug = fahrzeuge.find((f) => f.vehicleId === id)
    if (!fahrzeug) notFound()

    const schaeden = await getKundeFahrzeugSchaeden(admin, user.id, id)

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <Link
          href="/kunde/fahrzeuge"
          className="inline-flex items-center gap-1 text-sm text-claimondo-shield hover:text-claimondo-navy transition-colors"
        >
          <ChevronLeftIcon size={16} />
          Meine Fahrzeuge
        </Link>
        <PageHeader
          title={fahrzeug.kennzeichen ?? 'Mein Fahrzeug'}
          description={[fahrzeug.hersteller, fahrzeug.modell].filter(Boolean).join(' ') || undefined}
        />

        <SectionCard title="Fahrzeugdaten">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-claimondo-shield">Kennzeichen</dt>
            <dd className="text-claimondo-navy">{fahrzeug.kennzeichen ?? '—'}</dd>
            <dt className="text-claimondo-shield">Hersteller</dt>
            <dd className="text-claimondo-navy">{fahrzeug.hersteller ?? '—'}</dd>
            <dt className="text-claimondo-shield">Modell</dt>
            <dd className="text-claimondo-navy">{fahrzeug.modell ?? '—'}</dd>
            <dt className="text-claimondo-shield">FIN</dt>
            <dd className="text-claimondo-navy break-all">{fahrzeug.fin ?? '—'}</dd>
            <dt className="text-claimondo-shield">Farbe</dt>
            <dd className="text-claimondo-navy">{fahrzeug.farbe ?? '—'}</dd>
            <dt className="text-claimondo-shield">Kilometerstand</dt>
            <dd className="text-claimondo-navy">
              {fahrzeug.kilometerstand != null ? `${fahrzeug.kilometerstand.toLocaleString('de-DE')} km` : '—'}
            </dd>
          </dl>
        </SectionCard>

        {/* Schadenhistorie — reused FM-Sektion, read-only (keine onStorno-/onEntwurf-Props),
            Link-Basis auf das Kunde-Portal umgebogen. */}
        <FahrzeugSchaedenSection schaeden={schaeden} vehicleId={id} schadenHrefBase="/kunde/fahrzeuge" />
      </div>
    )
  } catch (err) {
    if (isRedirectError(err) || isHTTPAccessFallbackError(err)) throw err
    console.error('[KundeFahrzeugDetail] Error:', err)
    return (
      <div className="p-8 text-center">
        <p className="text-danger font-semibold">Fehler beim Laden.</p>
      </div>
    )
  }
}
