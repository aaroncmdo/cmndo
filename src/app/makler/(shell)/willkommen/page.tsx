// Makler-Aktivierung: gefuehrter Willkommens-Wizard (Erst-Login). Route bewusst
// /makler/willkommen — NICHT /makler/onboarding (das ist die "keine makler-Row"-Fallback-
// Seite aus dem (shell)-Layout). Erreichbar via Dashboard-Redirect (onboarding_abgeschlossen
// = false) und via Checkliste auf /makler/promo. Auth/Rolle/Status garantiert das Layout.
import { redirect } from 'next/navigation'
import { getCurrentMakler, getMaklerPrimaryPromoCode } from '@/lib/makler/queries'
import { OnboardingWizardClient } from './OnboardingWizardClient'

export const dynamic = 'force-dynamic'

export default async function MaklerWillkommenPage() {
  const makler = await getCurrentMakler()
  if (!makler) redirect('/login')

  const code = await getMaklerPrimaryPromoCode(makler.id)

  return (
    <OnboardingWizardClient
      firma={makler.firma}
      vorname={makler.ansprechpartner_vorname}
      code={code?.code ?? null}
    />
  )
}
