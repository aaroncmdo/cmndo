// AAR-628: Rolle-abhängige Shell für die Fallakte-Route.
//
// Die Fallakte wird von drei Rollen genutzt:
//   - admin / kanzlei → volle Admin-Shell (AdminNav + NotificationBell + Spotlight)
//   - kundenbetreuer  → Mitarbeiter-Shell (MitarbeiterNav + reduzierte Header)
//
// Früher lag die Fallakte unter /admin/faelle/[id] — dadurch landete KB
// nach Klick aus /mitarbeiter/* optisch im Admin-Portal. Mit der Route-
// Konsolidierung in /faelle/[id] entscheidet das Layout hier die Shell.
//
// Beide Shells werden server-seitig gerendert, damit die Sidebar-Badges
// (unread Nachrichten, offene Tasks) korrekt laden — analog zu
// /admin/layout.tsx und /mitarbeiter/layout.tsx.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import AdminNav from '@/app/admin/_components/AdminNav'
import MitarbeiterNav from '@/app/mitarbeiter/_components/MitarbeiterNav'
import MitteilungszentralePanel from '@/components/mitteilungszentrale/MitteilungszentralePanel'
import Spotlight from '@/components/Spotlight'
import { PageContainer } from '@/components/PageContainer'
import OutboxBadge from '@/components/offline/OutboxBadge'

export default async function FaelleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined

  // Rollen die hier nichts zu suchen haben: dispatch, sachverstaendiger, kunde
  // haben eigene Fall-Ansichten (/dispatch/..., /gutachter/..., /kunde/...)
  if (rolle === 'dispatch') redirect('/dispatch/dashboard')
  if (rolle === 'sachverstaendiger') redirect('/gutachter')
  if (rolle === 'kunde') redirect('/kunde')
  if (rolle === 'makler') redirect('/makler')
  if (!rolle || !['admin', 'kanzlei', 'kundenbetreuer', 'leadbearbeiter'].includes(rolle)) {
    redirect('/login')
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : 'U'
  const displayName =
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email || ''

  // KB / Leadbearbeiter → Mitarbeiter-Shell
  if (rolle === 'kundenbetreuer' || rolle === 'leadbearbeiter') {
    let unread = 0
    try {
      const { count } = await supabase
        .from('nachrichten')
        .select('id', { count: 'exact', head: true })
        .eq('gelesen', false)
        .neq('sender_id', user.id)
      unread = count ?? 0
    } catch { /* non-critical */ }

    return (
      <div className="min-h-screen bg-[#f8f9fb]">
        <header className="bg-[#0D1B3E] px-4 py-3 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[#7BA3CC] text-sm">{displayName}</span>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-[#7BA3CC] hover:text-white transition-colors">
                <LogOutIcon className="w-4 h-4" />
              </button>
            </form>
          </div>
        </header>
        <div className="flex">
          <MitarbeiterNav unreadNachrichten={unread} />
          <main className="flex-1 px-4 md:px-8 py-6 max-w-6xl">{children}</main>
        </div>
      </div>
    )
  }

  // admin / kanzlei → Admin-Shell (Kopie der /admin/layout.tsx-Logik,
  // damit Admin-User ihre gewohnte Umgebung behalten — inkl. Spotlight,
  // NotificationBell, Task-Badge)
  const [
    { count: unreadNachrichten },
    { count: meineTasksCount },
  ] = await Promise.all([
    supabase
      .from('nachrichten')
      .select('*', { count: 'exact', head: true })
      .eq('kanal', 'whatsapp')
      .eq('richtung', 'inbound')
      .eq('gelesen', false),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('zugewiesen_an', user.id)
      .in('status', ['offen', 'in-bearbeitung']),
  ])

  return (
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      <Spotlight />
      <AdminNav
        email={user.email ?? ''}
        initials={initials}
        unreadNachrichten={unreadNachrichten ?? 0}
        meineTasksCount={meineTasksCount ?? 0}
      />
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span>
          </span>
          <MitteilungszentralePanel variant="dark" />
        </header>
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <OutboxBadge />
          <MitteilungszentralePanel variant="light" />
        </div>
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
