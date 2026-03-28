import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function GutachterDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Find the sachverstaendige record for this user
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('id', user!.id)
    .single()

  const svId = sv?.id

  // Parallel queries for dashboard metrics
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + 1) // Monday
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const [neueRes, termineRes, offeneRes] = await Promise.all([
    // Neue Aufträge: assigned but no gutachten submitted yet
    svId
      ? supabase
          .from('faelle')
          .select('id', { count: 'exact', head: true })
          .eq('sv_id', svId)
          .in('status', ['sv-zugewiesen', 'sv-termin'])
      : Promise.resolve({ count: 0 }),

    // Termine diese Woche
    svId
      ? supabase
          .from('faelle')
          .select('id', { count: 'exact', head: true })
          .eq('sv_id', svId)
          .gte('sv_termin', weekStart.toISOString())
          .lte('sv_termin', weekEnd.toISOString())
      : Promise.resolve({ count: 0 }),

    // Offene Berichte: appointment done but no gutachten submitted
    svId
      ? supabase
          .from('faelle')
          .select('id', { count: 'exact', head: true })
          .eq('sv_id', svId)
          .not('sv_termin', 'is', null)
          .is('gutachten_eingegangen_am', null)
          .not('status', 'in', '("abgeschlossen","storniert")')
      : Promise.resolve({ count: 0 }),
  ])

  const neueCount = neueRes.count ?? 0
  const termineCount = termineRes.count ?? 0
  const offeneCount = offeneRes.count ?? 0

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-1">Dashboard</h1>
          <p className="text-zinc-500 text-sm">Ihre aktuelle Auftragsübersicht</p>
        </div>

        {!svId && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl p-6 mb-6">
            <p className="text-yellow-300 text-sm">
              Ihr Sachverständigen-Profil wurde noch nicht angelegt. Bitte kontaktieren Sie den Administrator.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/gutachter/auftraege?filter=neu"
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors group"
          >
            <div className="text-3xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
              {neueCount}
            </div>
            <div className="text-zinc-400 text-sm font-medium">Neue Aufträge</div>
            <div className="text-zinc-600 text-xs mt-1">Zugewiesene Fälle →</div>
          </Link>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="text-3xl font-bold text-white mb-1">
              {termineCount}
            </div>
            <div className="text-zinc-400 text-sm font-medium">Termine diese Woche</div>
            <div className="text-zinc-600 text-xs mt-1">Vor-Ort-Besichtigungen</div>
          </div>

          <Link
            href="/gutachter/auftraege?filter=offen"
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors group"
          >
            <div className={`text-3xl font-bold mb-1 transition-colors ${offeneCount > 0 ? 'text-amber-400 group-hover:text-amber-300' : 'text-white group-hover:text-blue-400'}`}>
              {offeneCount}
            </div>
            <div className="text-zinc-400 text-sm font-medium">Offene Berichte</div>
            <div className="text-zinc-600 text-xs mt-1">Gutachten ausstehend →</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
