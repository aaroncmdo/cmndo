import { createClient } from '@/lib/supabase/server'

export default async function ProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: sv }, faelleResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('vorname, nachname, telefon, rolle')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('sachverstaendige')
      .select('id, paket')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', user!.id),
  ])

  return (
    <div className="px-4 py-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-xl font-semibold text-white mb-6">Mein Profil</h1>

        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4">
          {/* Avatar placeholder */}
          <div className="flex items-center gap-4 pb-4 border-b border-zinc-800">
            <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-xl font-semibold">
              {(profile?.vorname?.[0] ?? '').toUpperCase()}{(profile?.nachname?.[0] ?? '').toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium text-lg">
                {[profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || '—'}
              </p>
              <p className="text-zinc-500 text-sm">Sachverständiger</p>
            </div>
          </div>

          <div className="space-y-0">
            <Row label="E-Mail" value={user!.email ?? '—'} />
            <Row label="Telefon" value={profile?.telefon ?? '—'} />
            <Row label="Paket" value={sv?.paket ?? '—'} />
            <Row label="Zugewiesene Fälle" value={String(faelleResult.count ?? 0)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-2.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-sm w-36 shrink-0">{label}</span>
      <span className="text-zinc-200 text-sm">{value}</span>
    </div>
  )
}
