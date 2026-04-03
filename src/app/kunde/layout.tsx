import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function KundeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'kunde') redirect('/login')

  return (
    <div className="w-full min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 bg-[#0D1B3E] shadow-md">
        <Link href="/kunde">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-[#4573A2]">ondo</span>
          </span>
        </Link>
      </header>

      {/* Content — full width, scrollable */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center bg-[#0D1B3E]"
        style={{ paddingTop: 8, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
        <NavItem href="/kunde" label="Start" />
        <NavItem href="/kunde/chat" label="Chat" />
        <NavItem href="/kunde/profil" label="Profil" />
      </nav>
    </div>
  )
}

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[48px] px-3 py-2 text-[#7BA3CC] hover:text-white transition-colors">
      <span className="text-xs font-medium">{label}</span>
    </Link>
  )
}
