import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { roleToPath } from '@/lib/auth/role-redirect'
import Image from 'next/image'
import Link from 'next/link'
import UpdatesNav from '@/components/shared/updates'
import { SupportButton } from '@/components/support/SupportButton'
import KundeNav from './_components/KundeNav'
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

// Layout zeigt Kontextdaten (KB-/SV-Card, LexDrive-QR-Card) die sich nach
// Vollmacht-Bestaetigung aendern — dynamisch rendern, damit
// router.refresh() neue Daten holt.
export const dynamic = 'force-dynamic'

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

  // AAR-kunde-onboarding-claim: claimFaelleByEmail einmal im Layout
  // aufrufen — deckt alle /kunde/* Pages ab. Sonst muss der User „einmal
  // reloaden" wenn er via Magic-Link direkt auf /kunde/onboarding landet,
  // weil der Fall bis zum ersten Aufruf von /kunde noch kunde_id=NULL hat
  // → Page findet nichts → redirect zu /kunde → claim → Layout redirected
  // zurück zu /kunde/onboarding → erst dann rendert der Wizard.
  if (user.email) {
    try {
      const { claimFaelleByEmail } = await import('@/lib/kunde/auto-claim')
      await claimFaelleByEmail(createAdminClient(), user.id, user.email)
    } catch {
      /* non-critical — Page-Loader fängt fehlende Fälle ab */
    }
  }

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

  // AAR-536 (K4): SV-Branding aufgelöst. `useBrand=true` nur wenn zugewiesener
  // SV verifiziert + use_custom_branding aktiv + Theme vorhanden.
  const branding = await resolveKundenTheme(user.id)
  const themeStyle = branding.useBrand ? generateCssVars(branding.theme, 'full') : undefined
  // Sidebar: solid (keine Transparenz) — konsistent mit Admin/Dispatch.
  // Mobile Header + Bottom-Nav behalten glass-branded (Scroll-Kontext, iOS-Stil).
  const sidebarBg = branding.useBrand ? 'var(--brand-sidebar-bg, #0D1B3E)' : '#0D1B3E'
  const accentBg = branding.useBrand ? 'var(--brand-secondary, #4573A2)' : '#4573A2'

  // Sidebar-Cards (KB / SV / Admin / LexDrive) als wiederverwendbares Fragment.
  // Wird sowohl in der Desktop-Sidebar gerendert als auch in den Mobile-Drawer
  // durchgereicht, damit der Kunde auf Mobile dieselben Kontakt-Cards sieht.
  const sidebarCards = (
    <>
      {lexdriveQr && (
        <LexDriveCard
          qrSvg={lexdriveQr.qrSvg}
          qrUrl={lexdriveQr.qrUrl}
          accentBg={accentBg}
        />
      )}
      {svCard && (
        <GutachterCard
          vorname={svCard.vorname}
          nachname={svCard.nachname}
          telefon={svCard.telefon}
          avatarUrl={svCard.avatarUrl}
          googleDurchschnitt={svCard.googleDurchschnitt}
          googleAnzahl={svCard.googleAnzahl}
          googleAktualisiertAm={svCard.googleAktualisiertAm}
          accentBg={accentBg}
          fallId={singleFallId}
          currentUserId={user.id}
          svUserId={svCard.id}
          kbUserId={kbCard?.id ?? null}
          kbName={kbCard ? [kbCard.vorname, kbCard.nachname].filter(Boolean).join(' ') || null : null}
          kbAvatarUrl={kbCard?.avatarUrl ?? null}
          adminUserId={adminCard?.id ?? null}
          adminName={adminCard ? [adminCard.vorname, adminCard.nachname].filter(Boolean).join(' ') || null : null}
          adminAvatarUrl={adminCard?.avatarUrl ?? null}
          fallOptions={fallOptionsForChat}
        />
      )}
      {kbCard && (
        <KundenbetreuerCard
          vorname={kbCard.vorname}
          nachname={kbCard.nachname}
          telefon={kbCard.telefon}
          avatarUrl={kbCard.avatarUrl}
          accentBg={accentBg}
          fallId={singleFallId}
          currentUserId={user.id}
          kbUserId={kbCard.id}
          kbRolle={kbCard.rolle}
          adminUserId={adminCard?.id ?? null}
          adminName={adminCard ? [adminCard.vorname, adminCard.nachname].filter(Boolean).join(' ') || null : null}
          adminAvatarUrl={adminCard?.avatarUrl ?? null}
          fallOptions={fallOptionsForChat}
        />
      )}
      {adminCard && (
        <EskalierterAdminCard
          vorname={adminCard.vorname}
          nachname={adminCard.nachname}
          avatarUrl={adminCard.avatarUrl}
          accentBg={accentBg}
        />
      )}
    </>
  )

  return (
    <div className="flex min-h-screen bg-claimondo-bg" style={themeStyle}>
      {/* Desktop Sidebar — hidden on mobile */}
      <aside
        className="kunde-sidebar hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 fixed top-0 left-0 h-screen z-40"
        style={{ backgroundColor: sidebarBg }}
      >
        <div className="kunde-sidebar-rest px-5 py-5 transition-opacity duration-200">
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

        {/* Sidebar-Cards (KB / SV / Admin / LexDrive) — auf Desktop und im
            Mobile-Drawer identisch (sidebarCards-Fragment). */}
        {sidebarCards}

        {/* Profil-Klick + Support + Abmelden unten — Updates raus
            (kommt zurueck wenn B2B). */}
        <div className="kunde-sidebar-rest mt-auto px-3 pb-4 space-y-1 border-t border-white/10 pt-3 transition-opacity duration-200">
          <Link
            href="/kunde/profil"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: accentBg }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{displayName}</p>
              <p className="text-[10px] text-claimondo-light-blue leading-tight">Profil ansehen</p>
            </div>
            <OutboxBadge />
            <UpdatesNav variant="dark" />
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full text-claimondo-light-blue hover:bg-white/5 hover:text-white"
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
        <Link href="/kunde" className="flex-shrink-0 min-w-0">
          {branding.useBrand && branding.logoUrl ? (
            <div className="bg-white rounded-md px-2 py-1 flex items-center">
              <Image
                src={branding.logoUrl}
                alt={branding.firmenname ?? 'Logo'}
                width={140}
                height={32}
                className="max-h-8 w-auto max-w-[140px] object-contain"
                unoptimized
              />
            </div>
          ) : (
            <span className="text-xl font-bold tracking-tight whitespace-nowrap">
              <span className="text-white">Claim</span>
              <span style={{ color: accentBg }}>ondo</span>
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <OutboxBadge />
          <UpdatesNav variant="dark" />
        </div>
      </header>

      {/* Hauptinhalt — offset by sidebar on desktop, offset by header on mobile */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 pb-20 lg:pb-6 overflow-x-hidden">
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
