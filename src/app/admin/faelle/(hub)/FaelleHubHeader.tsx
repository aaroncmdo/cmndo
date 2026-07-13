'use client'

// Fälle-Hub-Chrome: EIN Header-Block (Titel + shared RouteTabBar + aktiver-Tab-Untertitel).
// Ersetzt die handgerollte FaelleHubTabs. Tab-Map = Single-Source (Label/Icon/Untertitel/Href).
import { usePathname } from 'next/navigation'
import { List, Clock, BarChart3, Scale, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import RouteTabBar from '@/components/shared/RouteTabBar'
import { isRouteTabActive, type RouteTab } from '@/components/shared/route-tabs'

type HubTab = Omit<RouteTab, 'badge'> & { subtitle: string }

const HUB_TABS: readonly HubTab[] = [
  { href: '/admin/faelle', label: 'Liste', icon: List, exact: true, subtitle: 'Alle Fälle nach Phase.' },
  { href: '/admin/faelle/sla', label: 'SLA', icon: Clock, subtitle: 'Pipeline-Fristen ab SA-Unterschrift — Verletzungen und Risiko.' },
  { href: '/admin/faelle/statistiken', label: 'Statistiken', icon: BarChart3, subtitle: 'Kennzahlen, Kürzungsquoten und Benchmarks.' },
  { href: '/admin/faelle/kanzlei', label: 'Kanzlei-Board', icon: Scale, subtitle: 'Zugewiesene Kanzleien und LexDrive-Kommunikation.' },
  { href: '/admin/faelle/reklamationen', label: 'Reklamationen', icon: AlertCircle, subtitle: 'SV-Reklamationen prüfen und entscheiden.' },
]

export default function FaelleHubHeader({ offeneReklamationen }: { offeneReklamationen: number }) {
  const pathname = usePathname()
  const active = HUB_TABS.find((t) => isRouteTabActive(pathname, t.href, t.exact)) ?? HUB_TABS[0]
  const tabs: RouteTab[] = HUB_TABS.map((t) => ({
    href: t.href,
    label: t.label,
    icon: t.icon,
    exact: t.exact,
    badge:
      t.href === '/admin/faelle/reklamationen' && offeneReklamationen > 0
        ? offeneReklamationen
        : undefined,
  }))
  return (
    <PageHeader title="Fälle" size="lg">
      <RouteTabBar tabs={tabs} />
      <p className="mt-2 text-sm text-claimondo-ondo">{active.subtitle}</p>
    </PageHeader>
  )
}
