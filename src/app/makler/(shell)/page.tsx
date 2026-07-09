// AAR-484 (M2): Makler-Dashboard -- Server-Entry. Layout garantiert bereits
// dass der User existiert und Makler-Rolle + aktiven Status hat. Daten
// werden parallel via getMaklerDashboardData geladen.

import { redirect } from 'next/navigation'
import {
  getCurrentMakler,
  getMaklerDashboardData,
  getMaklerVermittlungsCount,
  getMaklerStaffelStufen,
} from '@/lib/makler/queries'
import { MaklerDashboard } from '@/components/makler/MaklerDashboard'
import { getPartnerRangSelf } from '@/lib/partner-rang/get'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function MaklerDashboardPage() {
  const makler = await getCurrentMakler()
  if (!makler) return null // Layout redirectet bei null eigentlich schon

  // Makler-Aktivierung: frisch registrierte Makler zuerst durch den Willkommens-Wizard
  // (einmalig, via makler.onboarding_abgeschlossen -- auch der Skip setzt das Flag). Die
  // Weiche steht hier in der Dashboard-Page (nicht im Layout) -> kein Loop mit /makler/willkommen.
  if (!makler.onboarding_abgeschlossen) redirect('/makler/willkommen')

  // Vertriebs-Pipeline lebt jetzt auf /makler/abrechnungen (Anordnung Aaron 07.07.) -> hier
  // nicht mehr laden.
  const [data, vermittlungsCount, staffelStufen, partnerRang] = await Promise.all([
    getMaklerDashboardData(makler.id),
    getMaklerVermittlungsCount(makler.id),
    getMaklerStaffelStufen(makler.id),
    getPartnerRangSelf(createAdminClient(), 'makler', makler.id),
  ])

  // Erste-Vermittlung-Prompt: einmalig, sobald der Makler >=1 Vermittlung hat und die Card
  // noch nicht weggeklickt wurde. Trigger hier beim Dashboard-Load (keine Kopplung an
  // convert-lead-to-claim). Dismiss setzt vermittlung_prompt_gesehen -> danach nie wieder.
  const zeigeErsteVermittlungCard = data.hatVermittlung && !makler.vermittlung_prompt_gesehen

  return (
    <MaklerDashboard
      makler={makler}
      data={data}
      zeigeErsteVermittlungCard={zeigeErsteVermittlungCard}
      promoCode={data.promoCode}
      staffelSettled={vermittlungsCount.settled}
      staffelPending={vermittlungsCount.pending}
      staffelStufen={staffelStufen}
      partnerRang={partnerRang}
    />
  )
}
