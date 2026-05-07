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
import OutboxBadge from '@/components/offline/OutboxBadge'
import { SupportSidebarPanel } from '@/components/support/SupportSidebarPanel'
import TasksPill from '@/components/shared/TasksPill'
import { CLAIMONDO_DEFAULT_THEME, type BrandTheme } from '@/lib/branding/theme'
import { generateCssVars } from '@/lib/branding/css-vars'
import { GlobalPosteingangFab } from '@/components/chat/GlobalPosteingangFab'
import SVSpotlight from './_components/SVSpotlight'
// 2026-05-06: WeatherBanner-Import entfernt — pro-Stop-Wetter ersetzt globalen Banner
import { toInitials } from '@/components/shared/KundeAvatar'
// CMM-36: Geo-Tracking startet beim App-Öffnen
import { useGeoPosition } from '@/hooks/useGeoPosition'
import { GeoPermissionPrompt } from '@/components/gutachter/GeoPermissionPrompt'

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
  // 2026-05-07 Design-Review: Beta-Pill am Nav-Item — signalisiert dass das
  // Feature noch in Entwicklung ist. Statistiken hat aktuell nur einen
  // Coming-Soon-Stub, soll aber als Roadmap-Hint sichtbar bleiben.
  beta?: boolean
}

type NavSection = {
  title: string
  items: NavItem[]
}

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
  // CMM-32-mapbox: /heute und /feldmodus laufen wieder im normalen Wrapper.
  // Map+Termine-Layout ist Sache der Page-Komponenten — Shell behandelt sie
  // wie jede andere Route (Sidebar links, navy-Outer drumherum, rounded-l-2xl
  // Content-Wrapper). Vorher: isFullscreenMap-Flag entfernte Padding/Rounded
  // und der Sidebar-Hide für Feldmodus überlagerte die Karte mit dem
  // FeldmodusLayout — beides gefiel Aaron nicht.
  const isFeldmodus = false
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  // CMM-36: Geo-Tracking beim App-Öffnen starten — feuert watchPosition
  // erst nach Permission 'granted'. Der Prompt wird per Klick auf den
  // GeoPermissionPrompt-Banner ausgeloest, nicht silent beim ersten Render.
  const geoState = useGeoPosition(svId ?? null)
  // AAR-245: Verwaltung nicht mehr collapsible — alle Sektionen flach +
  // direkt sichtbar, konsistent zu Tagesgeschäft/Kommunikation/Finanzen.
  // AAR-222: Sektions-basierte Nav. Team/Community werden conditional in
  // Verwaltung eingehängt.
  const NAV_SECTIONS: NavSection[] = NAV_SECTIONS_BASE.map(sec => {
    if (sec.title !== 'Verwaltung') return sec
    const conditional: NavItem[] = []
    if (showVerifizierung) conditional.push({ href: '/gutachter/verifizierung', label: 'Verifizierung', icon: ShieldCheckIcon })
    if (showTeam) conditional.push({ href: '/gutachter/team', label: 'Team', icon: UsersIcon })
    if (showCommunity) conditional.push({ href: '/gutachter/community', label: 'Community', icon: TrophyIcon })
    return { ...sec, items: [...sec.items, ...conditional] }
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

  // AAR-220 Fix 5: Einmalige 2s-Transition nach Logo-Upload.
  const [brandTransitioning, setBrandTransitioning] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const flag = localStorage.getItem('brand-just-changed')
    if (!flag) return
    // Flag löschen + Transition 2.5s aktiv halten (2s Transition + 0.5s Puffer).
    localStorage.removeItem('brand-just-changed')
    setBrandTransitioning(true)
    const t = setTimeout(() => setBrandTransitioning(false), 2500)
    return () => clearTimeout(t)
  }, [])
  const transitionStyle: React.CSSProperties = brandTransitioning
    ? { transition: 'background-color 2s ease, color 2s ease, border-color 2s ease' }
    : {}

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
    <div className="h-screen flex overflow-hidden" style={{ ...themeVars, backgroundColor: 'var(--brand-primary, #0D1B3E)' }}>
      {/* Mobile overlay — ausgeblendet im Feldmodus */}
      {!isFeldmodus && sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* AAR-220: Sidebar nutzt Theme-Vars + sanfte 1.5s Transition für
          Background- und Border-Farben, damit Logo-Upload nicht ruckartig
          umschaltet. Im Feldmodus komplett ausgeblendet (Karte braucht
          vollen Viewport, Sidebar hat lg:z-[1100] > FeldmodusLayout z-50). */}
      {!isFeldmodus && <aside
        role="navigation"
        aria-label="Gutachter-Navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:relative lg:z-[1100] overflow-hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: 'var(--brand-sidebar-bg)',
          color: 'var(--brand-text-on-primary)',
          // Transform-Transition (Sidebar-Slide) immer 200ms, Color-Transition
          // nur bei frischem Brand-Change (einmalig 2s).
          transition: brandTransitioning
            ? 'background-color 2s ease, color 2s ease, transform 200ms ease'
            : 'transform 200ms ease',
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
                  <span className="inline-flex items-center justify-center bg-white rounded-lg p-2 shadow-sm">
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
              <Link href="/gutachter" className="text-xl font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></Link>
            )}
            {/* AAR-723: Globale Tasks-Pill neben dem Logo. */}
            <TasksPill userId={userId} href="/gutachter/tasks" />
          </div>
          <p className="text-[#7BA3CC] text-xs mt-0.5">{firmenname ?? 'Gutachter-Portal'}</p>
        </div>

        {/* AAR-222: Gruppierte Nav mit Section-Headers + Badge-Counter
            für Aufträge / Nachrichten. */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map(section => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                        active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                      style={{
                        backgroundColor: active ? 'var(--brand-secondary)' : undefined,
                        transition: brandTransitioning
                          ? 'background-color 2s ease, color 500ms ease'
                          : 'color 500ms ease',
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

        <div className="mt-auto px-3 py-3 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium bg-white text-[#0D1B3E] hover:bg-[#f8f9fb] transition-colors"
            aria-label="Hilfe und Support öffnen"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Hilfe &amp; Support
          </button>
          <Link href="/gutachter/profil" onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor: 'var(--brand-accent)',
                color: 'var(--brand-text-on-primary)',
                ...transitionStyle,
              }}
            >
              {toInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{displayName}</p>
              <p className="text-[#7BA3CC] text-xs">Sachverständiger</p>
            </div>
            <UserIcon className="w-4 h-4 text-[#7BA3CC] group-hover:text-white shrink-0" />
          </Link>
          {/* AAR-720: Einstellungen-Knopf unter Profil — Hub für Kalender,
              später weitere Konfigurations-Bereiche (Benachrichtigungen,
              2FA, etc.). */}
          <Link
            href="/gutachter/einstellungen"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[#7BA3CC] hover:text-white hover:bg-white/5 transition-colors"
          >
            <SettingsIcon className="w-4 h-4" /> Einstellungen
          </Link>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-[#7BA3CC] hover:text-red-400 hover:bg-white/5 transition-colors">
            <LogOutIcon className="w-4 h-4" /> Abmelden
          </button>
        </div>
      </aside>}

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile Header (nur Hamburger + Logo, Glocke ist im Wetter-Banner) */}
        {/* AAR-211 + AAR-220: Header nutzt Theme-Sidebar-Bg (gleicher Look wie
            Sidebar-Hintergrund) mit sanfter 1.5s Color-Transition. */}
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 glass-branded shadow-ios-md"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--brand-sidebar-bg) 82%, transparent)',
            color: 'var(--brand-text-on-primary)',
            ...transitionStyle,
          }}
        >
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-white/70 hover:text-white transition-colors" aria-label="Menü öffnen">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {/* AAR-220 Audit: Mobile-Header zeigt branded Logo (mit weißem
              Container, ohne Filter) wenn Custom-Branding aktiv — sonst
              Claimondo-Schriftzug. Vorher war hier hardcoded "Claim ondo"
              auch für gebrandete SVs → Inkonsistenz Sidebar vs Mobile. */}
          {logoUrl && useBrand ? (
            <Link href="/gutachter" className="inline-flex items-center justify-center bg-white rounded-lg p-1.5 shadow-sm">
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
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          )}
          {/* AAR-252: Glocke im Mobile-Header — war vorher nur im Wetter-
              Banner, das aber bei SVs ohne standort_lat nicht rendert. */}
          <UpdatesNav variant="dark" />
        </header>

        {/* 2026-05-06: WeatherBanner entfernt + Action-Items free-floating.
            OutboxBadge + UpdatesNav schweben oben-rechts ohne Background-
            Wrapper. position:fixed pinnt sie an Viewport-Edge, z-20 damit
            sie über Main-Content rendern (Sidebar lg:z-[1100] ist drüber,
            Modale auch — passt). Hidden auf Mobile, da gibt's eine eigene
            Header-Bar (lg:hidden Mobile-Header oben). */}
        <div className="hidden lg:flex items-center gap-2 fixed top-3 right-4 z-20">
          <OutboxBadge />
          <UpdatesNav variant="dark" />
        </div>

        <div className="flex-1 overflow-hidden pl-2 sm:pl-3 lg:pl-4 pt-2 sm:pt-3 lg:pt-4 pb-2 sm:pb-3 lg:pb-4">
          <main
            id="main-content"
            role="main"
            className="h-full overflow-y-auto bg-[#f8f9fb] rounded-l-2xl rounded-r-none shadow-sm p-2 sm:p-3 lg:p-4"
          >
            {/* CMM-32 Polish: Standort-CTA — sichtbar wenn Browser-Permission
                noch 'prompt' oder 'denied' ist; sonst rendert null.
                2026-05-07: Banner steuert seine `mb-3` selbst, damit kein
                Wrapper-Whitespace bleibt wenn die Component null rendert. */}
            <GeoPermissionPrompt
              permission={geoState.permission}
              onRequest={geoState.requestPermission}
            />
            {children}
          </main>
        </div>
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
  )
}
