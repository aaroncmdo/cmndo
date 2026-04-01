import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from './_components/AdminNav'
import NotificationBell from './_components/NotificationBell'
import Spotlight from '@/components/Spotlight'

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
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      {/* Spotlight search (Cmd+K) */}
      <Spotlight />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <NotificationBell />
        </header>

        {/* Desktop: Notification bell top-right */}
        <div className="hidden md:block fixed top-3 right-4 z-30">
          <NotificationBell />
        </div>

        {/* Content — each page decides its own scroll behavior */}
        <main id="main-content" role="main" className="flex-1 min-h-0 pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  )
}
