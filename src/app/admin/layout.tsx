import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from './_components/AdminNav'
import NotificationBell from './_components/NotificationBell'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // KFZ-203 Fix: Dispatch-User dürfen nicht auf /admin/* (Layout-Level Guard)
  const { data: profileCheck } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profileCheck?.rolle === 'dispatch') redirect('/dispatch/dashboard')

  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U'

  // KFZ-182: Unread nachrichten count for sidebar badge
  const { count: unreadNachrichten } = await supabase
    .from('nachrichten')
    .select('*', { count: 'exact', head: true })
    .eq('kanal', 'whatsapp')
    .eq('richtung', 'inbound')
    .eq('gelesen', false)

  return (
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      {/* Spotlight search (Cmd+K) */}
      <Spotlight />

      {/* Client-side nav with usePathname for active state */}
      <AdminNav email={user.email ?? ''} initials={initials} unreadNachrichten={unreadNachrichten ?? 0} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <NotificationBell />
        </header>

        {/* Desktop: Notification bell + Outbox badge top-right */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <NotificationBell />
        </div>

        {/* Content — each page decides its own scroll behavior.
            BUG-98: PageContainer gibt Desktop ~15-20 % horizontale Marge,
            Tablet quer großflächig, Mobile fast volle Breite. Kein py,
            damit Sticky-Header-Pattern in Pages weiter funktionieren. */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
