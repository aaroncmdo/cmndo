'use client'

// AAR-778: Migriert auf shared PortalNav (dark variant).
// Vorher: 187-Zeilen Self-Contained-Sidebar mit dupliziertem isActive + Item-Rendering.
// Jetzt: Thin Wrapper — nur Portal-spezifische Config (Items, Slots, Badges).

import {
  LayoutDashboardIcon, FolderOpenIcon, BadgeEuroIcon,
  CarFrontIcon, GitBranchIcon, CalendarIcon,
  UsersIcon, Building2Icon, SettingsIcon, ClipboardListIcon,
  FileSignatureIcon, ReceiptIcon, Code2Icon, ShieldCheckIcon,
  WrenchIcon, HandshakeIcon, ActivityIcon, Share2Icon, MessageSquareIcon,
  NewspaperIcon, NetworkIcon, LifeBuoyIcon, SparklesIcon, ShieldAlertIcon, UserPlusIcon,
} from 'lucide-react'
import { PortalUserFooter } from '@/components/shared/portal-nav/PortalUserFooter'
import TasksPill from '@/components/shared/TasksPill'
import { AdminNeueRueckrufeBadge } from '@/components/shared/NeueTermineBadge'
import { AdminAiVorschlaegeBadge } from '@/components/admin/AdminAiVorschlaegeBadge'
import { PortalNav, type PortalNavItem } from '@/components/shared/portal-nav'

const NAV_ITEMS: PortalNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboardIcon, exact: true },
  { href: '/dispatch/dashboard', label: 'Dispatch', icon: GitBranchIcon, external: true },
  { href: '/admin/faelle', label: 'Fälle', icon: FolderOpenIcon },
  { href: '/admin/aufgaben', label: 'Aufgaben', icon: ClipboardListIcon },
  { href: '/admin/ai-vorschlaege', label: 'KI-Vorschläge', icon: SparklesIcon },
  { href: '/admin/ki-aufsicht', label: 'KI-Aufsicht', icon: ShieldAlertIcon },
  { href: '/admin/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/admin/sachverstaendige', label: 'Sachverständige', icon: CarFrontIcon },
  { href: '/admin/partner', label: 'Partner', icon: Building2Icon },
  { href: '/admin/partner-leads', label: 'Partner-Leads', icon: UserPlusIcon },
  { href: '/admin/finance', label: 'Finanzen', icon: BadgeEuroIcon },
  { href: '/admin/embed-billing', label: 'Embed-Billing', icon: ReceiptIcon },
  { href: '/admin/embed-sites', label: 'Embed-Sites', icon: Code2Icon },
  { href: '/admin/marketing', label: 'Marketing', icon: Share2Icon },
  { href: '/admin/wissen-artikel', label: 'Wissen-Artikel', icon: NewspaperIcon },
  { href: '/admin/werkstaetten', label: 'Werkstätten', icon: WrenchIcon },
  { href: '/admin/makler', label: 'Makler', icon: HandshakeIcon },
  { href: '/admin/team', label: 'Team', icon: UsersIcon },
  { href: '/admin/vertraege', label: 'Vertragseditor', icon: FileSignatureIcon },
  { href: '/admin/kommentare', label: 'Kommentare', icon: MessageSquareIcon },
  { href: '/admin/community', label: 'Community', icon: NetworkIcon },
  { href: '/admin/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
  { href: '/admin/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
  { href: '/admin/health', label: 'Pipeline-Health', icon: ActivityIcon },
  // Route-Reachability-Audit 06.07.: /admin/support (Ansicht der von Usern gemeldeten
  // technischen Probleme, Tabelle technische_probleme) war gebaut, aber nirgends verlinkt —
  // es gab nur den SupportButton (Composer zum Melden), keinen Einstieg zur Ticket-Liste.
  { href: '/admin/support', label: 'Support-Tickets', icon: LifeBuoyIcon },
]

const MOBILE_HREFS = ['/admin', '/admin/faelle', '/admin/aufgaben', '/admin/kalender', '/admin/sachverstaendige']
const MOBILE_ITEMS = MOBILE_HREFS.map(h => NAV_ITEMS.find(i => i.href === h)!).filter(Boolean)

export default function AdminNav({
  email,
  initials,
  userId,
  meineTasksCount,
}: {
  email: string
  initials: string
  userId: string
  meineTasksCount?: number
}) {
  return (
    <PortalNav
      variant="dark"
      ariaLabel="Admin-Navigation"
      sections={[{ items: NAV_ITEMS }]}
      mobileItems={MOBILE_ITEMS}
      renderBadge={(item) => {
        if (item.label === 'Aufgaben' && (meineTasksCount ?? 0) > 0) {
          return (
            <span className="ml-auto bg-claimondo-ondo text-white text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
              {meineTasksCount! > 99 ? '99+' : meineTasksCount}
            </span>
          )
        }
        if (item.label === 'Kalender') {
          return <span className="ml-auto"><AdminNeueRueckrufeBadge /></span>
        }
        if (item.label === 'KI-Vorschläge') {
          return <span className="ml-auto"><AdminAiVorschlaegeBadge /></span>
        }
        return null
      }}
      headerSlot={
        <>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">Claim</span>
              <span className="text-claimondo-light-blue">ondo</span>
            </span>
            <TasksPill userId={userId} href="/admin/aufgaben/meine" initialCount={meineTasksCount ?? 0} />
          </div>
          <p className="text-xs mt-0.5 text-claimondo-light-blue">{email}</p>
        </>
      }
      footerSlot={
        <PortalUserFooter
          rolle="admin"
          supportUserName={email}
          initials={initials}
          primaryText={email}
        />
      }
    />
  )
}
