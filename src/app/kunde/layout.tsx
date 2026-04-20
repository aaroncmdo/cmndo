import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import NotificationBell from '@/app/admin/_components/NotificationBell'
import { SupportButton } from '@/components/support/SupportButton'
import KundeNav from './_components/KundeNav'
// AAR-363: Outbox-Badge für offline-wartende Uploads (Pflichtdokumente etc.)
import OutboxBadge from '@/components/offline/OutboxBadge'
// AAR-316 W3: Sprach-Banner mit Google-Translate-Fallback
import { SprachBanner } from '@/components/i18n/SprachBanner'
import type { SpracheCode } from '@/lib/i18n/sprach-banner'
// AAR-354: Persistenter Pflichtdokumente-Banner (offene Pflicht-Slots)
import { PflichtdokumenteBanner } from '@/components/kunde/PflichtdokumenteBanner'

export default async function KundeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, onboarding_completed_at')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'kunde') redirect('/login')

  // AAR-100: Onboarding-Redirect wenn noch nicht abgeschlossen
  const h = await headers()
  const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
  if (!profile?.onboarding_completed_at && !pathname.includes('/onboarding') && !pathname.includes('/passwort-aendern')) {
    redirect('/kunde/onboarding')
  }

  const displayName = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Kunde'
  const initials = [profile?.vorname?.[0], profile?.nachname?.[0]].filter(Boolean).join('').toUpperCase() || 'K'

  // AAR-316 W3: Sprache des Kunden aus seinem neuesten Fall laden.
  // Profile hat keine eigene Sprache — der Fall trägt sie aus leads.sprache.
  const { data: fallSprache } = await supabase
    .from('faelle')
    .select('sprache')
    .eq('kunde_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const kundenSprache = ((fallSprache?.sprache as string | null) ?? 'de') as SpracheCode

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
          <SupportButton userName={displayName} />
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#4573A2] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
            </div>
            <OutboxBadge />
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
        <div className="flex items-center gap-2">
          <OutboxBadge />
          <NotificationBell />
        </div>
      </header>

      {/* Hauptinhalt — offset by sidebar on desktop, offset by header on mobile */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-6">
        {/* AAR-316 W3: Sprach-Banner rendert sich nur bei sprache !== 'de' */}
        <SprachBanner sprache={kundenSprache} />
        {/* AAR-354: Banner rendert sich nur wenn offene Pflichtdokumente existieren.
            Nicht im /onboarding anzeigen — dort ist der Upload-Flow bereits zentral. */}
        {!pathname.includes('/onboarding') && <PflichtdokumenteBanner />}
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
