import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DispatchNav from './_components/DispatchNav'
import { PageContainer } from '@/components/PageContainer'

export default async function DispatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  // Nur dispatch + admin duerfen auf /dispatch/*
  if (!profile || !['dispatch', 'admin'].includes(profile.rolle)) {
    redirect('/login?error=Kein+Zugriff')
  }

  const initials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U'

  return (
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      <DispatchNav email={user.email ?? ''} initials={initials} />

      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <span className="text-[10px] uppercase tracking-wider text-[#7BA3CC] bg-[#1E3A5F] px-2 py-0.5 rounded">Dispatch</span>
        </header>

        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
