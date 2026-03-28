import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminPage() {
  const supabase = await createClient()

  const [{ count: faelleCount }, { count: leadsCount }] = await Promise.all([
    supabase.from('faelle').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
  ])

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-1">Dashboard</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/admin/faelle"
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors group"
          >
            <div className="text-3xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
              {faelleCount ?? 0}
            </div>
            <div className="text-zinc-400 text-sm font-medium">Fälle</div>
            <div className="text-zinc-600 text-xs mt-1">Alle Fälle anzeigen →</div>
          </Link>
          <Link
            href="/admin/leads"
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition-colors group"
          >
            <div className="text-3xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
              {leadsCount ?? 0}
            </div>
            <div className="text-zinc-400 text-sm font-medium">Leads</div>
            <div className="text-zinc-600 text-xs mt-1">Alle Leads anzeigen →</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
