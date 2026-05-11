// 2026-05-11 Funnel v2 PR #4: Datenabhaengige Onboarding-Details-Page.
// Liest den Fall + Claim + Lead + Vehicle aus der DB, ueberspringt Phasen
// wo alle Pflichtfelder bereits gefuellt sind, zeigt im DynamicWizard nur
// die noch offenen.
//
// Wird angezeigt nach Magic-Link-Login wenn flow_key='kunde-onboarding' Phasen
// existieren UND fuer den Fall noch Daten fehlen.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ladeNoetigePhasen } from '@/lib/onboarding/load-needed-phases'
import { WizardClient } from '@/components/onboarding/WizardClient'
import { getKundeFaelle } from '@/lib/claims/get-kunde-faelle'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ fall_id?: string }>

export default async function OnboardingDetailsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { fall_id: fallIdQuery } = await searchParams

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login?redirect=/kunde/onboarding-details')

  // fallId aus Query ODER ersten Fall des Kunden
  let fallId = fallIdQuery ?? ''
  if (!fallId) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const faelle = await getKundeFaelle(admin, user.id, user.email ?? null)
    fallId = faelle[0]?.id ?? ''
  }

  if (!fallId) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_6px_18px_rgba(15,30,68,.07)] p-8 text-center">
          <h1 className="text-xl font-bold text-claimondo-navy mb-3" style={{ fontFamily: 'Montserrat' }}>
            Kein Fall gefunden
          </h1>
          <p className="text-sm text-claimondo-shield">
            Es ist kein Schadensfall mit Ihrem Account verknuepft. Bitte kontaktieren Sie uns.
          </p>
        </div>
      </div>
    )
  }

  const wizardState = await ladeNoetigePhasen(fallId, 'kunde-onboarding')

  // Wenn keine Phasen mehr offen — direkt zur Fallakte
  if (wizardState.phases.length === 0) {
    redirect(`/kunde/faelle/${fallId}`)
  }

  return (
    <div className="min-h-screen bg-claimondo-bg relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,.08), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-claimondo-ondo">
            Ihr Fall wird vorbereitet
          </span>
          <h1
            className="mt-3 text-3xl sm:text-4xl font-bold tracking-[-.024em] text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Nur noch wenige Angaben.
          </h1>
          {wizardState.skippedPhases > 0 && (
            <p className="mt-3 text-sm text-claimondo-shield/80">
              {wizardState.skippedPhases} von {wizardState.totalDefinedPhases} Schritten wurden bereits
              ausgefuellt — entweder durch unseren Service-Mitarbeiter oder per Foto-Auswertung.
            </p>
          )}
        </div>

        <WizardClient
          phases={wizardState.phases}
          flowKey="kunde-onboarding"
          prefilledValues={wizardState.prefilledValues}
        />
      </div>
    </div>
  )
}
