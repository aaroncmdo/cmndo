import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import Image from 'next/image'
import Link from 'next/link'
import { LogOutIcon } from 'lucide-react'
import UpdatesNav from '@/components/shared/updates'
import { MitteilungenProvider } from '@/components/mitteilungszentrale/MitteilungenProvider'
// SupportButton: Dead-Import entfernt (AAR-prod-cj-fix-01) — wird im JSX nicht gerendert.
import KundeNav from './_components/KundeNav'
import KundenbetreuerCard from './_components/KundenbetreuerCard'
import GutachterCard from './_components/GutachterCard'
import EskalierterAdminCard from './_components/EskalierterAdminCard'
import LexDriveCard from './_components/LexDriveCard'
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
  // 2026-05-14: PUBLIC-Pfad-Bypass — /kunde/re-termin/[token] ist per Spec
  // (CMM-40) eine öffentliche Seite die per Magic-Link-Reminder aus
  // /api/cron/no-show-timeout aufgerufen wird (vor Login). Der Layout-Auth-
  // Gate führte dort zu /login-Redirect → Magic-Link-Empfänger landeten auf
  // Login statt Slot-Picker. Routing unter /kunde/ bleibt aus historischen
  // Gründen; nur die Auth wird hier übersprungen, kein Sidebar-Wrapper.
  const hEarly = await headers()
  const pathnameEarly = hEarly.get('x-pathname') ?? hEarly.get('x-next-url') ?? hEarly.get('x-invoke-path') ?? ''
  const isPublicReTermin = pathnameEarly.includes('/kunde/re-termin/')
  if (isPublicReTermin) {
    return <>{children}</>
  }

  // K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard zentralisiert.
  const { user, profile } = await requirePortalAccess(['kunde'])

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
  // CMM-44 SP-B PR2a: onboarding_complete lebt auf claims (SSoT) — Query via
  // claims!inner-Join. Fallback auf claims.onboarding_complete=false.
  const h = await headers()
  const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''

  // CMM-63 PR3: Owned Faelle EINMAL via getKundeFaelle (claim_parties-Ownership,
  // newest-first) laden — ersetzt die verstreuten faelle.kunde_id-Reads (Onboarding-
  // Check, Sprache, KB/SV/Eskaliert) durch Ableitungen aus dieser einen Liste.
  // AAR-prod-cj-fix-01: createAdminClient() wirft ohne SERVICE_ROLE_KEY → try/catch,
  // damit das Layout ohne Sidebar-Cards rendert statt in die Root-Error-Boundary.
  let adminForNav: ReturnType<typeof createAdminClient> | null = null
  let navFaelle: Awaited<ReturnType<typeof getKundeFaelle>> = []
  try {
    adminForNav = createAdminClient()
    navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
  } catch (err) {
    console.error('[kunde/layout] adminForNav init fehlgeschlagen:', err)
  }

  // Onboarding-Redirect pro Fall: sobald ein owned Fall onboarding_complete=false hat.
  // CMM-63 PR3: aus navFaelle (claims.onboarding_complete, SSoT) statt faelle.kunde_id-Read.
  if (!pathname.includes('/onboarding') && !pathname.includes('/passwort-aendern')) {
    if (navFaelle.some((f) => f.onboarding_complete === false)) redirect('/kunde/onboarding')
  }

  const displayName = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Kunde'
  const initials = [profile?.vorname?.[0], profile?.nachname?.[0]].filter(Boolean).join('').toUpperCase() || 'K'

  // AAR-316 W3: Sprache des Kunden aus seinem neuesten Fall laden.
  // Profile hat keine eigene Sprache — der Fall trägt sie aus leads.sprache.
  // CMM-44 SP-B PR2a: sprache lebt auf claims (SSoT) — via claims!inner-Embed.
  // CMM-63 PR3: Sprache aus dem neuesten owned Fall (navFaelle[0]) → claims.sprache
  // (SSoT) via Admin, statt faelle.kunde_id-Read. created_at-Order liegt in getKundeFaelle.
  let kundenSprache: SpracheCode = 'de'
  const neuesterClaimId = navFaelle[0]?.claim_id ?? null
  if (adminForNav && neuesterClaimId) {
    const { data: spracheRow } = await adminForNav
      .from('claims')
      .select('sprache')
      .eq('id', neuesterClaimId)
      .maybeSingle()
    kundenSprache = ((spracheRow?.sprache as string | null) ?? 'de') as SpracheCode
  }

  // CMM-28/CMM-63: Single-Fall-Nav. navFaelle ist oben (vor dem Onboarding-Check)
  // bereits via getKundeFaelle geladen (claim_parties-Ownership, einmalige Wahrheit).
  const singleFallId = navFaelle.length === 1 ? navFaelle[0].id : null
  // CMM-63 Route-Key-Switch: der Nav-Link „Mein Fall" zeigt auf die claim_id
  // (neuer Route-Key). Der faelle.id-Wert (singleFallId) bleibt für die
  // Kontakt-Cards (Chat-Default → nachrichten.fall_id) erhalten.
  const singleRouteId =
    navFaelle.length === 1 ? (navFaelle[0].claim_id ?? navFaelle[0].id) : null

  // Kundenbetreuer-Card-Daten: KB des neusten aktiven Falls.
  let kbCard: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    avatarUrl: string | null
    rolle: string | null
  } | null = null
  if (adminForNav && navFaelle.length > 0) {
    // CMM-44 SP-A: kundenbetreuer_id ist eine faelle<->claims-Duplikat-Spalte
    // → über den claims-Embed lesen + filtern (SSoT). !inner erzwingt, dass
    // nur Faelle mit verknuepftem Claim und gesetztem KB zurueckkommen.
    // CMM-63 PR3: KB des neuesten owned Falls aus navFaelle (kundenbetreuer_id, SSoT)
    // statt faelle.kunde_id-Read. navFaelle ist newest-first → find = neuester mit KB.
    const kbId = (navFaelle.find((f) => f.kundenbetreuer_id)?.kundenbetreuer_id as string | null) ?? null
    if (kbId) {
      const { data: kbProfile } = await adminForNav
        .from('profiles')
        .select('vorname, nachname, telefon, avatar_url, rolle')
        .eq('id', kbId)
        .maybeSingle()
      if (kbProfile) {
        kbCard = {
          id: kbId,
          vorname: (kbProfile.vorname as string | null) ?? null,
          nachname: (kbProfile.nachname as string | null) ?? null,
          telefon: (kbProfile.telefon as string | null) ?? null,
          avatarUrl: (kbProfile.avatar_url as string | null) ?? null,
          rolle: (kbProfile.rolle as string | null) ?? null,
        }
      }
    }
  }

  // Eskalierter Admin (read-only Card)
  let adminCard: {
    id: string
    vorname: string | null
    nachname: string | null
    avatarUrl: string | null
  } | null = null
  if (adminForNav && navFaelle.length > 0) {
    // CMM-44 SP-B PR2a: eskaliert_an_admin_id lebt auf claims (SSoT) — via
    // claims!inner-Join lesen + auf der claims-Seite filtern.
    // CMM-63 PR3: eskaliert_an_admin_id aus claims (SSoT) via owned claim_ids
    // (navFaelle) statt faelle.kunde_id-Read.
    const ownedClaimIds = navFaelle.map((f) => f.claim_id).filter(Boolean) as string[]
    let adminId: string | null = null
    if (ownedClaimIds.length > 0) {
      const { data: eskClaim } = await adminForNav
        .from('claims')
        .select('eskaliert_an_admin_id')
        .in('id', ownedClaimIds)
        .not('eskaliert_an_admin_id', 'is', null)
        .limit(1)
        .maybeSingle()
      adminId = (eskClaim?.eskaliert_an_admin_id as string | null) ?? null
    }
    if (adminId) {
      const { data: adminProfile } = await adminForNav
        .from('profiles')
        .select('vorname, nachname, avatar_url')
        .eq('id', adminId)
        .maybeSingle()
      if (adminProfile) {
        adminCard = {
          id: adminId,
          vorname: (adminProfile.vorname as string | null) ?? null,
          nachname: (adminProfile.nachname as string | null) ?? null,
          avatarUrl: (adminProfile.avatar_url as string | null) ?? null,
        }
      }
    }
  }

  // Fall-Options für den Bezug-Picker im Chat-Modal.
  const fallOptionsForChat = navFaelle.map((f) => ({
    id: f.id as string,
    claim_nummer: (f.claim_nummer as string | null) ?? null,
  }))

  // Gutachter-Card-Daten
  let svCard: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    avatarUrl: string | null
    googleDurchschnitt: number | null
    googleAnzahl: number | null
    googleAktualisiertAm: string | null
  } | null = null
  if (adminForNav && navFaelle.length > 0) {
    // CMM-63 PR3: SV des neuesten owned Falls aus navFaelle (sv_id) statt faelle.kunde_id-Read.
    const svId = (navFaelle.find((f) => f.sv_id)?.sv_id as string | null) ?? null
    if (svId) {
      const { data: svRow } = await adminForNav
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', svId)
        .maybeSingle()
      const svProfileId = (svRow?.profile_id as string | null) ?? null
      if (svProfileId) {
        const { data: profileRow } = await adminForNav
          .from('profiles')
          .select('vorname, nachname, avatar_url, anzeigename, telefon')
          .eq('id', svProfileId)
          .maybeSingle()
        if (profileRow) {
          const anzeige = (profileRow.anzeigename as string | null) ?? null
          const { data: bewertungRow } = await adminForNav
            .from('google_bewertungen_cache')
            .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
            .eq('profile_id', svProfileId)
            .maybeSingle()
          svCard = {
            id: svProfileId,
            vorname: anzeige ?? (profileRow.vorname as string | null) ?? null,
            nachname: null,
            telefon: (profileRow.telefon as string | null) ?? null,
            avatarUrl: (profileRow.avatar_url as string | null) ?? null,
            googleDurchschnitt: (bewertungRow?.durchschnitt as number | null) ?? null,
            googleAnzahl: (bewertungRow?.anzahl_bewertungen as number | null) ?? null,
            googleAktualisiertAm: (bewertungRow?.zuletzt_aktualisiert_am as string | null) ?? null,
          }
        }
      }
    }
  }

  // LexDrive-Card
  let lexdriveQr: { qrSvg: string; qrUrl: string } | null = null
  const hatVollmachtSigniertenFall = navFaelle.some(
    (f) => !!(f as { vollmacht_signiert_am?: string | null }).vollmacht_signiert_am,
  )
  if (hatVollmachtSigniertenFall) {
    const LEXDRIVE_WA = 'https://wa.me/4932221096850?text=' +
      encodeURIComponent('Hallo, ich habe eine Frage zu meinem Fall.')
    const { generateQrCodeSvg } = await import('@/lib/kanzlei/qr-code')
    const qrSvg = await generateQrCodeSvg(LEXDRIVE_WA, 240)
    if (qrSvg) lexdriveQr = { qrSvg, qrUrl: LEXDRIVE_WA }
  }

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
    <MitteilungenProvider>
    <div className="flex min-h-screen bg-claimondo-bg" style={themeStyle}>
      {/* Desktop Sidebar — hidden on mobile.
          iOS-Glass: glass-branded liefert backdrop-blur + border, der
          inline-backgroundColor ist auf 80% transluzent gesetzt damit
          die Brand-Farbe erhalten bleibt + der Blur Content unter sich
          weichzeichnen kann. */}
      <aside
        className="kunde-sidebar glass-branded hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 fixed top-0 left-0 h-screen z-40"
        style={{
          backgroundColor: `color-mix(in srgb, ${sidebarBg} 80%, transparent)`,
        }}
      >
        <div className="kunde-sidebar-rest px-5 py-5 transition-opacity duration-200">
          <Link href="/kunde" className="block">
            {branding.useBrand && branding.logoUrl ? (
              <div className="flex items-center justify-center">
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

        <KundeNav singleFallId={singleRouteId} />

        {/* Sidebar-Cards (KB / SV / Admin / LexDrive) — auf Desktop und im
            Mobile-Drawer identisch (sidebarCards-Fragment). */}
        {sidebarCards}

        {/* Profil-Klick + Support + Abmelden unten — Updates raus
            (kommt zurueck wenn B2B). */}
        <div className="kunde-sidebar-rest mt-auto px-3 pb-4 space-y-1 border-t border-white/10 pt-3 transition-opacity duration-200">
          <Link
            href="/kunde/profil"
            className="flex items-center gap-3 px-3 py-2 rounded-ios-lg hover:bg-white/5 transition-colors"
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
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm transition-colors w-full text-claimondo-light-blue hover:bg-white/5 hover:text-white"
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
            <div className="flex items-center">
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
        <KundeNav mobile singleFallId={singleRouteId} />
      </nav>
    </div>
    </MitteilungenProvider>
  )
}
