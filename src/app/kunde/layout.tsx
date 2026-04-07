import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import NotificationBell from '@/app/admin/_components/NotificationBell'
import KundeNav from './_components/KundeNav'

export default async function KundeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'kunde') redirect('/login')

  const displayName = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Kunde'
  const initials = [profile?.vorname?.[0], profile?.nachname?.[0]].filter(Boolean).join('').toUpperCase() || 'K'

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 fixed top-0 left-0 h-screen z-40 bg-[#0D1B3E]">
        <div className="px-5 py-5">
          <Link href="/kunde">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-[#4573A2]">ondo</span>
            </span>
          </Link>
        </div>

        <KundeNav />

        {/* Profil + Notification unten */}
        <div className="mt-auto px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#4573A2] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
            </div>
            <NotificationBell />
          </div>
        </div>
      </aside>

      {/* Mobile Header — hidden on desktop */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 bg-[#0D1B3E] shadow-md">
        <Link href="/kunde">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-[#4573A2]">ondo</span>
          </span>
        </Link>
        <NotificationBell />
      </header>

      {/* Hauptinhalt — offset by sidebar on desktop, offset by header on mobile */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-6">
        {children}
      </main>

      {/* Mobile Bottom-Nav — hidden on desktop */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
        style={{ paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <KundeNav mobile />
      </nav>
    </div>
  )
}
