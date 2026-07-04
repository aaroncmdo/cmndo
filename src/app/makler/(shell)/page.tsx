// AAR-484 (M2): Makler-Dashboard -- Server-Entry. Layout garantiert bereits
// dass der User existiert und Makler-Rolle + aktiven Status hat. Daten
// werden parallel via getMaklerDashboardData geladen.

import { redirect } from 'next/navigation'
import { getCurrentMakler, getMaklerDashboardData } from '@/lib/makler/queries'
import { getMaklerPipeline } from '@/lib/makler/pipeline'
import { createClient } from '@/lib/supabase/server'
import { MaklerDashboard } from '@/components/makler/MaklerDashboard'
import { NetzwerkWidget } from '@/components/shared/netzwerk/NetzwerkWidget'

export const dynamic = 'force-dynamic'

export default async function MaklerDashboardPage() {
  const makler = await getCurrentMakler()
  if (!makler) return null // Layout redirectet bei null eigentlich schon

  // Makler-Aktivierung: frisch registrierte Makler zuerst durch den Willkommens-Wizard
  // (einmalig, via makler.onboarding_abgeschlossen -- auch der Skip setzt das Flag). Die
  // Weiche steht hier in der Dashboard-Page (nicht im Layout) -> kein Loop mit /makler/willkommen.
  if (!makler.onboarding_abgeschlossen) redirect('/makler/willkommen')

  const supabase = await createClient()
  const [data, pipeline] = await Promise.all([
    getMaklerDashboardData(makler.id),
    getMaklerPipeline(supabase, makler.id),
  ])

  // Erste-Vermittlung-Prompt: einmalig, sobald der Makler >=1 Vermittlung hat und die Card
  // noch nicht weggeklickt wurde. Trigger hier beim Dashboard-Load (keine Kopplung an
  // convert-lead-to-claim). Dismiss setzt vermittlung_prompt_gesehen -> danach nie wieder.
  const zeigeErsteVermittlungCard = data.hatVermittlung && !makler.vermittlung_prompt_gesehen

  return (
    <>
      <MaklerDashboard
        makler={makler}
        data={data}
        pipeline={pipeline}
        zeigeErsteVermittlungCard={zeigeErsteVermittlungCard}
        promoCode={data.promoCode}
      />
      <div className="mt-6"><NetzwerkWidget portal="makler" /></div>
    </>
  )
}
