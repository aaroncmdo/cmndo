// AAR-61: Mitarbeiter-Portal Layout mit Sidebar
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogOutIcon } from 'lucide-react'
import MitarbeiterNav from './_components/MitarbeiterNav'
import TasksPill from '@/components/shared/TasksPill'
import UpdatesNav from '@/components/shared/updates'
import { roleToPath } from '@/lib/auth/role-redirect'

export default async function MitarbeiterLayout({
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

  // AAR-718: Eingeloggte User mit anderer Rolle in ihr eigenes Portal statt
  // auf /login.
  if (!profile || !['kundenbetreuer', 'dispatch', 'admin'].includes(profile.rolle)) {
    redirect(profile?.rolle ? roleToPath(profile.rolle as string) : '/login')
  }

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  // Unread Nachrichten fuer Sidebar-Badge (non-critical)
  let unread = 0
  try {
    const { count } = await supabase
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('gelesen', false)
      .neq('sender_id', user.id)
    unread = count ?? 0
  } catch { /* */ }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="glass-dark shadow-ios-md px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span>
          </span>
          {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
          <TasksPill userId={user.id} href="/mitarbeiter/tasks" />
        </div>
        <div className="flex items-center gap-3">
          <UpdatesNav variant="dark" />
          <span className="text-[#7BA3CC] text-sm">{displayName}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-claimondo-light-blue hover:text-white transition-colors">
              <LogOutIcon className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>
      <div className="flex">
        <MitarbeiterNav unreadNachrichten={unread} />
        <main className="flex-1 px-4 py-6 md:w-[96%] md:mx-auto md:px-0">{children}</main>
      </div>
      {/* Globaler Posteingang + Pinned-Chats — gleicher FAB den Admin/SV nutzen,
          damit KB Chats genauso anpinnen + parallel offen halten kann. */}
      <GlobalPosteingangFab currentUserId={user.id} />
    </div>
  )
}
