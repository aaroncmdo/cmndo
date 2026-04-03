import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, email, telefon')
    .eq('id', user.id)
    .single()

  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') : user.email ?? ''

  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-[#0D1B3E]">Mein Profil</h1>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div><span className="text-sm text-gray-500">Name</span><p className="text-[#0D1B3E] font-medium">{name || '—'}</p></div>
        <div><span className="text-sm text-gray-500">E-Mail</span><p className="text-[#0D1B3E]">{profile?.email ?? user.email ?? '—'}</p></div>
        {profile?.telefon && <div><span className="text-sm text-gray-500">Telefon</span><p className="text-[#0D1B3E]">{profile.telefon}</p></div>}
      </div>
    </div>
  )
}
