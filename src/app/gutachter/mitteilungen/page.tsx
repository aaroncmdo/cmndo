import { createClient } from '@/lib/supabase/server'
import MitteilungenClient from './MitteilungenClient'

export default async function MitteilungenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user!.id)
    .single()

  if (!sv) {
    return (
      <div className="px-4 py-8">
        <div className="max-w-3xl mx-auto bg-yellow-50 border border-yellow-800 rounded-2xl p-6">
          <p className="text-yellow-300 text-sm">Sachverstaendigen-Profil nicht gefunden.</p>
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
