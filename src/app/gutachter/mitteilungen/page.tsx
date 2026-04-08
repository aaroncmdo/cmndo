import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import MitteilungenClient from './MitteilungenClient'

export default async function MitteilungenPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  const sv = await getGutachterForUser(supabase, user!.id, 'id')

  if (!sv) {
    return (
      <div className="h-full flex flex-col">
        <div className="max-w-3xl mx-auto bg-yellow-50 border border-yellow-800 rounded-2xl p-6">
          <p className="text-yellow-300 text-sm">Sachverständigen-Profil nicht gefunden.</p>
        </div>
      </div>
    )
  }

  const { data: mitteilungen } = await supabase
    .from('gutachter_mitteilungen')
    .select('id, typ, titel, nachricht, gelesen, dringend, link, created_at')
    .eq('sv_id', sv.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return <MitteilungenClient mitteilungen={mitteilungen ?? []} />
}
