import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { roleToPath } from '@/lib/auth/role-redirect'
import Image from 'next/image'
import Link from 'next/link'
import UpdatesNav from '@/components/shared/updates'
import { SupportButton } from '@/components/support/SupportButton'
import KundeNav from './_components/KundeNav'
// AAR-363: Outbox-Badge für offline-wartende Uploads (Pflichtdokumente etc.)
import OutboxBadge from '@/components/offline/OutboxBadge'
// AAR-316 W3: Sprach-Banner mit Google-Translate-Fallback
import { SprachBanner } from '@/components/i18n/SprachBanner'
import type { SpracheCode } from '@/lib/i18n/sprach-banner'
// CMM-22: Persistenter Pflichtdaten-Banner — sichtbar solange offene
// Pflicht-Slots existieren, klick führt zurück in den Dokumente-Step.
import OffeneDatenBanner from '@/components/kunde/OffeneDatenBanner'
// AAR-536 (K4): SV-Branding im Kunde-Portal — nur bei verifiziertem SV.
import { resolveKundenTheme } from '@/lib/branding/kunden-theme'
import { generateCssVars } from '@/lib/branding/css-vars'

export default async function KundeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname, onboarding_completed_at')
    .eq('id', user.id)
    .single()

  // AAR-718: Eingeloggte User mit anderer Rolle in ihr eigenes Portal statt
  // auf /login — sonst wirkt die Seite „rausgeworfen".
  if (profile?.rolle !== 'kunde') redirect(roleToPath(profile?.rolle as string | null | undefined))

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

  // AAR-536 (K4): SV-Branding aufgelöst. `useBrand=true` nur wenn zugewiesener
  // SV verifiziert + use_custom_branding aktiv + Theme vorhanden.
  const branding = await resolveKundenTheme(user.id)
  const themeStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined
  // Sidebar: solid (keine Transparenz) — konsistent mit Admin/Dispatch.
  // Mobile Header + Bottom-Nav behalten glass-branded (Scroll-Kontext, iOS-Stil).
  const sidebarBg = branding.useBrand ? 'var(--brand-sidebar-bg, #0D1B3E)' : '#0D1B3E'
  const accentBg = branding.useBrand ? 'var(--brand-secondary, #4573A2)' : '#4573A2'

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]" style={themeStyle}>
      {/* Desktop Sidebar — hidden on mobile */}
      <aside
        className="hidden md:flex md:flex-col md:w-64 md:shrink-0 fixed top-0 left-0 h-screen z-40"
        style={{ backgroundColor: sidebarBg }}
      >
        <div className="px-5 py-5">
          <Link href="/kunde" className="block">
            {branding.useBrand && branding.logoUrl ? (
              <div className="bg-white rounded-lg p-2 flex items-center justify-center">
                <Image
                  src={branding.logoUrl}
                  alt={branding.firmenname ?? 'Logo'}
                  width={200}
                  height={48}
                  className="max-h-12 w-auto object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <span className="text-xl font-bold tracking-tight">
                <span className="text-white">Claim</span>
                <span style={{ color: accentBg }}>ondo</span>
              </span>
            )}
          </Link>
        </div>

        <KundeNav />

        {/* Profil + Notification unten */}
        <div className="mt-auto px-3 pb-4 space-y-2 border-t border-white/10 pt-3">
          <SupportButton userName={displayName} />
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: accentBg }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
            </div>
            <OutboxBadge />
            <UpdatesNav variant="dark" />
          </div>
        </div>
      </aside>

      {/* Mobile Header — hidden on desktop */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 shadow-ios-md glass-branded"
        style={{ backgroundColor: sidebarBg }}
      >
        <Link href="/kunde">
          {branding.useBrand && branding.logoUrl ? (
            <div className="bg-white rounded-md px-2 py-1 flex items-center">
              <Image
                src={branding.logoUrl}
                alt={branding.firmenname ?? 'Logo'}
                width={140}
                height={32}
                className="max-h-8 w-auto object-contain"
                unoptimized
              />
            </div>
          ) : (
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span style={{ color: accentBg }}>ondo</span>
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <OutboxBadge />
          <UpdatesNav variant="dark" />
        </div>
      </header>

      {/* Hauptinhalt — offset by sidebar on desktop, offset by header on mobile */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-6">
        {/* AAR-316 W3: Sprach-Banner rendert sich nur bei sprache !== 'de' */}
        <SprachBanner sprache={kundenSprache} />
        {/* CMM-22: Pflichtdaten-Banner — verschwindet automatisch wenn alle
            Pflicht-Slots erfüllt sind. Re-Engagement-Pfad in den Dokumente-
            Step zurück, dort liegt die Upload-Logik aus CMM-21.
            (AAR-710 hatte den alten Banner aus dem Layout entfernt — der war
            an pflichtdokumente-Status gebunden ohne Smart-Filter. CMM-22 nutzt
            jetzt die Claim-driven Logik aus data-requirements.ts.) */}
        <OffeneDatenBanner />
        {children}
      </main>

      {/* Mobile Bottom-Nav — hidden on desktop */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center glass-branded shadow-ios-md"
        style={{
          backgroundColor: sidebarBg,
          paddingTop: 8,
          paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        }}
      >
        <KundeNav mobile />
      </nav>
    </div>
  )
}
