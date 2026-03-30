import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOutIcon, BarChart3Icon } from 'lucide-react'

export default async function MitarbeiterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (!profile || !['kundenbetreuer', 'leadbearbeiter', 'admin'].includes(profile.rolle)) redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-white font-semibold">Claimondo</h1>
          <Link href="/mitarbeiter/performance" className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition-colors">
            <BarChart3Icon className="w-4 h-4" /> Meine Performance
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 text-sm">{displayName}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="button" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <LogOutIcon className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
