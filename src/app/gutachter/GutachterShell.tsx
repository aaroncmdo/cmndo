'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MapIcon,
  MapPinIcon,
  FolderOpenIcon,
  CalendarIcon,
  ReceiptIcon,
  BarChart3Icon,
  UserIcon,
  SettingsIcon,
  LogOutIcon,
  UsersIcon,
  TrophyIcon,
  InboxIcon,
  EuroIcon,
  AlertCircleIcon,
  ClipboardListIcon,
  FileSignatureIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import UpdatesNav from '@/components/shared/updates'
import { MitteilungenProvider } from '@/components/mitteilungszentrale/MitteilungenProvider'
import OutboxBadge from '@/components/offline/OutboxBadge'
import { SupportButton } from '@/components/support/SupportButton'
import { SupportSidebarPanel } from '@/components/support/SupportSidebarPanel'
import TasksPill from '@/components/shared/TasksPill'
import { CLAIMONDO_DEFAULT_THEME, type BrandTheme } from '@/lib/branding/theme'
import { generateCssVars } from '@/lib/branding/css-vars'
import { FONT_PAIRS, CLAIMONDO_DEFAULT_FONT_PAIR_ID, buildGoogleFontsUrl } from '@/lib/branding/fonts'
import { useFloatingSidebar } from '@/lib/branding/use-floating-sidebar'
import GutachterMobileTabBar from './GutachterMobileTabBar'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import SVSpotlight from './_components/SVSpotlight'
import WeatherBanner from '@/components/shared/WeatherBanner'
import { toInitials } from '@/components/shared/KundeAvatar'
// CMM-36: Geo-Tracking startet beim App-Öffnen
import { useGeoPosition } from '@/hooks/useGeoPosition'

// AAR-222: Sidebar-Refactor von 18 flachen Items auf 10 in 4 Sektionen.
// Removed Items (Dashboard, Mitteilungen, Tasks, Stellungnahmen, Termine,
// Route) bleiben als Routes erreichbar (Bookmarks brechen nicht), tauchen
// aber nicht mehr in der Navigation auf — Inhalte sind in Heute/Fälle/
// Kalender bzw. die Notification-Glocke integriert (siehe einzelne Tickets
// für die Page-Merges).
type NavItem = {
  href: string
  label: string
  icon: typeof MapPinIcon
  // badge: optional Render-Funktion die einen Counter zurückgibt
  badgeKey?: 'auftraege' | 'posteingang' | 'neueTermine'
  // Markiert Items die noch im Beta-Status sind (Statistiken etc.).
  beta?: boolean
}

type NavSection = {
  title: string
  items: NavItem[]
}

// 2026-05-07 Design-Review: Vorher 3 Sektionen (Tagesgeschäft / Finanzen /
// Verwaltung) — der Reviewer fand die Trennung Finanzen-vs-Verwaltung unklar
// (Vertrag und Abrechnung gehören thematisch zusammen). Jetzt 2 Sektionen
// (Tagesgeschäft / Geschäft); Konfiguration (Profil/Einstellungen) lebt im
// Sidebar-Footer-Block. Kommunikations-Sektion bleibt entfällt (AAR-727).
const NAV_SECTIONS_BASE: NavSection[] = [
  {
    title: 'Tagesgeschäft',
    items: [
      { href: '/gutachter/heute', label: 'Heute', icon: MapPinIcon },
      { href: '/gutachter/auftraege', label: 'Aufträge', icon: ClipboardListIcon, badgeKey: 'auftraege' },
      { href: '/gutachter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
      { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon, badgeKey: 'neueTermine' },
    ],
  },
  // AAR-727: Kommunikations-Sektion entfällt — der GlobalPosteingangFab
  // (unten rechts) deckt Fall-Chat-Nachrichten global ab. System-Mitteilungen
  // laufen über UpdatesNav. /gutachter/posteingang bleibt als Route erhalten
  // (Legacy-Bookmarks), taucht aber nicht mehr in der Sidebar auf.
  {
    title: 'Finanzen',
    items: [
      // AAR-244: Lead-Preise als Tab in Abrechnung integriert (kein eigener
      // Nav-Punkt mehr). Route /gutachter/leadpreise bleibt für Bookmarks.
      { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
    ],
  },
  {
    title: 'Verwaltung',
    items: [
      // CMM-17: 'Mein Gebiet' aus Nav entfernt — Aaron-Spec, kommt später als
      // eigenes Feature-Ticket zurück.
      { href: '/gutachter/vertrag', label: 'Vertrag', icon: FileSignatureIcon },
      { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
      { href: '/gutachter/statistiken', label: 'Statistiken', icon: BarChart3Icon, beta: true },
      { href: '/gutachter/reklamationen', label: 'Reklamationen', icon: AlertCircleIcon },
    ],
  },
]

// AAR-809: Wetter-Logik raus in components/shared/WeatherBanner.

export default function GutachterShell({
  displayName,
  userId,
  children,
  logoUrl,
  brandTheme,
  firmenname,
  standortLat,
  standortLng,
  showTeam,
  showCommunity,
  showVerifizierung,
  svId,
}: {
  displayName: string
  userId: string
  children: React.ReactNode
  logoUrl?: string | null
  // AAR-220: Vollständiges Theme oder null (= Claimondo-Default).
  brandTheme?: BrandTheme | null
  // AAR-220: Firmenname für Logo-Alt-Text (Accessibility + SEO).
  firmenname?: string | null
  standortLat?: number | null
  standortLng?: number | null
  // KFZ-152 Phase 2+3: conditional Nav fuer Team (Inhaber/Verwalter)
  // und Community (Member).
  showTeam?: boolean
  showCommunity?: boolean
  // AAR-359 W5: conditional Verifizierungs-Link solange Verifizierung offen.
  showVerifizierung?: boolean
  // CMM-36: SV-ID für Geo-Tracking
  svId?: string | null
}) {
  const pathname = usePathname()
  // Feldmodus übernimmt den vollen Viewport — Sidebar + FAB ausblenden damit
  // sie nicht über der Mapbox-Karte rendern (Sidebar hat lg:z-[1100] > z-50).
  const isFeldmodus = pathname.startsWith('/gutachter/feldmodus')
  // 2026-05-14 Mobile-Cockpit: /heute (+ Index /gutachter) ist der Map-First-
  // Cockpit-Screen — dort soll die Map unter die Header-Capsule bluten, also
  // KEIN top-padding auf <main>. Alle anderen Routen (List-Views, Detail-
  // Pages) brauchen pt = floating-header-Höhe damit der Content nicht
  // dahinter verschwindet, und sie zeigen KEINE schwebende Wetter-Capsule
  // (auf Listen ist Wetter Lärm — Cockpit-Information gehört auf /heute).
  const isCockpitRoute = pathname === '/gutachter' || pathname === '/gutachter/heute'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSupport, setShowSupport] = useState(false)

  // 2026-05-14: Floating-Sidebar via shared Hook — gleiche Präferenz gilt
  // app-weit (Admin/Dispatch/Kanzlei/Kunde via PortalNav/KundeLayout). Opt-out
  // über ?sidebar=bar.
  const floatingMode = useFloatingSidebar()
  // CMM-36: Geo-Tracking beim App-Öffnen starten
  useGeoPosition(svId ?? null)
  // AAR-245: Verwaltung nicht mehr collapsible — alle Sektionen flach +
  // direkt sichtbar, konsistent zu Tagesgeschäft/Kommunikation/Finanzen.
  // AAR-222: Sektions-basierte Nav. Team/Community werden conditional in
  // Verwaltung eingehängt.
  // 2026-05-07: Conditional Items laufen jetzt in den Geschäft-Block (vorher
  // Verwaltung). Verifizierung steht ganz oben weil Pre-Aktiv-Pfad, dann
  // Vertrag/Abrechnung/Statistik/Reklamation, dann Team/Community.
  const NAV_SECTIONS: NavSection[] = NAV_SECTIONS_BASE.map(sec => {
    if (sec.title !== 'Geschäft') return sec
    const before: NavItem[] = []
    if (showVerifizierung) before.push({ href: '/gutachter/verifizierung', label: 'Verifizierung', icon: ShieldCheckIcon })
    const after: NavItem[] = []
    if (showTeam) after.push({ href: '/gutachter/team', label: 'Team', icon: UsersIcon })
    if (showCommunity) after.push({ href: '/gutachter/community', label: 'Community', icon: TrophyIcon })
    return { ...sec, items: [...before, ...sec.items, ...after] }
  })

  // AAR-220: Vollständiges Theme via CSS-Vars + EINMALIGE 2s-Transition.
  // Die Transition wird NUR aktiv wenn der User gerade ein neues Logo
  // hochgeladen hat (localStorage-Flag 'brand-just-changed'). Bei normalem
  // Navigieren gibt es keine Transition — sonst würde jeder Page-Load
  // flackern.
  const theme: BrandTheme = brandTheme ?? CLAIMONDO_DEFAULT_THEME
  const useBrand = !!brandTheme
  // AAR-424: Alle 25 V2-CSS-Vars (inkl. der V1-Aliase --brand-primary,
  // --brand-sidebar-bg, --brand-surface, --brand-text-on-primary) — dadurch
  // stehen jetzt auch --brand-success/--brand-text-muted/etc. allen Children
  // der Shell zur Verfügung ohne dass einzelne Consumer das Theme re-importieren.
  const themeVars = generateCssVars(theme, 'full')

  // 2026-05-14: Brand-Font binding. Wenn brand_theme.fontPairId gesetzt ist,
  // lade die Google-Fonts und setze --brand-font-heading / --brand-font-body
  // als CSS-Vars auf den Shell-Wrapper. Sidebar + Header übernehmen das via
  // `font-family: var(--brand-font-heading, inherit)` im JSX unten.
  const fontPairId = (theme as { fontPairId?: string | null }).fontPairId
    ?? CLAIMONDO_DEFAULT_FONT_PAIR_ID
  const fontPair = useBrand ? (FONT_PAIRS[fontPairId] ?? FONT_PAIRS[CLAIMONDO_DEFAULT_FONT_PAIR_ID]) : null
  const fontVars: React.CSSProperties = fontPair
    ? ({
        '--brand-font-heading': fontPair.cssStack.heading,
        '--brand-font-body': fontPair.cssStack.body,
      } as React.CSSProperties)
    : {}
  const fontHref = fontPair ? buildGoogleFontsUrl(fontPair) : null

  // CMM-32 P2 / AAR-864: --app-sidebar-width = Sidebar-Breite + lg-Padding
  // (256px Sidebar + 16px pl-4 = 272px). Damit startet ein portal-rendered
  // Modal (Modal.web.tsx) bündig am inneren Wrapper-Rand und überdeckt nur
  // den Content-Bereich rechts. Auf Mobile (< lg) ist die Sidebar weg → 0.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      document.documentElement.style.setProperty(
        '--app-sidebar-width',
        mql.matches ? '272px' : '0px',
      )
    }
    apply()
    mql.addEventListener('change', apply)
    return () => {
      mql.removeEventListener('change', apply)
      document.documentElement.style.removeProperty('--app-sidebar-width')
    }
  }, [])

  // AAR-220 Fix 5 / 2026-05-14: Einmalige 1.2s-Transition nach Logo-Upload.
  // Statt einzelner inline-transitions auf Wrapper-divs jetzt globales
  // data-brand-transition="on" auf <body> — eine globale CSS-Regel in
  // globals.css animiert alle Children gleichzeitig (siehe dort).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const flag = localStorage.getItem('brand-just-changed')
    if (!flag) return
    localStorage.removeItem('brand-just-changed')
    document.body.setAttribute('data-brand-transition', 'on')
    const t = setTimeout(() => {
      document.body.removeAttribute('data-brand-transition')
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  // AAR-809: Wetter-Fetch + Render → components/shared/WeatherBanner

  // AAR-370: Badge-Counter für Sidebar-Items.
  // - auftraege: Anzahl Fälle mit status='sv-zugewiesen' (noch nicht terminiert)
  // - posteingang: ungelesene gutachter_mitteilungen + ungelesene nachrichten
  //   gemeinsam als aggregierter Counter (Tabs Mitteilungen + Nachrichten).
  const [badgeCounts, setBadgeCounts] = useState<{ auftraege: number; posteingang: number; neueTermine: number }>({
    auftraege: 0,
    posteingang: 0,
    neueTermine: 0,
  })

  const loadBadges = useCallback(async () => {
    const supabase = createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return
    // AAR-222 Audit: Inhaber + Sub-Standort = mehrere SV-Rows → single() würde
    // werfen. Wir laden ALLE und nehmen die SV-IDs als Filter (Aufträge zählen
    // dann über alle Standorte des Users).
    const { data: svs } = await supabase
      .from('sachverstaendige')
      .select('id')
      .eq('profile_id', user.id)
    const svIds = (svs ?? []).map(s => s.id)
    if (svIds.length === 0) return

    // CMM-32f: Aufträge-Badge zählt aktive Aufträge bis QC-Freigabe — auf
    // auftraege-Sub-Entity migriert. Sobald gutachten_final_freigegeben=true
    // wandert der Fall in /gutachter/faelle (Regulierungs-Phase).
    const { count: auftraegeCount } = await supabase
      .from('auftraege')
      .select('id', { count: 'exact', head: true })
      .in('sv_id', svIds)
      .eq('gutachten_final_freigegeben', false)
      .eq('status', 'termin')

    // Posteingang Tab 1: ungelesene System-Mitteilungen über alle SV-Rows.
    const { count: mitteilungenCount } = await supabase
      .from('gutachter_mitteilungen')
      .select('id', { count: 'exact', head: true })
      .in('sv_id', svIds)
      .eq('gelesen', false)

    // Posteingang Tab 2: ungelesene Chat-Nachrichten.
    const { count: nachrichtenCount } = await supabase
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('empfaenger_id', user.id)
      .eq('gelesen', false)

    // AAR-724: Neue / ungesehene Termine (gesehen_am IS NULL) über alle
    // SV-Rows des Users.
    const { count: neueTermineCount } = await supabase
      .from('gutachter_termine')
      .select('id', { count: 'exact', head: true })
      .in('sv_id', svIds)
      .is('gesehen_am', null)

    setBadgeCounts({
      auftraege: auftraegeCount ?? 0,
      posteingang: (mitteilungenCount ?? 0) + (nachrichtenCount ?? 0),
      neueTermine: neueTermineCount ?? 0,
    })
  }, [])

  useEffect(() => {
    loadBadges()
    const supabase = createClient()
    const channel = supabase
      .channel('gutachter-sidebar-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auftraege' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nachrichten' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gutachter_mitteilungen' }, () => loadBadges())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gutachter_termine' }, () => loadBadges())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadBadges])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    if (href === '/gutachter') return pathname === '/gutachter'
    return pathname.startsWith(href)
  }

  return (
    <MitteilungenProvider>
    <div
      /* 2026-05-14 Mobile-Cockpit: BG bleibt brand-primary nur auf lg+ (rahmt
         die Desktop-Card-Sidebar). Auf Mobile setzen wir bg-claimondo-bg —
         dann gibt es keinen sichtbaren brand-Rahmen mehr um die Map/Content;
         die Glass-Header-Capsule + Tab-Bar tragen die Brand-Identität,
         Hintergrund bleibt visuell ruhig. */
      className="h-screen flex overflow-hidden bg-claimondo-bg lg:bg-[var(--brand-primary)]"
      style={{
        ...themeVars,
        ...fontVars,
        // Body-Text-Font auf den ganzen Shell — Headings (h1-h6) holen sich
        // global den heading-stack via globals.css.
        fontFamily: 'var(--brand-font-body, inherit)',
      }}
    >
      {fontHref && (
        // eslint-disable-next-line @next/next/no-css-tags
        <link rel="stylesheet" href={fontHref} />
      )}
      {/* Mobile overlay — ausgeblendet im Feldmodus */}
      {!isFeldmodus && sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* AAR-220: Sidebar nutzt Theme-Vars + sanfte 1.5s Transition für
          Background- und Border-Farben, damit Logo-Upload nicht ruckartig
          umschaltet. Im Feldmodus komplett ausgeblendet (Karte braucht
          vollen Viewport, Sidebar hat lg:z-[1100] > FeldmodusLayout z-50). */}
      {/* 2026-05-14: Im Floating-Mode wird die Sidebar `lg:fixed` damit der
          Main-Content sie unterläuft — erst dann hat backdrop-filter blur
          überhaupt Content zum Weichzeichnen (z. B. Map auf /heute). Im Bar-
          Mode bleibt sie `lg:relative` (Flex-Spalte, Solid-BG). */}
      {!isFeldmodus && <aside
        role="navigation"
        aria-label="Gutachter-Navigation"
        data-sidebar-mode={floatingMode ? 'floating' : 'bar'}
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:z-[1100] ${
          floatingMode ? 'lg:fixed' : 'lg:relative'
        } ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${floatingMode ? 'py-3 px-3 gap-3 bg-transparent' : ''}`}
        style={floatingMode ? {
          color: 'var(--brand-text-on-primary)',
          transition: 'transform 200ms ease',
          // Wrapper komplett transparent — Items haben eigene Glass-BG.
          // Hintergrund-Tönung kommt durch das Wrapping-div in der Shell (das
          // hat backgroundColor: var(--brand-primary)).
        } : {
          backgroundColor: 'var(--brand-sidebar-bg)',
          color: 'var(--brand-text-on-primary)',
          transition: 'transform 200ms ease',
        }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          {/* AAR-220: Wenn Custom-Branding aktiv → Logo OHNE Filter auf
              weißem rounded-Container damit farbige Logos echt aussehen.
              Sonst (Default Claimondo) → brightness/invert für SVG-Logo. */}
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <Link href="/gutachter">
                {useBrand ? (
                  <span className="inline-flex items-center justify-center bg-white rounded-ios-lg p-2 shadow-sm">
                    <img
                      src={logoUrl}
                      alt={firmenname ? `${firmenname} Logo` : 'Logo'}
                      className="h-8 w-auto max-w-32 object-contain"
                    />
                  </span>
                ) : (
                  <img
                    src={logoUrl}
                    alt="Claimondo Logo"
                    className="h-8 w-auto max-w-36 object-contain brightness-0 invert"
                  />
                )}
              </Link>
            ) : (
              <Link href="/gutachter" className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></Link>
            )}
            {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
            <TasksPill userId={userId} href="/gutachter/tasks" />
          </div>
          <p className="text-claimondo-light-blue text-xs mt-0.5">{firmenname ?? 'Gutachter-Portal'}</p>
        </div>

        {/* AAR-222: Gruppierte Nav mit Section-Headers + Badge-Counter
            für Aufträge / Nachrichten. 2026-05-14: Inaktive Items + Section-
            Headers in --brand-secondary („ondo"-Tönung) statt grau, kleiner
            (13px) und in der Brand-Heading-Schrift für konsistente Racing-/
            Auto-Anmutung. Active bleibt weiß für Hervorhebung. */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <p
                className="px-3 mb-1.5 text-[10px] uppercase tracking-wider font-semibold"
                style={{
                  color: 'var(--brand-sidebar-text)',
                  opacity: 0.6,
                  fontFamily: 'var(--brand-font-heading, inherit)',
                }}
              >
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ href, label, icon: Icon, badgeKey, beta }) => {
                  const active = isActive(href)
                  const badge = badgeKey ? badgeCounts[badgeKey] : 0
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-ios-xl text-[13px] font-medium ${
                        active ? 'text-white' : 'hover:bg-white/5'
                      }`}
                      style={{
                        backgroundColor: active ? 'var(--brand-secondary)' : undefined,
                        color: active ? '#FFFFFF' : 'var(--brand-sidebar-text)',
                        fontFamily: 'var(--brand-font-heading, inherit)',
                        transition: 'color 500ms ease',
                      }}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1 truncate">{label}</span>
                      {beta && (
                        <span
                          className="inline-flex items-center justify-center px-1.5 h-4 rounded text-[9px] font-bold uppercase tracking-wider bg-white/15 text-white/80 border border-white/20"
                          aria-label="Beta-Feature, in Entwicklung"
                        >
                          Beta
                        </span>
                      )}
                      {badge > 0 && (
                        <span
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-red-500 text-white"
                          aria-label={`${badge} neue ${label}`}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Hilfe & Support — Inline-Panel ersetzt Sidebar-Inhalt (gleiche Breite, kein Drawer) */}
        <SupportSidebarPanel
          open={showSupport}
          onClose={() => setShowSupport(false)}
          userName={displayName}
        />

        {/* 2026-05-14: Footer-Pill. Vorher nutzten H&S/Einstellungen/Abmelden
            `text-claimondo-navy`/`text-claimondo-light-blue` — die mappen aber
            auf var(--brand-primary)/var(--brand-accent), was bei knall-bunten
            Brands (KARpro-Gelb) auf weißem Button-BG unsichtbar wird. Fix:
            für den weißen H&S-Knopf hardcoded --brand-text-primary (immer
            dunkel laut Theme-Generator), für die Inverted-Links die gleiche
            "ondo"-Tönung wie die Nav-Items oben. */}
        <div className="mt-auto px-3 py-3 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-ios-xl text-xs font-medium bg-white hover:bg-claimondo-bg transition-colors"
            style={{ color: 'var(--brand-text-primary, #0D1B3E)' }}
            aria-label="Hilfe und Support öffnen"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Hilfe &amp; Support
          </button>
          <Link href="/gutachter/profil" onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-ios-xl hover:bg-white/5 transition-colors group">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent)',
                color: 'var(--brand-text-on-primary)',
              }}
            >
              {toInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{displayName}</p>
              <p
                className="text-xs"
                style={{ color: 'var(--brand-sidebar-text)' }}
              >
                Sachverständiger
              </p>
            </div>
            <UserIcon
              className="w-4 h-4 group-hover:text-white shrink-0"
              style={{ color: 'var(--brand-sidebar-text)' }}
            />
          </Link>
          {/* AAR-720: Einstellungen-Knopf unter Profil — Hub für Kalender,
              später weitere Konfigurations-Bereiche (Benachrichtigungen,
              2FA, etc.). */}
          <Link
            href="/gutachter/einstellungen"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-ios-xl text-xs font-medium hover:text-white hover:bg-white/5 transition-colors"
            style={{ color: 'var(--brand-sidebar-text)' }}
          >
            <SettingsIcon className="w-4 h-4" /> Einstellungen
          </Link>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-ios-xl text-xs font-medium hover:text-red-400 hover:bg-white/5 transition-colors"
            style={{ color: 'var(--brand-sidebar-text)' }}
          >
            <LogOutIcon className="w-4 h-4" /> Abmelden
          </button>
        </div>
      </aside>}

      <div
        className={`flex-1 flex flex-col min-w-0 h-screen ${
          floatingMode ? 'lg:pl-64' : ''
        }`}
      >
        {/* Mobile Header (nur Hamburger + Logo, Glocke ist im Wetter-Banner) */}
        {/* AAR-211 + AAR-220: Header nutzt Theme-Sidebar-Bg (gleicher Look wie
            Sidebar-Hintergrund) mit sanfter 1.5s Color-Transition. */}
        {/* 2026-05-14 Mobile-Cockpit-Header: schlanke Floating-Capsule statt
            klassischer top-Bar. Brand-Logo links, Updates-Glocke rechts.
            Hamburger entfällt — die neue Tab-Bar unten hat einen „Mehr"-Tab
            der den Drawer öffnet. */}
        <div
          className="lg:hidden fixed left-3 right-3 z-40 flex items-center justify-between gap-3"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg) 55%, transparent)',
            backdropFilter: 'saturate(180%) blur(22px)',
            WebkitBackdropFilter: 'saturate(180%) blur(22px)',
            border: '1px solid color-mix(in srgb, white 22%, transparent)',
            borderRadius: 22,
            padding: '8px 14px',
            color: 'var(--brand-text-on-primary)',
            boxShadow:
              '0 14px 36px color-mix(in srgb, var(--brand-sidebar-bg) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 25%, transparent)',
          }}
        >
          {logoUrl && useBrand ? (
            <Link href="/gutachter" className="inline-flex items-center justify-center bg-white rounded-ios-lg p-1 shadow-sm">
              <img
                src={logoUrl}
                alt={firmenname ? `${firmenname} Logo` : 'Logo'}
                className="h-6 w-auto max-w-28 object-contain"
              />
            </Link>
          ) : logoUrl ? (
            <Link href="/gutachter">
              <img
                src={logoUrl}
                alt="Claimondo Logo"
                className="h-6 w-auto max-w-28 object-contain brightness-0 invert"
              />
            </Link>
          ) : (
            <Link
              href="/gutachter"
              className="text-base font-bold tracking-tight"
              style={{ fontFamily: 'var(--brand-font-heading, inherit)' }}
            >
              <span className="text-white">Claim</span>
              <span style={{ color: 'var(--brand-sidebar-text, #7BA3CC)' }}>ondo</span>
            </Link>
          )}
          <UpdatesNav variant="dark" />
        </div>

        {/* Desktop: WeatherBanner als Section direkt unter Topbar mit Trailing-
            Slot (Outbox + UpdatesNav). Mobile: nicht hier rendern — die
            floating Header-Capsule führt UpdatesNav, und ein eigenes
            kompaktes Weather-Element (siehe unten) overlayed über der Map. */}
        <div className="hidden lg:block lg:pl-4 lg:pt-4">
          <WeatherBanner
            standortLat={standortLat ?? null}
            standortLng={standortLng ?? null}
            trailingSlot={
              <>
                <OutboxBadge />
                <UpdatesNav variant="dark" />
              </>
            }
          />
        </div>

        {/* Mobile-Wetter-Capsule: NUR auf /heute (Cockpit-Route). Auf List-
            Views (Aufträge, Fälle, Kalender) ist Wetter Kontext-Lärm. */}
        {isCockpitRoute && (
          <div
            className="lg:hidden fixed right-3 z-30 max-w-[60vw] pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 84px)' }}
          >
            <div className="pointer-events-auto">
              <WeatherBanner
                standortLat={standortLat ?? null}
                standortLng={standortLng ?? null}
                className="relative px-3 py-2 flex items-center gap-3 rounded-2xl border border-white/20 shadow-[0_14px_36px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]"
              />
            </div>
          </div>
        )}

        {/* 2026-05-14 Mobile-Cockpit-Refactor: auf Desktop bleibt der gerundete
            BG-Wrapper (Sidebar-Card-Look), auf Mobile (< lg) bekommt der Main
            keinerlei Chrome — Pages bleeden bis an die Viewport-Ränder, sodass
            die Karte auf /heute echt fullbleed wird und die neue Floating-
            Tab-Bar (unten) sowie der dünne Header (oben) als Glass-Layer
            darüber schweben. */}
        <div className="flex-1 lg:pl-4 lg:pt-4 lg:pb-4 overflow-hidden">
          <main
            id="main-content"
            role="main"
            className={`h-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+96px)] lg:pb-0 lg:rounded-l-2xl lg:rounded-r-none lg:bg-claimondo-bg lg:shadow-sm lg:p-4 ${
              isCockpitRoute ? '' : 'pt-[calc(env(safe-area-inset-top,0px)+76px)] px-3 lg:px-0 lg:pt-0'
            }`}
          >
            {children}
          </main>
        </div>

        {/* Mobile-Cockpit-Tab-Bar — primäre Navigation in 5 Glass-Tabs unten.
            Drawer öffnen via „Mehr"-Tab für Sekundär-Items (Abrechnung,
            Vertrag, Statistiken, Einstellungen, Abmelden). */}
        {!isFeldmodus && (
          <GutachterMobileTabBar
            onOpenDrawer={() => setSidebarOpen(true)}
            badges={{
              auftraege: badgeCounts.auftraege,
              kalender: badgeCounts.neueTermine,
            }}
          />
        )}
      </div>
      {/* AAR-864: Portal-Root für Modals im SV-Portal. position:fixed mit
          left=256px (Sidebar-Breite) damit der Backdrop nur den Content-
          Bereich überdeckt und die Sidebar nie einschließt. Modals
          portalieren hierhin (absolute inset-0) statt nach document.body —
          zuverlässiger als das CSS-Var-Pattern. pointer-events-none damit
          das leere Div keine Klicks abfängt; Backdrop-Kinder überschreiben
          das mit pointer-events-auto. */}
      {!isFeldmodus && (
        <div
          id="sv-modal-root"
          aria-hidden="true"
          className="fixed inset-y-0 right-0 z-[1000] pointer-events-none"
          style={{ left: '256px' }}
        />
      )}
      {!isFeldmodus && <GlobalPosteingangFab currentUserId={userId} />}
      {!isFeldmodus && <SVSpotlight />}
    </div>
    </MitteilungenProvider>
  )
}
