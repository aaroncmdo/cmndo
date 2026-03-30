import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from './_components/AdminNav'
import NotificationBell from './_components/NotificationBell'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U'

  return (
    <div className="min-h-screen glass-bg relative">
      {/* Ambient light overlays */}
      <div className="glass-ambient" aria-hidden="true" />
      <div className="glass-ambient-indigo" aria-hidden="true" />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="md:ml-56 min-h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 className="text-base font-semibold text-white tracking-tight">Claimondo</h2>
          <NotificationBell />
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>
    </div>
  )
}
