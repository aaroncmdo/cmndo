import Image from 'next/image'
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
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/claimondo-logo.svg" alt="Claimondo" width={130} height={36} unoptimized priority />
          <Link href="/mitarbeiter/performance" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm transition-colors">
            <BarChart3Icon className="w-4 h-4" /> Meine Performance
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">{displayName}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="button" className="text-gray-500 hover:text-gray-700 transition-colors">
              <LogOutIcon className="w-4 h-4" />
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
