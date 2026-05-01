import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { roleToPath } from '@/lib/auth/role-redirect'
import Image from 'next/image'
import Link from 'next/link'
import { LogOutIcon } from 'lucide-react'
import UpdatesNav from '@/components/shared/updates'
import { SupportButton } from '@/components/support/SupportButton'
import KundeNav from './_components/KundeNav'
import KundenbetreuerCard from './_components/KundenbetreuerCard'
// CMM-28: Loader für singleFallId-Resolution in der Nav.
import { getKundeFaelle } from '@/lib/claims/get-kunde-faelle'
// AAR-363: Outbox-Badge für offline-wartende Uploads (Pflichtdokumente etc.)
import OutboxBadge from '@/components/offline/OutboxBadge'
// AAR-316 W3: Sprach-Banner mit Google-Translate-Fallback
import { SprachBanner } from '@/components/i18n/SprachBanner'
import type { SpracheCode } from '@/lib/i18n/sprach-banner'
// CMM-22 / CMM-33: Globaler OffeneDatenBanner ist raus — Pflichtdokumente
// haben jetzt einen dedizierten Banner-Click-Tile in der Fall-Detail-Page,
// das Pop-over übernimmt den Upload-Flow.
// AAR-536 (K4): SV-Branding im Kunde-Portal — nur bei verifiziertem SV.
import { resolveKundenTheme } from '@/lib/branding/kunden-theme'
import { generateCssVars } from '@/lib/branding/css-vars'

export default async function KundeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  // AAR-718: Eingeloggte User mit anderer Rolle in ihr eigenes Portal statt
  // auf /login — sonst wirkt die Seite „rausgeworfen".
  if (profile?.rolle !== 'kunde') redirect(roleToPath(profile?.rolle as string | null | undefined))

  // Onboarding-Redirect ist jetzt pro Fall (nicht mehr pro User-Profil).
  // Sobald ein Fall onboarding_complete=false hat, soll der Kunde dorthin —
  // egal ob er für einen früheren Fall schon mal durchgelaufen ist.
  const h = await headers()
  const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
  if (!pathname.includes('/onboarding') && !pathname.includes('/passwort-aendern')) {
    const { data: incompleteFall } = await supabase
      .from('faelle')
      .select('id')
      .eq('kunde_id', user.id)
      .eq('onboarding_complete', false)
      .limit(1)
      .maybeSingle()
    if (incompleteFall) redirect('/kunde/onboarding')
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

  // CMM-28: Fall-Anzahl für die Nav. Bei Single-Fall-Kunden zeigt KundeNav
  // „Mein Fall" + linked direkt zur Detail-Page (kein Listen-Zwischenschritt).
  // Loader nutzt claim_parties + faelle.kunde_id + lead.email — derselbe Pfad
  // den Dashboard und Listen-Page nutzen, also einmalige Wahrheit.
  const adminForNav = createAdminClient()
  const navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
  const singleFallId = navFaelle.length === 1 ? navFaelle[0].id : null

  // Kundenbetreuer-Card-Daten: KB des neusten aktiven Falls. Sticky-KB-Logik
  // sorgt dafür dass der Kunde über alle Fälle hinweg denselben KB hat —
  // wir zeigen also einfach den KB des ersten Treffers.
  let kbCard: {
    vorname: string | null
    nachname: string | null
    telefon: string | null
    avatarUrl: string | null
    chatHref: string
  } | null = null
  if (navFaelle.length > 0) {
    const { data: kbFall } = await adminForNav
      .from('faelle')
      .select('id, kundenbetreuer_id')
      .eq('kunde_id', user.id)
      .not('kundenbetreuer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const kbId = (kbFall?.kundenbetreuer_id as string | null) ?? null
    if (kbId) {
      const { data: kbProfile } = await adminForNav
        .from('profiles')
        .select('vorname, nachname, telefon, avatar_url')
        .eq('id', kbId)
        .maybeSingle()
      if (kbProfile) {
        // Chat-Drawer iframed /kunde/chat (?fall= scoped). Keine Tab-URL,
        // damit das Iframe nicht den ganzen Layout-Frame nochmal lädt.
        const fallChatBase = singleFallId
          ? `/kunde/chat?fall=${singleFallId}`
          : '/kunde/chat'
        kbCard = {
          vorname: (kbProfile.vorname as string | null) ?? null,
          nachname: (kbProfile.nachname as string | null) ?? null,
          telefon: (kbProfile.telefon as string | null) ?? null,
          avatarUrl: (kbProfile.avatar_url as string | null) ?? null,
          chatHref: fallChatBase,
        }
      }
    }
  }

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

        <KundeNav singleFallId={singleFallId} />

        {/* KB-Card direkt über Profil/Logout */}
        {kbCard && (
          <KundenbetreuerCard
            vorname={kbCard.vorname}
            nachname={kbCard.nachname}
            telefon={kbCard.telefon}
            avatarUrl={kbCard.avatarUrl}
            chatHref={kbCard.chatHref}
            accentBg={accentBg}
          />
        )}

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
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-[#7BA3CC] hover:bg-white/5 hover:text-white"
            >
              <LogOutIcon style={{ width: 17, height: 17 }} />
              Abmelden
            </button>
          </form>
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
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-[#7BA3CC] hover:text-white p-1.5"
              aria-label="Abmelden"
            >
              <LogOutIcon style={{ width: 18, height: 18 }} />
            </button>
          </form>
        </div>
      </header>

      {/* Hauptinhalt — offset by sidebar on desktop, offset by header on mobile */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-6">
        {/* AAR-316 W3: Sprach-Banner rendert sich nur bei sprache !== 'de' */}
        <SprachBanner sprache={kundenSprache} />
        {/* CMM-33: Globaler Pflichtdaten-Banner ist raus — die Detail-Page
            hat einen eigenen Banner-Click-Tile mit Pop-over (PflichtdokumenteSection
            variant=banner). Doppel-Banner war redundant. */}
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
        <KundeNav mobile singleFallId={singleFallId} />
      </nav>
    </div>
  )
}
