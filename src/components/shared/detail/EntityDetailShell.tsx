// P0 (Detail-View-Konsistenz): Geteiltes Chrome fuer Entity-Detail-Views.
// Verallgemeinert das Skelett von admin/sachverstaendige/[id] (Gold-Standard):
// Back-Link + PageHeader + Tab-Bar + Content mit optionaler Related-Sidebar.
//
// SERVER-Component MIT ABSICHT: die Tabs sind <Link>s (?tab=), kein Client-State.
// Dadurch kann die konsumierende Server-Page NUR die Daten des AKTIVEN Tabs laden
// (siehe SV-Detail: die Verifizierungs-Daten werden nur bei tab=verifizierung
// gequeryt). FallakteTabs (client, onTabChange, <button>) bleibt den Fallakte-
// Shells vorbehalten — anderes Paradigma, bewusst getrennt.
//
// Das Chrome ist bewusst 1:1 das heutige SV-Detail-Chrome (weisse Leiste +
// PageHeader + separate Tab-Zeile) => der SV-Refactor ist visuell net-zero.
// Header-Optik-Harmonisierung gehoert der portal-header-Lane (7ca8e37c).
//
// Rezept fuer neue Detail-Views: docs/superpowers/detail-view-recipe.md

import Link from 'next/link'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'

export type DetailTab = {
  /** Stabiler Key — wird gegen activeTab verglichen. */
  key: string
  label: string
  /** Vollstaendige Ziel-URL. Der Caller baut sie (funktioniert in Page UND Drawer). */
  href: string
  /** Optionaler Zaehler am Tab. */
  badgeCount?: number
}

export type EntityDetailShellProps = {
  title: string
  /** Meta-Zeile unter dem Titel (Badges, Email, Paket …). */
  description?: ReactNode
  /** Aktionen rechts im Header (Toggles, Dropdowns, Buttons). */
  actions?: ReactNode
  /** Zurueck-Link zur Liste. Nur in variant="page" gerendert. */
  backHref?: string
  backLabel?: string
  /** Weglassen => keine Tab-Bar (Single-View-Entities). */
  tabs?: readonly DetailTab[]
  activeTab?: string
  /** Optionale rechte Spalte (verwandte Entities: Faelle, Tasks …). */
  sidebar?: ReactNode
  /**
   * "page"   = Full-Page (sticky Header + Back-Link).
   * "drawer" = im DrawerShell gerendert — kein Back-Link, nicht sticky
   *            (der Drawer hat bereits Titelzeile + Close-Button).
   */
  variant?: 'page' | 'drawer'
  children: ReactNode
}

export default function EntityDetailShell({
  title,
  description,
  actions,
  backHref,
  backLabel = 'Übersicht',
  tabs,
  activeTab,
  sidebar,
  variant = 'page',
  children,
}: EntityDetailShellProps) {
  const isDrawer = variant === 'drawer'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className={`bg-white border-b border-claimondo-border shrink-0 px-4 py-3 ${
          isDrawer ? '' : 'sticky top-0 z-20'
        }`}
      >
        {!isDrawer && backHref ? (
          <Link
            href={backHref}
            className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors mb-1.5 inline-block"
          >
            &larr; {backLabel}
          </Link>
        ) : null}
        <PageHeader title={title} description={description} actions={actions} />
      </div>

      {/* ── Tab-Bar (nur wenn Tabs uebergeben) ─────────────────────── */}
      {tabs && tabs.length > 0 ? (
        <nav
          aria-label="Detail-Tabs"
          className="border-b border-claimondo-border bg-white shrink-0 px-4"
        >
          <div className="flex items-center gap-1 overflow-x-auto py-1.5">
            {tabs.map((tab) => {
              const active = tab.key === activeTab
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2 px-3.5 py-2 text-sm rounded-ios-lg transition-all whitespace-nowrap ${
                    active
                      ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                      : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                  }`}
                >
                  {tab.label}
                  {tab.badgeCount && tab.badgeCount > 0 ? (
                    <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 text-caption font-bold text-white bg-danger rounded-full">
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </nav>
      ) : null}

      {/* ── Content ‖ optionale Related-Sidebar ────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex min-w-0">
          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
          {sidebar ? (
            <aside className="w-[340px] shrink-0 border-l border-claimondo-border overflow-y-auto bg-claimondo-bg/30">
              {sidebar}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}
