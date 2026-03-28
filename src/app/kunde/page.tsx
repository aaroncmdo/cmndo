import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function KundePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-5">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white mb-2">Kunden Dashboard</h1>
        <p className="text-zinc-400 text-sm">{user.email}</p>
      </div>
    </div>
  )
}
