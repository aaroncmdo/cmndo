import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getGutachterForUser } from '@/lib/gutachter'
import VerfuegbarkeitClient from './VerfuegbarkeitClient'

// AAR-SV-Verfuegbarkeit: Settings-Page fuer Arbeitszeiten + Urlaub im SV-Portal.
// Bisher gab es KEINEN Editor fuer diese Werte — sie lagen nur als Engine-
// Default (slots.ts) vor. Hier kann der SV sie selbst pflegen.

export const dynamic = 'force-dynamic'

export default async function VerfuegbarkeitPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    arbeitszeiten: Record<string, { von: string; bis: string }> | null
    blockierte_wochentage: number[] | null
    urlaub_von: string | null
    urlaub_bis: string | null
  }>(supabase, user.id, 'id, arbeitszeiten, blockierte_wochentage, urlaub_von, urlaub_bis')
  if (!sv) redirect('/gutachter/willkommen')

  return (
    <VerfuegbarkeitClient
      initial={{
        arbeitszeiten: sv.arbeitszeiten ?? null,
        blockierteWochentage: sv.blockierte_wochentage ?? [],
        urlaubVon: sv.urlaub_von ?? null,
        urlaubBis: sv.urlaub_bis ?? null,
      }}
    />
  )
}
