// 2026-05-11 Funnel v2 PR #4: Datenabhaengige Onboarding-Details-Page.
// Liest den Fall + Claim + Lead + Vehicle aus der DB, ueberspringt Phasen
// wo alle Pflichtfelder bereits gefuellt sind, zeigt im DynamicWizard nur
// die noch offenen.
//
// Wird angezeigt nach Magic-Link-Login wenn flow_key='kunde-onboarding' Phasen
// existieren UND fuer den Fall noch Daten fehlen.

import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { ladeNoetigePhasen } from '@/lib/onboarding/load-needed-phases'
import { WizardClient } from '@/components/onboarding/WizardClient'
import { getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ fall_id?: string }>

export default async function OnboardingDetailsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { fall_id: fallIdQuery } = await searchParams

  const t = await getTranslations('kunde.settings')
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
            {t('onboardingDetails.keinFallTitle')}
          </h1>
          <p className="text-sm text-claimondo-shield">
            {t('onboardingDetails.keinFallBody')}
          </p>
        </div>
      </div>
    )
  }

  // Sicherheit (rls-safety-net): fallId kann aus dem user-kontrollierten URL-Query (?fall_id=)
  // stammen. ladeNoetigePhasen liest via admin-client (RLS umgangen) Claim-/Lead-/Fahrzeug-PII —
  // ohne dieses Ownership-Gate koennte ein eingeloggter Kunde via ?fall_id=<fremde-id> fremde
  // Falldaten lesen (IDOR). assertKundeOwnsFall deckt geschaedigter_user_id ∪ claim_parties ∪ lead.email.
  const { createAdminClient: createOwnershipAdmin } = await import('@/lib/supabase/admin')
  const ownership = await assertKundeOwnsFall(createOwnershipAdmin(), user.id, user.email ?? null, fallId)
  if (!ownership.ok) {
    redirect('/kunde')
  }

  const wizardState = await ladeNoetigePhasen(fallId, 'kunde-onboarding')

  // Wenn keine Phasen mehr offen — direkt zur Fallakte
  if (wizardState.phases.length === 0) {
    redirect(`/kunde/faelle/${fallId}`)
  }

  // AAR-zb1-wizard: wenn eine Wizard-Phase ein 'zb1-upload'-Feld enthält,
  // Token vorab holen. ladeNoetigePhasen liefert die schon gefilterten
  // Phasen — wenn fahrzeug per kennzeichen-Skip schon raus ist, brauchen
  // wir auch keinen Token.
  const hatZb1Feld = wizardState.phases.some(p => p.felder.some(f => f.typ === 'zb1-upload'))
  let zb1TokenForWizard: string | null = null
  if (hatZb1Feld) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminDb = createAdminClient()
    // CMM-49 (faelle-Drop-Runway): lead_id lebt auf claims (SSoT) -> via Bridge lesen.
    // faelle.lead_id == claims.lead_id (Divergenz=0 live verifiziert).
    const { data: fallBridge } = await adminDb
      .from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim(lead_id)')
      .eq('fall_id', fallId)
      .maybeSingle()
    const fcRaw = (fallBridge as { claims?: unknown } | null)?.claims
    const fallClaim = (Array.isArray(fcRaw) ? fcRaw[0] : fcRaw) as { lead_id?: string | null } | null | undefined
    const leadIdFuerZb1 = fallClaim?.lead_id ?? null
    if (leadIdFuerZb1) {
      const { ensureZb1Anfrage } = await import('@/lib/onboarding/ensure-zb1-anfrage')
      const res = await ensureZb1Anfrage(leadIdFuerZb1)
      if (res.ok) zb1TokenForWizard = res.token
    }
  }

  return (
    <div className="min-h-screen bg-claimondo-bg relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, color-mix(in srgb, var(--brand-accent, #7BA3CC) 18%, transparent), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, color-mix(in srgb, var(--brand-secondary, #4573A2) 8%, transparent), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-claimondo-ondo">
            {t('onboardingDetails.eyebrow')}
          </span>
          <h1
            className="mt-3 text-3xl sm:text-4xl font-bold tracking-[-.024em] text-claimondo-navy"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {t('onboardingDetails.heading')}
          </h1>
          {wizardState.skippedPhases > 0 && (
            <p className="mt-3 text-sm text-claimondo-shield/80">
              {t('onboardingDetails.skippedHint', { skipped: wizardState.skippedPhases, total: wizardState.totalDefinedPhases })}
            </p>
          )}
        </div>

        <WizardClient
          phases={wizardState.phases}
          flowKey="kunde-onboarding"
          prefilledValues={wizardState.prefilledValues}
          fallId={fallId}
          zb1Token={zb1TokenForWizard}
        />
      </div>
    </div>
  )
}
