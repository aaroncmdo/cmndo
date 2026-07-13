// P0 (Detail-View-Konsistenz): Geteiltes Chrome fuer Entity-Detail-Views.
// Verallgemeinert das Skelett von admin/sachverstaendige/[id] (Gold-Standard):
// Back-Link + PageHeader + Tab-Bar. Der Content-Bereich bleibt frei — jeder Tab
// bringt sein eigenes Layout mit (das SV-Stammdaten-Tab z.B. ein 2-Spalten-
// Layout mit Related-Panel). Die Shell schreibt bewusst KEIN Content-Layout vor:
// das Related-Panel gehoert dem Tab, nicht der Shell.
//
// SERVER-Component MIT ABSICHT: die Tabs sind <Link>s (?tab=), kein Client-State.
// Dadurch kann die konsumierende Server-Page NUR die Daten des AKTIVEN Tabs laden
// (siehe SV-Detail: Verifizierungs- bzw. Abrechnungs-Daten werden nur gequeryt,
// wenn der jeweilige Tab aktiv ist). FallakteTabs (client, onTabChange, <button>)
// bleibt den Fallakte-Shells vorbehalten — anderes Paradigma, bewusst getrennt.
//
// Das Chrome ist 1:1 das heutige SV-Detail-Chrome => der SV-Refactor ist visuell
// net-zero. Header-Optik-Harmonisierung gehoert der portal-header-Lane (7ca8e37c).
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
  /**
   * "page"   = Full-Page (mit Back-Link zur Liste).
   * "drawer" = im DrawerShell gerendert — kein Back-Link, denn der Drawer liegt
   *            ueber der Liste und hat bereits Titelzeile + Close-Button.
   */
  variant?: 'page' | 'drawer'
  /**
   * Tab-Inhalt. Bringt sein eigenes Layout mit (i.d.R. ein `flex-1`-Wrapper,
   * damit er den Rest der Hoehe fuellt).
   */
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
  variant = 'page',
  children,
}: EntityDetailShellProps) {
  const isDrawer = variant === 'drawer'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4">
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
          className="border-b border-claimondo-border bg-white flex-shrink-0 px-4"
        >
          <div className="max-w-6xl mx-auto flex gap-1">
            {tabs.map((tab) => {
              const active = tab.key === activeTab
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-claimondo-ondo text-claimondo-shield'
                      : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy'
                  }`}
                >
                  {tab.label}
                  {tab.badgeCount && tab.badgeCount > 0 ? (
                    <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-caption font-bold text-white bg-danger rounded-full">
                      {tab.badgeCount > 99 ? '99+' : tab.badgeCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </nav>
      ) : null}

      {/* ── Tab-Content (bringt sein eigenes Layout mit) ───────────── */}
      {children}
    </div>
  )
}
